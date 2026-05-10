/**
 * Layer a soft background music bed over an already-stitched MP4.
 *
 * Runs as a second, independent ffmpeg.wasm pass after `stitchClips()`
 * has produced the bare concat output. Splitting concat from music
 * mixing keeps each pass simple, lets the chain checkpoint between
 * them, and matches the shape of the test script at
 * `tests/video/mix-background-music.ts`.
 *
 * Filtergraph (proven in the test script):
 *
 *   [0:a] volume=<voice>                                 → [vox]
 *   [1:a] volume=<music>, aloop=loop=-1:size=2e9         → [bg]
 *   [vox][bg] amix=inputs=2:duration=first
 *                  :dropout_transition=0:normalize=0     → [a]
 *
 *   ffmpeg -i video.mp4 -i music.mp3
 *          -filter_complex <above>
 *          -map 0:v -map "[a]"
 *          -c:v copy -c:a aac -b:a 192k
 *          -movflags +faststart -shortest
 *          out.mp4
 *
 * Why each knob:
 *   - `volume=<music>` — drop music to ~10% so the persona's voice
 *     stays dominant.
 *   - `aloop=-1:size=2e9` — infinite-loop the music in case the
 *     stitched video is longer than the bed (the catalog's tracks
 *     are 30s; chains can run 90s+).
 *   - `duration=first` on `amix` — output length pinned to the FIRST
 *     input (the voice), so the loop auto-truncates.
 *   - `normalize=0` — without this, amix re-balances and undoes our
 *     explicit gain levels.
 *   - `-c:v copy` — don't re-encode video; instant and lossless.
 *   - `-c:a aac -b:a 192k` — re-encode mixed audio (the filter
 *     output isn't pass-throughable) at a transparent bitrate.
 *   - `+faststart` — moves the moov atom to the front so the result
 *     streams cleanly when uploaded to Blossom.
 *
 * On music fetch / mix failure, the caller should fall back to the
 * un-mixed stitched blob (we throw, caller decides). This keeps the
 * pipeline robust against host-side CORS or transient ffmpeg blips.
 */

import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

/**
 * Same-origin paths for the ffmpeg.wasm core, mirrored from
 * `stitchClips.ts`. We deliberately keep our OWN copy of the loader
 * singleton here instead of sharing a module with stitchClips so the
 * existing stitch path is byte-identical to what shipped to prod —
 * this file is purely additive.
 *
 * Vite's `public/` policy forbids importing `/public/` paths through
 * the module graph, so we let `@ffmpeg/util.toBlobURL()` fetch them
 * at runtime and hand the worker a same-origin `blob:` URL.
 */
const FFMPEG_CORE_JS = "/ffmpeg/ffmpeg-core.js";
const FFMPEG_CORE_WASM = "/ffmpeg/ffmpeg-core.wasm";

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;
  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpeg();
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(FFMPEG_CORE_JS, "text/javascript"),
      toBlobURL(FFMPEG_CORE_WASM, "application/wasm"),
    ]);
    await ffmpeg.load({ coreURL, wasmURL });
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

export interface AddBackgroundMusicArgs {
  /** The voice-only stitched MP4 produced by `stitchClips()`. */
  videoBlob: Blob;
  /** Music URL — fetched and dropped onto ffmpeg's vfs. */
  musicUrl: string;
  /** Music gain — 0..2. Default 0.1 (the empirically-locked level). */
  musicVolume?: number;
  /** Voice gain — 0..2. Default 1.0. */
  voiceVolume?: number;
  /** Optional progress callback fired during the ffmpeg run. */
  onProgress?: (p: { phase: "mixing"; ratio?: number }) => void;
  /** Honored at phase boundaries; ffmpeg.wasm doesn't natively cancel. */
  signal?: AbortSignal;
}

const DEFAULT_MUSIC_VOLUME = 0.1;
const DEFAULT_VOICE_VOLUME = 1.0;
const VIDEO_FILENAME = "stitched.mp4";
const OUT_FILENAME = "with-music.mp4";

export async function addBackgroundMusic(
  args: AddBackgroundMusicArgs,
): Promise<Blob> {
  const {
    videoBlob,
    musicUrl,
    musicVolume = DEFAULT_MUSIC_VOLUME,
    voiceVolume = DEFAULT_VOICE_VOLUME,
    onProgress,
    signal,
  } = args;

  if (signal?.aborted) {
    throw new DOMException("addBackgroundMusic aborted", "AbortError");
  }
  if (videoBlob.size === 0) {
    throw new Error("addBackgroundMusic: empty videoBlob");
  }

  // Fetch music BEFORE booting ffmpeg so a CORS / 404 fails fast
  // with a clear error instead of a confusing ffmpeg.exec exit code.
  const { bytes: musicBytes, filename: musicFilename } = await fetchMusicForVfs(
    musicUrl,
    signal,
  );

  const ffmpeg = await loadFFmpeg();
  if (signal?.aborted) {
    throw new DOMException("addBackgroundMusic aborted", "AbortError");
  }

  const progressHandler = (data: { progress: number }) => {
    onProgress?.({ phase: "mixing", ratio: data.progress });
  };
  ffmpeg.on("progress", progressHandler);

  try {
    onProgress?.({ phase: "mixing", ratio: 0 });

    await ffmpeg.writeFile(VIDEO_FILENAME, await fetchFile(videoBlob));
    await ffmpeg.writeFile(musicFilename, musicBytes);

    const filter =
      `[0:a]volume=${voiceVolume}[vox];` +
      `[1:a]volume=${musicVolume},aloop=loop=-1:size=2e9[bg];` +
      `[vox][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;

    await ffmpeg.exec([
      "-i",
      VIDEO_FILENAME,
      "-i",
      musicFilename,
      "-filter_complex",
      filter,
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-shortest",
      OUT_FILENAME,
    ]);

    if (signal?.aborted) {
      throw new DOMException("addBackgroundMusic aborted", "AbortError");
    }

    const outBytes = (await ffmpeg.readFile(OUT_FILENAME)) as Uint8Array;
    const buffer = new ArrayBuffer(outBytes.byteLength);
    new Uint8Array(buffer).set(outBytes);
    return new Blob([buffer], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    await ffmpeg.deleteFile(VIDEO_FILENAME).catch(() => undefined);
    await ffmpeg.deleteFile(musicFilename).catch(() => undefined);
    await ffmpeg.deleteFile(OUT_FILENAME).catch(() => undefined);
  }
}

/**
 * Fetch a music URL into bytes + a filename suitable for ffmpeg's
 * virtual FS. Filename extension is preserved from the URL when
 * possible so ffmpeg can pick the right demuxer; falls back to
 * `music.mp3` which is the most permissive default.
 */
async function fetchMusicForVfs(
  url: string,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const res = await fetch(url, { credentials: "omit", signal });
  if (!res.ok) {
    throw new Error(
      `addBackgroundMusic: music fetch failed (${res.status}) ${url}`,
    );
  }
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), filename: deriveMusicFilename(url) };
}

function deriveMusicFilename(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    if (/\.(mp3|m4a|aac|wav|ogg|flac|opus|mpga)$/i.test(last)) return last;
  } catch {
    /* fall through */
  }
  return "music.mp3";
}
