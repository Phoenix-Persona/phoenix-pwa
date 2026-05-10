/**
 * State-machine hook driving the Dashboard's video composer pipeline.
 *
 * Phases (in roughly the order they fire):
 *
 *   idle                 →  user hasn't started; dialog just opened
 *   preview-generating   →  grok-imagine-edit conditioned on the
 *                           persona's reference image
 *   preview-ready        →  preview blob URL is rendered; user can
 *                           regenerate or accept + pick duration
 *   uploading-seed       →  pushing the preview to Blossom so ppq.ai
 *                           can fetch it as the chain's grounding URL
 *   scripting            →  claude-sonnet-4.5 generates N segments
 *   clip-generating      →  for each segment: submit + poll seedance,
 *                           extract last frame, upload to Blossom,
 *                           feed forward as next image_url
 *   stitching            →  ffmpeg.wasm concats all clips → single MP4
 *   uploading-stitched   →  push stitched MP4 to Blossom
 *   captioning           →  claude-sonnet-4.5 drafts a kind 1 caption
 *   ready-to-post        →  show stitched <video> + editable caption
 *   publishing           →  signing + relay publish via usePersonaPublish
 *   done                 →  kind 1 is on relays
 *   error                →  message; pipeline is unwound
 *
 * The dialog reads `state.phase` plus phase-specific fields and renders
 * the matching step. Cancellation flows through `AbortController`s
 * managed inside the hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nip19 } from "nostr-tools";

import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { generateImage } from "@/lib/ppq/client";
import type { Persona } from "@/lib/persona";
import { buildPersonaPostTemplate } from "@/lib/personaPost";

import { generateCaption } from "@/lib/video/generateCaption";
import {
  generateMonologueScript,
  type ScriptSegment,
} from "@/lib/video/generateMonologueScript";
import { fmtBytes, fmtMs, verror, vlog } from "@/lib/video/log";
import { runChain, type ClipResult } from "@/lib/video/runChain";
import { stitchClips, type StitchProgress } from "@/lib/video/stitchClips";
import { extractUrlFromTags } from "@/lib/video/uploadBlobToBlossom";

import { usePersonaPublish } from "./usePersonaPublish";
import { usePpqAccount } from "./usePpqAccount";

const SEEDANCE_MODEL = "seedance-2-fast";
const SEEDANCE_ASPECT = "9:16" as const;
const SEEDANCE_QUALITY = "720p";
const SEGMENT_SECS = 10;

/**
 * Image model used for the preview/seed-frame generation.
 *
 * `gpt-image-1` returned 502 ("No providers available for this model")
 * for image_url i2i requests on ppq.ai — same provider_error shape we
 * hit on Veo's i2v route. `grok-imagine-edit` is the model the
 * `probe-image-gen-with-input-image.ts` cascade landed on as the
 * working image-edit primitive.
 */
const PREVIEW_IMAGE_MODEL = "grok-imagine-edit";

/** Same Seedance-friendly world block we use in the CLI tests. */
const WORLD_BLOCK_PREFIX =
  "Cinematic, photorealistic talking-head shot. Camera holds rock-steady at " +
  "eye level, medium close-up. 9:16 vertical, soft natural lighting, shallow " +
  "depth of field. The subject speaks directly into the camera in clear " +
  "language with measured conviction. Natural pauses between sentences. " +
  "Lip movements sync precisely with the spoken audio.";

