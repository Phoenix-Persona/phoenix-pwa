/**
 * mix-background-music.ts — iterate on the ffmpeg filtergraph for
 * layering a soft background music bed under a talking-head clip.
 *
 * The goal is to lock in the audio-mixing parameters BEFORE we wire
 * this into the browser stitch step (`src/lib/video/stitchClips.ts`).
 * Easier to tune commands against system ffmpeg than to rebuild the
 * `@ffmpeg/ffmpeg` wasm graph on every iteration; once the filtergraph
 * is good here, port it verbatim into the wasm `ffmpeg.exec(...)` call.
 *
 * What the script does:
 *   1. Downloads the test video + music to a tmp dir (cached).
 *   2. Probes both inputs to print durations.
 *   3. Builds the filtergraph:
 *        - drop music to a configurable low volume
 *        - infinite-loop music in case it's shorter than the video
 *        - mix music + voice with `amix`
 *        - bound output to the video length
 *      All in one pass, video stream copy (no re-encode), audio
 *      re-encoded to AAC.
 *   4. Runs ffmpeg.
 *   5. Probes the output to confirm both video and a single mixed
 *      audio stream survived, with the expected duration.
 *   6. Prints the absolute output path so the user can play it.
 *
 * Run:
 *   tsx test/manual/video/mix-background-music.ts
 *
 * Tweak:
 *   tsx test/manual/video/mix-background-music.ts --music-vol 0.10 --voice-vol 1.0
 *   tsx test/manual/video/mix-background-music.ts --music-vol 0.20
 *   tsx test/manual/video/mix-background-music.ts \
 *     --video <url-or-path> --music <url-or-path>
 *
 * Defaults match the assets the user pasted while spec'ing this
 * feature.
 */

import { spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/* ---------- defaults ---------- */

const DEFAULT_VIDEO_URL =
  "https://blossom.dreamith.to/20c6d0f9eec3052540473ff3b3048b70a25cc2dbd07d18f03fc0f0cfa2e12822.mp4";
const DEFAULT_MUSIC_URL =
  "https://cascdr-chads-stay-winning.nyc3.cdn.digitaloceanspaces.com/lofi-beat-30s.mp3";

/**
 * Music volume — 1.0 = original level. 0.10–0.20 is the sweet spot
 * for "background bed under speech" on most consumer playback. We
 * default to 0.15 (a hair louder than 0.10 so it's audible on phones,
 * a hair softer than 0.20 so it doesn't fight a soft-spoken voice).
 */
const DEFAULT_MUSIC_VOL = 0.15;
const DEFAULT_VOICE_VOL = 1.0;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, ".out");
const TMP_DIR = resolve(__dirname, ".cache");

/* ---------- args ---------- */

interface CliArgs {
  videoUrl: string;
  musicUrl: string;
  musicVol: number;
  voiceVol: number;
  outputPath: string;
  /** Force re-download even if cached. */
  fresh: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    videoUrl: DEFAULT_VIDEO_URL,
    musicUrl: DEFAULT_MUSIC_URL,
    musicVol: DEFAULT_MUSIC_VOL,
    voiceVol: DEFAULT_VOICE_VOL,
    outputPath: join(OUT_DIR, "mixed.mp4"),
    fresh: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--video":
        args.videoUrl = next();
        break;
      case "--music":
        args.musicUrl = next();
        break;
      case "--music-vol":
        args.musicVol = clamp01(Number(next()));
        break;
      case "--voice-vol":
        args.voiceVol = clamp01(Number(next()));
        break;
      case "--output":
        args.outputPath = resolve(next());
        break;
      case "--fresh":
        args.fresh = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }
  return args;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(2, n));
}

function printHelp(): void {
  console.log(`mix-background-music.ts — soft music bed under a talking-head clip

Usage:
  tsx test/manual/video/mix-background-music.ts [flags]

Flags:
  --video <url|path>     input video (default: the user's test mp4)
  --music <url|path>     input music (default: the user's lofi-beat-30s)
  --music-vol <0..2>     music volume multiplier (default 0.15)
  --voice-vol <0..2>     voice volume multiplier (default 1.0)
  --output <path>        output mp4 (default test/manual/video/.out/mixed.mp4)
  --fresh                ignore the download cache, re-fetch
  --help, -h             this message
`);
}

/* ---------- IO helpers ---------- */

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

async function downloadIfMissing(
  src: string,
  dest: string,
  fresh: boolean,
): Promise<void> {
  // Local file → just verify.
  if (!/^https?:/i.test(src)) {
    if (!existsSync(src)) throw new Error(`Local input not found: ${src}`);
    return;
  }
  if (existsSync(dest) && !fresh) {
    const size = statSync(dest).size;
    log(`cache hit ${shortPath(dest)} (${fmtBytes(size)})`);
    return;
  }
  log(`fetching ${src}`);
  const res = await fetch(src);
  if (!res.ok || !res.body) {
    throw new Error(`fetch failed (${res.status}): ${src}`);
  }
  ensureDir(dirname(dest));
  // node 22+ accepts a web ReadableStream via Readable.fromWeb
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(dest),
  );
  log(`downloaded ${shortPath(dest)} (${fmtBytes(statSync(dest).size)})`);
}

function srcPath(src: string, cacheName: string): string {
  if (!/^https?:/i.test(src)) return resolve(src);
  return join(TMP_DIR, cacheName);
}

/* ---------- ffmpeg ---------- */

function probeDuration(path: string): number {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`ffprobe failed for ${path}: ${r.stderr}`);
  }
  return Number(r.stdout.trim());
}

