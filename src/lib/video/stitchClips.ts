/**
 * Stitch N MP4 Blobs into a single MP4 Blob using ffmpeg.wasm.
 *
 * Loads the ffmpeg.wasm core lazily on first call (memoized) and uses
 * the standard `concat demuxer` approach:
 *
 *   ffmpeg \
 *     -f concat -safe 0 -i list.txt \
 *     -c copy out.mp4
 *
 * `-c copy` means no transcoding — the streams are remuxed bit-for-bit
 * from each input into the output container. This is fast (seconds for
 * a minute of footage) and lossless. It only works when every input
 * has the same codec / resolution / framerate / audio params, which is
 * true when every clip came from the same Seedance model with the same
 * aspect / duration / quality.
 *
 * If the inputs ever diverge (mixed-model chain, ratio change), this
 * will fail and we'd switch to a re-encode path. Logged as a TODO; for
 * Phoenix's singleton-model pipeline, copy is correct.
 */

import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

/**
 * Same-origin paths for the ffmpeg.wasm core. The files are copied
 * from `@ffmpeg/core/dist/umd/` into `public/ffmpeg/` by the
 * `postinstall` script, so they're served verbatim from our origin
 * at /ffmpeg/.
 *
 * We don't import these via Vite — `public/` assets are deliberately
 * outside the module graph. Instead we let `@ffmpeg/util.toBlobURL()`
 * fetch them at runtime and hand the worker a same-origin `blob:` URL
 * for `importScripts`. This is the pattern documented by the @ffmpeg
 * team and avoids:
 *   - Vite's "should not be imported from source code" error for
 *     `public/` paths
 *   - cross-origin CSP `script-src` allowances
 *   - COEP-credentialless interactions with unpkg
 *   - bundler-specific worker resolution edge cases
 */
const FFMPEG_CORE_JS = "/ffmpeg/ffmpeg-core.js";
const FFMPEG_CORE_WASM = "/ffmpeg/ffmpeg-core.wasm";

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

export interface StitchProgress {
  /** "loading" while ffmpeg.wasm is initializing; "stitching" while running. */
  phase: "loading" | "stitching";
  /** 0..1 progress for the current phase. May be undefined if unknown. */
  ratio?: number;
}

export interface StitchClipsArgs {
  clips: Blob[];
  /** Optional progress callback fired during ffmpeg work. */
  onProgress?: (p: StitchProgress) => void;
  /** Abort the operation. ffmpeg.wasm itself doesn't natively cancel,
   *  but we honor the signal at phase boundaries. */
  signal?: AbortSignal;
}

async function loadFFmpeg(
  onProgress?: (p: StitchProgress) => void,
): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    onProgress?.({ phase: "loading", ratio: 0 });
    // Lazy-import the FFmpeg class so the ~30 MB WASM core only ships
    // for users who actually generate video.
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpeg();
    // Fetch the same-origin core files and convert to blob: URLs. The
    // worker imports the blob URL via `importScripts`, which works
    // reliably under our CSP (`script-src` includes `blob:`) and
    // doesn't go through Vite's import pipeline.
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(FFMPEG_CORE_JS, "text/javascript"),
      toBlobURL(FFMPEG_CORE_WASM, "application/wasm"),
    ]);
    await ffmpeg.load({ coreURL, wasmURL });
    onProgress?.({ phase: "loading", ratio: 1 });
    ffmpegSingleton = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadPromise;
  } catch (err) {
    ffmpegLoadPromise = null;
    throw err;
  }
}

export async function stitchClips(args: StitchClipsArgs): Promise<Blob> {
  const { clips, onProgress, signal } = args;
  if (clips.length === 0) {
    throw new Error("stitchClips: no clips supplied");
  }
  if (signal?.aborted) {
    throw new DOMException("stitchClips aborted", "AbortError");
  }

  const ffmpeg = await loadFFmpeg(onProgress);
  if (signal?.aborted) {
    throw new DOMException("stitchClips aborted", "AbortError");
  }

  // Wire ffmpeg's progress events to the caller's callback for the
  // stitching phase.
  const progressHandler = (data: { progress: number }) => {
    onProgress?.({ phase: "stitching", ratio: data.progress });
  };
  ffmpeg.on("progress", progressHandler);

  try {
    onProgress?.({ phase: "stitching", ratio: 0 });

    // 1. Write each clip into ffmpeg's virtual filesystem.
    const inputNames: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const name = `in-${i}.mp4`;
      inputNames.push(name);
      await ffmpeg.writeFile(name, await fetchFile(clips[i]));
    }

    // 2. Write the concat demuxer's manifest.
    const manifest = inputNames.map((n) => `file '${n}'`).join("\n") + "\n";
    await ffmpeg.writeFile(
      "list.txt",
      new TextEncoder().encode(manifest),
    );

    // 3. Run the concat demuxer. -safe 0 lets us reference plain
    // filenames; -c copy avoids transcoding (only valid when all
    // inputs share codec/resolution — true for our singleton-model
    // chain).
    const outName = "out.mp4";
    await ffmpeg.exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-c",
      "copy",
      outName,
    ]);

    if (signal?.aborted) {
      throw new DOMException("stitchClips aborted", "AbortError");
    }

    // 4. Read the result back as a Blob.
    const outBytes = (await ffmpeg.readFile(outName)) as Uint8Array;
    // Browser File constructor wants a real ArrayBuffer-backed view —
    // copy into a fresh ArrayBuffer to avoid any SharedArrayBuffer
    // edge cases when ffmpeg.wasm is built with threading.
    const buffer = new ArrayBuffer(outBytes.byteLength);
    new Uint8Array(buffer).set(outBytes);
    return new Blob([buffer], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    // Best-effort cleanup of the virtual FS so a long session doesn't
    // leak memory across multiple stitches.
    for (let i = 0; i < clips.length; i++) {
      await ffmpeg
        .deleteFile(`in-${i}.mp4`)
        .catch(() => undefined);
    }
    await ffmpeg.deleteFile("list.txt").catch(() => undefined);
    await ffmpeg.deleteFile("out.mp4").catch(() => undefined);
  }
}