export type GenerationPhase =
  | { type: "idle" }
  | { type: "preview-generating" }
  | { type: "preview-ready"; previewUrl: string }
  | { type: "uploading-seed"; previewUrl: string }
  | { type: "scripting"; previewUrl: string; seedImageUrl: string }
  | {
      type: "clip-generating";
      previewUrl: string;
      seedImageUrl: string;
      segments: ScriptSegment[];
      currentIndex: number;
      currentStatus?: string;
      completedClips: ClipResult[];
    }
  | {
      type: "stitching";
      segments: ScriptSegment[];
      completedClips: ClipResult[];
      ratio?: number;
    }
  | {
      type: "uploading-stitched";
      segments: ScriptSegment[];
      completedClips: ClipResult[];
    }
  | {
      type: "captioning";
      segments: ScriptSegment[];
      stitchedUrl: string;
    }
  | {
      type: "ready-to-post";
      segments: ScriptSegment[];
      stitchedUrl: string;
      captionDraft: string;
    }
  | { type: "publishing"; stitchedUrl: string }
  | { type: "done"; stitchedUrl: string; eventId: string }
  | { type: "error"; message: string; cause?: unknown };

export interface UseGenerateVideoPipelineArgs {
  persona: Persona;
  /** Idea text from the Dashboard "Idea" textarea. */
  idea: string;
  /** Optional sources (URLs) — go on the kind 1 as `r` tags. */
  sources?: string[];
  /** Optional style hints — passed to the script LLM. */
  hints?: string;
  /**
   * Persona's avatar URL — used as input to the grok-imagine-edit
   * preview so the generated face matches the established persona.
   */
  personaAvatarUrl?: string;
}

export interface UseGenerateVideoPipelineResult {
  phase: GenerationPhase;
  /** Step 1: generate or regenerate the preview image. */
  generatePreview: () => Promise<void>;
  /** Step 2: lock in duration and start the chain. */
  confirmAndGenerate: (totalDurationSecs: number) => Promise<void>;
  /** Step 4: publish the kind 1 with the user-edited caption. */
  publish: (editedCaption: string) => Promise<void>;
  /** Cancel any in-flight async; safe to call from "X" button. */
  cancel: () => void;
  /** Reset to idle (also revokes any preview blob URL we own). */
  reset: () => void;
}