function probeStreams(path: string): {
  hasVideo: boolean;
  hasAudio: boolean;
  audioStreams: number;
  videoStreams: number;
} {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`ffprobe streams failed for ${path}: ${r.stderr}`);
  }
  const lines = r.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const audio = lines.filter((l) => l === "audio").length;
  const video = lines.filter((l) => l === "video").length;
  return {
    hasVideo: video > 0,
    hasAudio: audio > 0,
    audioStreams: audio,
    videoStreams: video,
  };
}

/**
 * Build the ffmpeg argv for layering `musicPath` under `videoPath`.
 *
 * Filtergraph:
 *
 *   [1:a] volume=<musicVol>, aloop=loop=-1:size=2e9 [bg]
 *   [0:a] volume=<voiceVol>                            [vox]
 *   [vox][bg] amix=inputs=2:duration=first:dropout_transition=0:normalize=0 [a]
 *
 * Why each piece:
 *   - `volume=<n>` rides the input gain so the mix doesn't clip.
 *   - `aloop=-1` infinite-loops the music in case it's shorter than
 *     the video. `size=2e9` is a generous sample buffer (effectively
 *     "loop forever") matching the ffmpeg docs example.
 *   - `amix duration=first` pins output length to the FIRST input,
 *     which we order as the voice — so the music auto-truncates to
 *     the video's audio length.
 *   - `normalize=0` keeps our explicit `volume=` levels intact;
 *     amix's default normalization would otherwise re-balance and
 *     undo the `0.15` choice.
 *
 * Mapping:
 *   - `-map 0:v` keep the original video stream
 *   - `-map "[a]"` take the mixed audio
 *   - `-c:v copy` don't re-encode the video (lossless, instant)
 *   - `-c:a aac -b:a 192k` re-encode mixed audio to AAC for mp4
 *   - `-shortest` belt-and-suspenders bound on output duration
 */
function buildFfmpegArgs(args: {
  videoPath: string;
  musicPath: string;
  outputPath: string;
  musicVol: number;
  voiceVol: number;
}): string[] {
  const filter =
    `[1:a]volume=${args.musicVol},aloop=loop=-1:size=2e9[bg];` +
    `[0:a]volume=${args.voiceVol}[vox];` +
    `[vox][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;

  return [
    "-y",
    "-i",
    args.videoPath,
    "-i",
    args.musicPath,
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
    args.outputPath,
  ];
}

function runFfmpeg(argv: string[]): void {
  const r = spawnSync("ffmpeg", argv, { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) {
    throw new Error(`ffmpeg exited with status ${r.status}`);
  }
}

/* ---------- log helpers ---------- */

function log(...parts: unknown[]): void {
  console.log("[mix]", ...parts);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDur(secs: number): string {
  if (!Number.isFinite(secs)) return "?";
  const m = Math.floor(secs / 60);
  const s = (secs - m * 60).toFixed(2);
  return `${m}:${s.padStart(5, "0")}`;
}

function shortPath(p: string): string {
  return p.replace(process.cwd() + "/", "");
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  log("config", {
    videoUrl: args.videoUrl,
    musicUrl: args.musicUrl,
    musicVol: args.musicVol,
    voiceVol: args.voiceVol,
    outputPath: shortPath(args.outputPath),
  });

  ensureDir(TMP_DIR);
  ensureDir(dirname(args.outputPath));

  const videoPath = srcPath(args.videoUrl, "video.mp4");
  const musicPath = srcPath(args.musicUrl, "music.mp3");

  await downloadIfMissing(args.videoUrl, videoPath, args.fresh);
  await downloadIfMissing(args.musicUrl, musicPath, args.fresh);

  const videoDur = probeDuration(videoPath);
  const musicDur = probeDuration(musicPath);
  const videoStreams = probeStreams(videoPath);
  log(
    `video : ${fmtDur(videoDur)} · video=${videoStreams.videoStreams} audio=${videoStreams.audioStreams}`,
  );
  log(`music : ${fmtDur(musicDur)} (will loop if shorter than video)`);

  if (!videoStreams.hasAudio) {
    log(
      "WARN  video has no audio track — voice volume is irrelevant; output will be music-only.",
    );
  }

  const ffmpegArgs = buildFfmpegArgs({
    videoPath,
    musicPath,
    outputPath: args.outputPath,
    musicVol: args.musicVol,
    voiceVol: args.voiceVol,
  });

  log("running ffmpeg…");
  log("$ ffmpeg " + ffmpegArgs.map(quoteIfNeeded).join(" "));
  runFfmpeg(ffmpegArgs);

  // Verify the output.
  const outDur = probeDuration(args.outputPath);
  const outStreams = probeStreams(args.outputPath);
  const outSize = statSync(args.outputPath).size;
  log("output", {
    path: shortPath(args.outputPath),
    duration: fmtDur(outDur),
    size: fmtBytes(outSize),
    videoStreams: outStreams.videoStreams,
    audioStreams: outStreams.audioStreams,
  });

  // Sanity checks.
  if (!outStreams.hasVideo) throw new Error("Output has no video stream");
  if (outStreams.audioStreams !== 1) {
    throw new Error(
      `Expected exactly 1 mixed audio stream, got ${outStreams.audioStreams}`,
    );
  }
  if (Math.abs(outDur - videoDur) > 0.5) {
    log(
      `WARN  output duration ${fmtDur(outDur)} differs from input video ${fmtDur(videoDur)} by >0.5s`,
    );
  }

  log("done — play with:");
  console.log(`open "${args.outputPath}"`);
}

function quoteIfNeeded(s: string): string {
  return /[\s"$`\\]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
}

main().catch((err) => {
  console.error("[mix] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
