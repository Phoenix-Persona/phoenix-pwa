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
  /** Cancel the chain at the next safe boundary. */
  signal?: AbortSignal;
}

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
    signal,
  } = args;
  const extract = args.extractFrame ?? defaultExtractFrame;

  const results: ClipResult[] = [];
  let currentImageUrl = args.seedImageUrl;

  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) throw abortError();
    const segment = segments[i];

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

    const completed = await pollUntilDone({
      apiKey,
      jobId: submitted.id,
      signal,
      onStatus: (status) =>
        onPhase?.({
          type: "clip-poll",
          index: i,
          total: segments.length,
          status,
        }),
    });

    // Fetch the MP4 bytes once — they get used for both the next
    // segment's frame grab AND the final ffmpeg.wasm stitch.
    const blob = await fetchBlob(completed.url, signal);
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

    // If this isn't the last clip, prepare the next conditioning image
    // by extracting + uploading the last frame.
    if (i < segments.length - 1) {
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
        const frameBlob = await extract(objectUrl, signal);
        onPhase?.({
          type: "frame-upload",
          index: i,
          total: segments.length,
        });
        currentImageUrl = await uploadFrame(
          frameBlob,
          `frame-${i + 1}.png`,
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

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