export function useGenerateVideoPipeline(
  args: UseGenerateVideoPipelineArgs,
): UseGenerateVideoPipelineResult {
  const { persona, idea, sources, hints, personaAvatarUrl } = args;

  const { account, ensureAccount } = usePpqAccount();
  const upload = useUploadFile();
  const personaPublish = usePersonaPublish();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const [phase, setPhase] = useState<GenerationPhase>({ type: "idle" });
  const phaseRef = useRef(phase);
  // Mirror `phase` into a ref so async callbacks (which capture the
  // first render's `phase`) can read the latest value.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const abortRef = useRef<AbortController | null>(null);
  /** Object URLs we own and must revoke on cleanup. */
  const ownedObjectUrls = useRef<Set<string>>(new Set());

  const cleanupObjectUrls = useCallback(() => {
    for (const url of ownedObjectUrls.current) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
    ownedObjectUrls.current.clear();
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    cleanupObjectUrls();
    setPhase({ type: "idle" });
  }, [cancel, cleanupObjectUrls]);

  const fail = useCallback(
    (err: unknown) => {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        // User-initiated cancel — surface as idle, not error.
        vlog("pipeline", "cancelled by user");
        setPhase({ type: "idle" });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      verror("pipeline", "FAILED:", message, err);
      setPhase({ type: "error", message, cause: err });
    },
    [],
  );

  const generatePreview = useCallback(async (): Promise<void> => {
    cancel();
    cleanupObjectUrls();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    vlog("pipeline", "phase → preview-generating", {
      model: PREVIEW_IMAGE_MODEL,
      hasAvatar: Boolean(personaAvatarUrl),
      ideaLen: idea.length,
    });
    setPhase({ type: "preview-generating" });
    const t0 = Date.now();
    try {
      const acct = account ?? (await ensureAccount());
      vlog("pipeline", "preview: ppq account ready", {
        hasCreditId: Boolean(acct.credit_id),
        keyPrefix: acct.api_key.slice(0, 8) + "…",
      });
      const res = await generateImage(
        acct.api_key,
        {
          model: PREVIEW_IMAGE_MODEL,
          prompt: buildPreviewPrompt(persona, idea, hints),
          // Use the persona's avatar so the generated face matches.
          ...(personaAvatarUrl ? { image_url: personaAvatarUrl } : {}),
          size: "9:16",
          n: 1,
          output_format: "png",
        },
        { signal },
      );
      const previewUrl = res.data?.[0]?.url;
      if (!previewUrl) {
        throw new Error("Preview image generation returned no URL");
      }
      vlog(
        "pipeline",
        `preview ready in ${fmtMs(Date.now() - t0)}`,
        { previewUrl, cost: res.cost },
      );
      setPhase({ type: "preview-ready", previewUrl });
    } catch (err) {
      fail(err);
    }
  }, [
    account,
    cancel,
    cleanupObjectUrls,
    ensureAccount,
    fail,
    hints,
    idea,
    persona,
    personaAvatarUrl,
  ]);

  const confirmAndGenerate = useCallback(
    async (totalDurationSecs: number): Promise<void> => {
      const current = phaseRef.current;
      if (current.type !== "preview-ready") {
        return;
      }
      const previewUrl = current.previewUrl;

      if (!user) {
        fail(new Error("Sign in before generating video — Blossom uploads need your signer."));
        return;
      }

      cancel();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      const tStart = Date.now();
      vlog("pipeline", "phase → uploading-seed", {
        totalDurationSecs,
        segmentSecs: SEGMENT_SECS,
        previewUrl,
      });
      try {
        const acct = account ?? (await ensureAccount());

        // 1. Push the preview onto Blossom so ppq.ai can fetch it as
        // the seed conditioning image. The preview URL we have right
        // now is a ppq.ai signed URL — we re-upload to (a) make it
        // permanent for the chain and (b) own a stable URL we can
        // also use as the visible thumbnail.
        setPhase({ type: "uploading-seed", previewUrl });
        const tUpload = Date.now();
        const seedImageUrl = await fetchAndUploadAsBlossom({
          sourceUrl: previewUrl,
          filename: "preview-seed.png",
          mimeType: "image/png",
          uploadFn: (file) => upload.mutateAsync(file),
          signal,
        });
        vlog(
          "pipeline",
          `seed uploaded in ${fmtMs(Date.now() - tUpload)}`,
          { seedImageUrl },
        );

        // 2. Script.
        vlog("pipeline", "phase → scripting", {
          model: "claude-sonnet-4.5",
          numSegments: Math.ceil(totalDurationSecs / SEGMENT_SECS),
        });
        setPhase({ type: "scripting", previewUrl, seedImageUrl });
        const tScript = Date.now();
        const segments = await generateMonologueScript({
          apiKey: acct.api_key,
          persona,
          idea,
          sources,
          hints,
          totalDurationSecs,
          segmentSecs: SEGMENT_SECS,
          signal,
        });
        vlog(
          "pipeline",
          `script ready (${segments.length} segments) in ${fmtMs(Date.now() - tScript)}`,
          segments.map((s) => ({ label: s.label, words: s.dialog.split(/\s+/).length })),
        );

        // 3. Chain — submit clip, poll, extract last frame, upload,
        // feed into next clip's image_url. Each completed clip's MP4
        // is also kept in-memory for ffmpeg stitching at the end.
        vlog("pipeline", "phase → clip-generating (chain start)", {
          model: SEEDANCE_MODEL,
          numClips: segments.length,
        });
        setPhase({
          type: "clip-generating",
          previewUrl,
          seedImageUrl,
          segments,
          currentIndex: 0,
          completedClips: [],
        });
        const tChain = Date.now();
        const completedClips = await runChain({
          apiKey: acct.api_key,
          model: SEEDANCE_MODEL,
          seedImageUrl,
          segments,
          aspect: SEEDANCE_ASPECT,
          quality: SEEDANCE_QUALITY,
          worldBlock: WORLD_BLOCK_PREFIX,
          uploadFrame: async (blob, filename) => {
            const file = new File([blob], filename ?? "frame.png", {
              type: blob.type || "image/png",
            });
            const tags = await upload.mutateAsync(file);
            const url = extractUrlFromTags(tags);
            if (!url) {
              throw new Error("Blossom returned tags without a URL");
            }
            return url;
          },
          onPhase: (event) => {
            // Update the React state with each clip's progress.
            setPhase((prev) => {
              if (prev.type !== "clip-generating") return prev;
              if (event.type === "clip-submit") {
                return { ...prev, currentIndex: event.index, currentStatus: "submitted" };
              }
              if (event.type === "clip-poll") {
                return { ...prev, currentIndex: event.index, currentStatus: event.status };
              }
              if (event.type === "clip-done") {
                return {
                  ...prev,
                  currentIndex: event.index,
                  currentStatus: "completed",
                  completedClips: [...prev.completedClips, event.clip],
                };
              }
              if (event.type === "frame-extract") {
                return { ...prev, currentStatus: "extracting last frame" };
              }
              if (event.type === "frame-upload") {
                return { ...prev, currentStatus: "uploading frame to Blossom" };
              }
              return prev;
            });
          },
          signal,
        });

        vlog(
          "pipeline",
          `chain done (${completedClips.length} clips) in ${fmtMs(Date.now() - tChain)}`,
          completedClips.map((c, i) => ({
            i,
            url: c.url,
            blobBytes: fmtBytes(c.blob.size),
            cost: c.costUsd,
          })),
        );

        // 4. Stitch all clips into one MP4 via ffmpeg.wasm.
        const totalInputBytes = completedClips.reduce(
          (sum, c) => sum + c.blob.size,
          0,
        );
        vlog("pipeline", "phase → stitching", {
          numClips: completedClips.length,
          totalInputSize: fmtBytes(totalInputBytes),
        });
        setPhase({
          type: "stitching",
          segments,
          completedClips,
        });
        const tStitch = Date.now();
        const stitchedBlob = await stitchClips({
          clips: completedClips.map((c) => c.blob),
          onProgress: (p: StitchProgress) =>
            setPhase((prev) =>
              prev.type === "stitching"
                ? { ...prev, ratio: p.ratio }
                : prev,
            ),
          signal,
        });
        vlog(
          "pipeline",
          `stitched in ${fmtMs(Date.now() - tStitch)}`,
          { outputSize: fmtBytes(stitchedBlob.size) },
        );

        // 5. Upload the stitched MP4 to Blossom.
        vlog("pipeline", "phase → uploading-stitched");
        setPhase({
          type: "uploading-stitched",
          segments,
          completedClips,
        });
        const stitchedFile = new File([stitchedBlob], "stitched.mp4", {
          type: "video/mp4",
        });
        const tUploadStitched = Date.now();
        const stitchedTags = await upload.mutateAsync(stitchedFile);
        const stitchedUrl = extractUrlFromTags(stitchedTags);
        if (!stitchedUrl) {
          verror("pipeline", "blossom returned no url tag", { stitchedTags });
          throw new Error(
            "Blossom upload of stitched MP4 returned tags without a URL",
          );
        }
        vlog(
          "pipeline",
          `stitched uploaded in ${fmtMs(Date.now() - tUploadStitched)}`,
          { stitchedUrl },
        );

        // 6. Draft a caption.
        vlog("pipeline", "phase → captioning");
        setPhase({ type: "captioning", segments, stitchedUrl });
        const tCaption = Date.now();
        const captionDraft = await generateCaption({
          apiKey: acct.api_key,
          persona,
          idea,
          sources,
          segments,
          signal,
        });
        vlog(
          "pipeline",
          `caption draft (${captionDraft.length} chars) in ${fmtMs(Date.now() - tCaption)}`,
        );

        vlog(
          "pipeline",
          `phase → ready-to-post · total elapsed ${fmtMs(Date.now() - tStart)}`,
        );
        setPhase({
          type: "ready-to-post",
          segments,
          stitchedUrl,
          captionDraft,
        });
      } catch (err) {
        fail(err);
      }
    },
    [
      account,
      cancel,
      ensureAccount,
      fail,
      hints,
      idea,
      persona,
      sources,
      upload,
      user,
    ],
  );

  const publish = useCallback(
    async (editedCaption: string): Promise<void> => {
      const current = phaseRef.current;
      if (current.type !== "ready-to-post") return;
      const { stitchedUrl } = current;

      try {
        vlog("pipeline", "phase → publishing", {
          captionLen: editedCaption.length,
          stitchedUrl,
          numTags: persona.tags.length,
          numSources: sources?.length ?? 0,
        });
        setPhase({ type: "publishing", stitchedUrl });
        const template = buildPersonaPostTemplate({
          text: editedCaption,
          tags: persona.tags,
          sources,
          media: { url: stitchedUrl, mimeType: "video/mp4" },
        });
        const tPublish = Date.now();
        const event = await personaPublish.mutateAsync({
          personaNsec: persona.nsec,
          template,
        });
        vlog(
          "pipeline",
          `phase → done · published in ${fmtMs(Date.now() - tPublish)}`,
          { eventId: event.id },
        );
        setPhase({ type: "done", stitchedUrl, eventId: event.id });
        toast({
          title: "Posted",
          description:
            "Live on relays as " +
            nip19.noteEncode(event.id).slice(0, 16) +
            "…",
        });
      } catch (err) {
        fail(err);
      }
    },
    [fail, persona, personaPublish, sources, toast],
  );

  return useMemo<UseGenerateVideoPipelineResult>(
    () => ({
      phase,
      generatePreview,
      confirmAndGenerate,
      publish,
      cancel,
      reset,
    }),
    [phase, generatePreview, confirmAndGenerate, publish, cancel, reset],
  );
}

