/**
 * Browser-side i2v chain orchestrator.
 *
 * Mirrors the proven CLI pipeline at
 * `tests/ai-services/test-i2v-chain-rwandan-english-paced.ts`, but with:
 *   - canvas-based last-frame extraction (no ffmpeg)
 *   - Blossom upload via the user's signer (no public file hosts)
 *   - injectable hooks for upload + frame-grab so the pure pipeline
 *     stays unit-testable and the React layer can swap in mocks.
 *
 * Pure async — no React, no DOM assumptions besides those already
 * inside `extractLastFrame`. Phase callbacks let the React layer drive
 * a progress UI without coupling to the orchestrator's internals.
 */

import {
  getVideoStatus,
  submitVideo,
} from "@/lib/ppq/client";

import { fmtBytes, fmtMs, vlog, vwarn } from "./log";
import type { ScriptSegment } from "./generateMonologueScript";

export interface ClipResult {
  id: string;
  url: string;
  costUsd?: number;
  blob: Blob;
}

export type ChainPhase =
  | { type: "clip-submit"; index: number; total: number; segment: ScriptSegment }
  | { type: "clip-poll"; index: number; total: number; status: string }
  | { type: "clip-done"; index: number; total: number; clip: ClipResult }
  | { type: "frame-extract"; index: number; total: number }
  | { type: "frame-upload"; index: number; total: number };

export interface RunChainArgs {
  apiKey: string;
  model: string;
  /** Initial conditioning image. */
  seedImageUrl: string;
  segments: ScriptSegment[];
  /** Common per-clip params. */
  aspect: "9:16" | "16:9" | "1:1";
  quality: string;
  /** Optional world block prepended to every segment's dialog. */
  worldBlock?: string;
  /**
   * Caller-provided uploader for the extracted last frame. Returns the
   * URL the next clip should use as `image_url`. Pass the result of
   * `useBlobUploader().uploadBlob`.
   */
  uploadFrame: (blob: Blob, filename?: string) => Promise<string>;
  /**
   * Caller-provided frame-grab. Defaults to the canvas-based
   * `extractLastFrame` helper, but exposed as a knob for tests.
   */
  extractFrame?: (videoUrl: string, signal?: AbortSignal) => Promise<Blob>;
  /** Phase emitter for the React progress UI. */
  onPhase?: (phase: ChainPhase) => void;
  /**
   * Persistence hook. Fired after every clip completes AND after every
   * frame upload — the two natural checkpoints where work would be
   * lost on a crash. The caller writes to IndexedDB.
   */
  onCheckpoint?: (cp: ChainCheckpoint) => void | Promise<void>;
  /**
   * Resume from a prior run. `clips` are the already-completed clip
   * results to skip; `nextImageUrl` is the uploaded frame URL to feed
   * into the *next* clip. If `nextImageUrl` is unset but clips exist,
   * we re-extract from the last clip's blob.
   */
  resumeFrom?: { clips: ClipResult[]; nextImageUrl?: string };
  /** Cancel the chain at the next safe boundary. */
  signal?: AbortSignal;
}

export type ChainCheckpoint =
  | { kind: "clip-done"; clips: ClipResult[] }
  | { kind: "frame-uploaded"; clips: ClipResult[]; nextImageUrl: string };

/** Defaults proven on ppq.ai's seedance-2-fast route. */
const DEFAULT_DURATION = 10;
const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 12 * 60 * 1_000;