/* ---------- helpers ---------- */

function buildPreviewPrompt(
  persona: Persona,
  idea: string,
  hints?: string,
): string {
  const tone = persona.tone ?? "";
  const hintLine = hints?.trim() ? `\n\nStyle hints: ${hints.trim()}` : "";
  return [
    `A photorealistic 9:16 portrait of a person matching the input image.`,
    `The portrait will be used as the SEED FRAME for a series of`,
    `talking-head video clips, so the framing must work as a still.`,
    ``,
    `Setting: a calm home office with soft natural light from a window`,
    `to the subject's left. Medium close-up, eye-level camera.`,
    ``,
    `Subject is the persona "${persona.name}". Persona description:`,
    persona.bio?.trim() || persona.system_prompt.slice(0, 400),
    ``,
    `The persona is recording a video on this topic:`,
    idea.trim(),
    ``,
    tone ? `Tone: ${tone}` : "",
    hintLine,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Fetch a remote image (e.g. ppq.ai's signed image-gen URL) and
 * re-upload its bytes to Blossom so we own a stable URL the chain
 * can use as `image_url` without worrying about TTL expiry.
 */
async function fetchAndUploadAsBlossom(args: {
  sourceUrl: string;
  filename: string;
  mimeType: string;
  uploadFn: (file: File) => Promise<string[][]>;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch(args.sourceUrl, { signal: args.signal });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch source for Blossom upload (${res.status}): ${args.sourceUrl}`,
    );
  }
  const blob = await res.blob();
  const file = new File([blob], args.filename, { type: args.mimeType });
  const tags = await args.uploadFn(file);
  const url = extractUrlFromTags(tags);
  if (!url) {
    throw new Error(
      "Blossom upload returned tags without a URL: " + JSON.stringify(tags),
    );
  }
  return url;
}