export async function runChain(args: RunChainArgs): Promise<ClipResult[]> {
  const {
    apiKey,
    model,
    segments,
    aspect,
    quality,
    worldBlock,
    uploadFrame,
    onPhase,
    onCheckpoint,
    resumeFrom,
    signal,
  } = args;
  const extract = args.extractFrame ?? defaultExtractFrame;

  const results: ClipResult[] = resumeFrom?.clips ? [...resumeFrom.clips] : [];
  const startIndex = results.length;
  let currentImageUrl = args.seedImageUrl;

  vlog("chain", `start: ${segments.length} clips on ${model}`, {
    aspect,
    quality,
    seedImageUrl: args.seedImageUrl,
    resumeFromIndex: startIndex,
    hasNextImageUrl: Boolean(resumeFrom?.nextImageUrl),
  });

  // Re-emit done events for already-completed clips so the UI catches
  // up on its progress markers when resuming.
  for (let j = 0; j < startIndex; j++) {
    onPhase?.({
      type: "clip-done",
      index: j,
      total: segments.length,
      clip: results[j],
    });
  }

  // If resuming and we already have the next-clip's image URL from a
  // prior frame upload, use it. Otherwise if we have clips but no
  // uploaded frame (chain crashed *during* frame extract/upload),
  // re-extract from the last clip's blob below.
  if (resumeFrom?.nextImageUrl) {
    currentImageUrl = resumeFrom.nextImageUrl;
  } else if (startIndex > 0 && startIndex < segments.length) {
    const lastClip = results[startIndex - 1];
    vlog("chain", `resume: re-extracting frame from clip ${startIndex}/${segments.length}`);
    onPhase?.({
      type: "frame-extract",
      index: startIndex - 1,
      total: segments.length,
    });
    const objectUrl = URL.createObjectURL(lastClip.blob);
    try {
      const frameBlob = await extract(objectUrl, signal);
      onPhase?.({
        type: "frame-upload",
        index: startIndex - 1,
        total: segments.length,
      });
      currentImageUrl = await uploadFrame(frameBlob, `frame-${startIndex}.png`);
      vlog("chain", `resume: frame re-uploaded`, { url: currentImageUrl });
      await onCheckpoint?.({
        kind: "frame-uploaded",
        clips: [...results],
        nextImageUrl: currentImageUrl,
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  for (let i = startIndex; i < segments.length; i++) {
    if (signal?.aborted) throw abortError();
    const segment = segments[i];
    const clipNum = `${i + 1}/${segments.length}`;
    const tClip = Date.now();

    vlog("chain", `clip ${clipNum} submitting`, {
      model,
      label: segment.label,
      duration: segment.duration ?? DEFAULT_DURATION,
      conditioningImage: currentImageUrl,
      dialogPreview: segment.dialog.slice(0, 100),
    });
    onPhase?.({
      type: "clip-submit",
      index: i,
      total: segments.length,
      segment,
    });

    const prompt = worldBlock
      ? `${worldBlock}\n\n${segment.dialog}`
      : segment.dialog;

    const submitted = await submitVideo(
      apiKey,
      {
        model,
        prompt,
        aspect_ratio: aspect,
        duration: segment.duration ?? DEFAULT_DURATION,
        quality,
        image_url: currentImageUrl,
      },
      { signal },
    );
    vlog("chain", `clip ${clipNum} submitted`, {
      jobId: submitted.id,
      estimatedCost: submitted.estimated_cost,
    });

    const completed = await pollUntilDone({
      apiKey,
      jobId: submitted.id,
      signal,
      onStatus: (status) => {
        vlog("chain", `clip ${clipNum} status: ${status}`);
        onPhase?.({
          type: "clip-poll",
          index: i,
          total: segments.length,
          status,
        });
      },
    });
    vlog("chain", `clip ${clipNum} completed`, {
      url: completed.url,
      cost: completed.cost,
    });

    // Fetch the MP4 bytes once — they get used for both the next
    // segment's frame grab AND the final ffmpeg.wasm stitch.
    const tDownload = Date.now();
    const blob = await fetchBlob(completed.url, signal);
    vlog(
      "chain",
      `clip ${clipNum} mp4 downloaded in ${fmtMs(Date.now() - tDownload)}`,
      { size: fmtBytes(blob.size) },
    );

    const result: ClipResult = {
      id: submitted.id,
      url: completed.url,
      costUsd: completed.cost ?? submitted.estimated_cost,
      blob,
    };
    results.push(result);
    onPhase?.({
      type: "clip-done",
      index: i,
      total: segments.length,
      clip: result,
    });
    await onCheckpoint?.({ kind: "clip-done", clips: [...results] });
    vlog(
      "chain",
      `clip ${clipNum} end-to-end in ${fmtMs(Date.now() - tClip)}`,
    );

    // If this isn't the last clip, prepare the next conditioning image
    // by extracting + uploading the last frame.
    if (i < segments.length - 1) {
      vlog("chain", `clip ${clipNum} extracting last frame for next clip`);
      onPhase?.({
        type: "frame-extract",
        index: i,
        total: segments.length,
      });
      // Pass the downloaded Blob's object URL so we don't pay the
      // network cost twice. The browser handles the same-origin
      // canvas tainting issue when the source is an object URL.
      const objectUrl = URL.createObjectURL(blob);
      try {
        const tFrame = Date.now();
        const frameBlob = await extract(objectUrl, signal);
        vlog(
          "chain",
          `frame extracted in ${fmtMs(Date.now() - tFrame)}`,
          { size: fmtBytes(frameBlob.size) },
        );
        onPhase?.({
          type: "frame-upload",
          index: i,
          total: segments.length,
        });
        const tUpload = Date.now();
        currentImageUrl = await uploadFrame(
          frameBlob,
          `frame-${i + 1}.png`,
        );
        vlog(
          "chain",
          `frame uploaded in ${fmtMs(Date.now() - tUpload)}`,
          { url: currentImageUrl },
        );
        await onCheckpoint?.({
          kind: "frame-uploaded",
          clips: [...results],
          nextImageUrl: currentImageUrl,
        });
      } catch (err) {
        vwarn(
          "chain",
          `clip ${clipNum} frame-extract/upload failed:`,
          err,
        );
        throw err;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  vlog("chain", `chain complete: ${results.length} clips`);
  return results;
}

async function fetchBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`runChain: clip mp4 fetch failed ${res.status}`);
  }
  return res.blob();
}

async function pollUntilDone(args: {
  apiKey: string;
  jobId: string;
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
}): Promise<{ url: string; cost?: number }> {
  const { apiKey, jobId, signal, onStatus } = args;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last = "";

  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortError();
    const status = await getVideoStatus(apiKey, jobId, { signal });
    if (status.status !== last) {
      last = status.status;
      onStatus?.(String(status.status));
    }
    if (status.status === "completed") {
      const url = status.data?.url;
      if (!url) throw new Error("runChain: completed without url");
      return { url, cost: status.cost };
    }
    if (status.status === "failed") {
      throw new Error(status.error ?? "video generation failed");
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`runChain: video polling timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

async function defaultExtractFrame(
  videoUrl: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const { extractLastFrame } = await import("./extractLastFrame");
  return extractLastFrame(videoUrl, { signal });
}

function abortError(): DOMException {
  return new DOMException("runChain aborted", "AbortError");
}
