/**
 * Test: does last-frame conditioning preserve continuity across two
 * video clips when the user supplies a "locked-down world"?
 *
 * Originally we wanted Veo 3.1 Fast for both clips. ppq.ai's catalog
 * doesn't expose Veo 3.1, AND `veo3-fast` on ppq.ai is text-to-video
 * only — passing `image_url` returns 502 ("No providers available for
 * this model"). Defaults now resolve to an i2v-capable family
 * (kling-2.5-turbo by preference), with the same id used for both
 * clips so the aesthetic doesn't flip at the seam. You can opt back
 * into Veo for clip 1 with `--text-model veo3-fast` if you want to
 * see how mixing lineages affects the join.
 *
 * The technique under test:
 *
 *   (a) the user provides a "locked-down world" — verbatim character +
 *       setting + wardrobe + lighting + camera-language block in both
 *       prompts; and
 *
 *   (b) the second clip is image-to-video, conditioned on the LAST FRAME
 *       of the first clip?
 *
 * Together these are the prompt-engineering technique we'll document for
 * the Phoenix wizard's "scene continuation" mode. This script is the
 * artifact that proves the technique works (or doesn't) on Veo 3.1 Fast.
 *
 * What you get back: two MP4 URLs, side by side. Visually inspect the
 * seam — the woman's hair, lighting, posture, and wardrobe should be
 * identical at the join. The only difference between the clips should
 * be (i) what she's saying and (ii) her emotional register shifting from
 * warm-introductory to serious-investigative.
 *
 * No stitching. The two clips are produced and printed independently.
 *
 * Run:
 *   npx tsx tests/ai-services/test-veo-last-frame-conditioning.ts
 *
 * Loads `dev/.env` automatically.
 *
 * Prereqs:
 *   - ffmpeg on your $PATH (the script extracts the last frame of clip 1
 *     so it can be passed as `image_url` to clip 2's i2v generation).
 *   - A ppq.ai account at tests/ai-services/.account.json (run
 *     bootstrap-spark-wallet-e2e.ts or test-all-ppq-services-e2e.ts once
 *     to mint one).
 *
 * Caching:
 *   Each step persists state under tests/ai-services/.veo-last-frame/.
 *   Re-running the script picks up where it left off so you don't pay
 *   for clip 1 twice while iterating on clip 2.
 *
 * Flags:
 *   --reset                  Wipe the cache dir before starting.
 *   --skip-clip1             Use a previously generated clip 1 (must be cached).
 *   --skip-clip2             Stop after extracting + uploading the last frame.
 *   --list-models            List all video models advertised by ppq.ai and exit.
 *   --model <id>             Override the singleton model used for BOTH clips.
 *                            Default: auto-resolve to the best available from
 *                            `/v1/models?type=video` (preference: kling-3.0 →
 *                            kling-2.1-master → kling-2.1-pro → runway-gen4 →
 *                            luma-dream-machine → seedance-2 → hailuo-02-pro).
 *                            Both clips MUST use the same model — mixing
 *                            families is the #1 cause of broken continuity.
 *                            Don't point this at `veo3-fast`: ppq.ai's Veo
 *                            route doesn't accept `image_url` (returns 502).
 *   --aspect <ratio>         "9:16" (default), "16:9", "1:1".
 *   --duration <secs>        Per-clip duration (default 8).
 *   --quality <p>            "720p" (default) or "1080p".
 *   --manual-upload          Skip the public-host upload; prompt for a URL you host yourself.
 *   --upload-host <url>      Pin uploads to a single host (basic POST,
 *                            file field "file"). Default: walk a fallback
 *                            chain of public no-auth hosts (catbox.moe →
 *                            uguu.se → 0x0.st).
 *   --ffmpeg <path>          Override the ffmpeg binary path.
 */

import "../_shared/loadEnv";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

import {
  getVideoStatus,
  listModels,
  submitVideo,
} from "../../src/lib/ppq/client";

/* ---------- arg parsing ---------- */

const argv = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

const flags = {
  reset: argv.includes("--reset"),
  skipClip1: argv.includes("--skip-clip1"),
  skipClip2: argv.includes("--skip-clip2"),
  manualUpload: argv.includes("--manual-upload"),
  listModels: argv.includes("--list-models"),
  // Singleton model — used for BOTH clip 1 and clip 2. Empty string means
  // "auto-resolve to the best available model from /v1/models?type=video".
  model: flagValue("model") ?? "",
  aspect: (flagValue("aspect") ?? "9:16") as "9:16" | "16:9" | "1:1",
  // Kling on ppq.ai only accepts duration ∈ {5, 10} and quality "standard".
  // Defaults match Kling's pricing matrix; override per-run for other models.
  duration: Number(flagValue("duration") ?? "5"),
  quality: (flagValue("quality") ?? "standard") as
    | "standard"
    | "720p"
    | "1080p",
  // Empty = walk the built-in public-host fallback chain.
  // Set explicitly to pin a single host (basic POST with file field "file").
  uploadHost: flagValue("upload-host") ?? "",
  ffmpeg: flagValue("ffmpeg") ?? "ffmpeg",
};

/* ---------- paths + cache ---------- */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(SCRIPT_DIR, ".veo-last-frame");
const STATE_PATH = path.join(CACHE_DIR, "state.json");
const CLIP1_PATH = path.join(CACHE_DIR, "clip1.mp4");
const LAST_FRAME_PATH = path.join(CACHE_DIR, "last-frame.png");
const PPQ_ACCOUNT_PATH = path.join(SCRIPT_DIR, ".account.json");

interface State {
  clip1?: { id: string; url: string; model?: string };
  uploadedFrameUrl?: string;
  clip2?: { id: string; url: string; model?: string };
}

async function loadState(): Promise<State> {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, "utf8")) as State;
  } catch {
    return {};
  }
}

async function saveState(state: State): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

/* ---------- prompts: the "locked-down world" technique ---------- */

/**
 * The world block is identical in both prompts. Anything mentioned here
 * — character, setting, wardrobe, lighting, camera language — must be
 * the SAME in clip 1 and clip 2 if we want continuity. Anything that
 * varies between clips lives outside this block.
 */
const WORLD_BLOCK = `Medium close-up of a graceful Rwandan woman in her early thirties with warm brown skin, high cheekbones, and natural hair styled in a low bun. She wears a soft cream linen blouse and small gold earrings. She sits in a calm home office. Late afternoon golden light streams from a window to her left. Behind her, slightly out of focus, a framed family photo and a small Rwandan flag pin hang on a sage-green wall. Camera holds rock-steady at eye level, medium close-up. 9:16 vertical. Cinematic, photorealistic, soft natural lighting, shallow depth of field.`;

const CLIP1_ACTION = `She looks directly into the camera with a warm, composed expression and speaks in clear English with a gentle Rwandan accent: "Hello, my name is Imani. I am a journalist from Kigali. Today I want to share with you the story that everyone in Rwanda is whispering about." Her voice is calm and inviting. The clip ends as she draws a slow breath and her expression starts to shift toward seriousness.`;

const CLIP2_ACTION = `Her expression is now serious and resolved. She continues speaking directly into the camera in clear English with the same gentle Rwandan accent, with measured conviction: "For too long, corruption inside our government has stolen what was promised to ordinary Rwandans — the schools that never get built, the roads that disappear into someone's pocket, the contracts handed to cousins. We deserve transparency. We deserve to see where the money goes."`;

const CLIP1_PROMPT = `${WORLD_BLOCK}\n\n${CLIP1_ACTION}`;
const CLIP2_PROMPT = `${WORLD_BLOCK}\n\nContinuing the same uninterrupted scene with the same woman, same wardrobe, same lighting, same posture as the previous moment. ${CLIP2_ACTION}`;

/* ---------- shell helpers ---------- */

const rl = readline.createInterface({ input, output });

async function ask(prompt: string, def?: string): Promise<string> {
  const decorated = def ? `${prompt} [${def}] ` : `${prompt} `;
  const ans = (await rl.question(decorated)).trim();
  return ans.length ? ans : (def ?? "");
}

async function askYesNo(prompt: string, def: "y" | "n" = "y"): Promise<boolean> {
  const ans = (await ask(`${prompt} (y/n)`, def)).toLowerCase();
  return ans === "y" || ans === "yes";
}

function header(title: string): void {
  console.log(`\n────── ${title} ──────`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function printPrompt(label: string, prompt: string): void {
  console.log(`\n${label}:`);
  for (const line of prompt.split("\n")) {
    console.log(`  | ${line}`);
  }
}

/* ---------- model discovery ---------- */

/**
 * Veo on ppq.ai is text-to-video only today — passing `image_url` to
 * `veo3-fast` returns 502 "No providers available for this model".
 * The earlier `veo3-i2v` model id has been dropped from the catalog
 * and ppq.ai hasn't routed Veo's image-to-video variant in its place.
 *
 * To test last-frame conditioning end to end we need a model that DOES
 * support i2v. Curated preference list below — talking-head-friendly
 * families with native i2v support, ordered by quality + maturity.
 *
 * Both clips default to the same auto-resolved id so the aesthetic
 * matches across the seam (Veo 3 Fast for clip 1 + Kling for clip 2
 * makes the i2v join visibly different lineage). Users can split via
 * --text-model / --i2v-model to deliberately test cross-model behavior.
 */

/**
 * Best-singleton preference order. Both clips use the SAME model so the
 * latent space matches across the seam — mixing model families is the
 * #1 named cause of broken continuity in 2026 multi-clip AI video.
 *
 * Ordered by predicted quality + suitability for talking-head + native
 * i2v support. We pick the FIRST one that exists in ppq.ai's live
 * catalog and stop.
 */
const BEST_SINGLETON_PREFERENCE = [
  // Kling 3.0 — flagship, marketed for "3-15s multi-shot sequences with
  // subject consistency". Highest theoretical compliance.
  "kling-3.0",
  // Kling 2.1 Master — proven to work in our runs (passed processing
  // for both T2V and I2V on ppq.ai's route).
  "kling-2.1-master",
  // Kling 2.1 Pro — sibling to Master, slightly different tuning.
  "kling-2.1-pro",
  // Runway Gen-4 — Runway's flagship, strongest character-reference
  // consistency in their family (40% better than Gen-3 per Runway).
  "runway-gen4",
  // Luma Dream Machine — strong realism, native start-frame conditioning.
  "luma-dream-machine",
  // Seedance 2 — solid quality, fast.
  "seedance-2",
  // Hailuo 02 Pro.
  "hailuo-02-pro",
];

const I2V_CAPABLE_FAMILIES_LEGACY = [
  "kling",
  "runway",
  "luma",
  "seedance",
  "hailuo",
  "pika",
  "pixverse",
  "minimax",
];

/**
 * Pick the single best video model available on ppq.ai for the
 * continuity test. Both clips will use this same id.
 */
function resolveBestSingleton(ids: string[], preferRequested: string): string {
  if (preferRequested) {
    if (ids.includes(preferRequested)) return preferRequested;
    throw new Error(
      `Model "${preferRequested}" is not in the available video models. ` +
        `Available:\n  - ${ids.join("\n  - ")}`,
    );
  }

  // 1. Curated exact-match preference list — best quality first.
  for (const candidate of BEST_SINGLETON_PREFERENCE) {
    if (ids.includes(candidate)) return candidate;
  }

  // 2. Fuzzy fallback: anything from a known i2v-capable family.
  // (Veo deliberately excluded — Veo on ppq.ai doesn't accept image_url.)
  const lc = ids.map((id) => ({ id, lc: id.toLowerCase() }));
  for (const family of I2V_CAPABLE_FAMILIES_LEGACY) {
    const hit = lc.find((e) => e.lc.includes(family));
    if (hit) return hit.id;
  }

  throw new Error(
    `No i2v-capable model found in catalog. Available:\n  - ${ids.join("\n  - ")}\n\n` +
      `Pass --model <id> explicitly.`,
  );
}

async function discoverVideoModels(): Promise<string[]> {
  const models = await listModels("video");
  return models.map((m) => m.id).sort();
}

/* ---------- ppq.ai account loader ---------- */

interface PpqAccountFile {
  credit_id: string;
  api_key: string;
}

async function loadPpqAccount(): Promise<PpqAccountFile> {
  try {
    const raw = await fs.readFile(PPQ_ACCOUNT_PATH, "utf8");
    const parsed = JSON.parse(raw) as PpqAccountFile;
    if (parsed?.api_key && parsed?.credit_id) return parsed;
  } catch {
    /* fall through */
  }
  throw new Error(
    "No ppq.ai account found at tests/ai-services/.account.json. " +
      "Run `npx tsx tests/ai-services/test-all-ppq-services-e2e.ts` once to mint one.",
  );
}

/* ---------- video submit + poll ---------- */

interface ClipSubmitArgs {
  apiKey: string;
  model: string;
  prompt: string;
  imageUrl?: string;
  // Per-attempt parameter overrides for the i2v fallback cascade.
  aspect?: "9:16" | "16:9" | "1:1";
  duration?: number;
  quality?: string;
}

async function generateClip(args: ClipSubmitArgs): Promise<{
  id: string;
  url: string;
  costUsd?: number;
}> {
  const submitted = await submitVideo(args.apiKey, {
    model: args.model,
    prompt: args.prompt,
    aspect_ratio: args.aspect ?? flags.aspect,
    duration: args.duration ?? flags.duration,
    quality: args.quality ?? flags.quality,
    ...(args.imageUrl !== undefined ? { image_url: args.imageUrl } : {}),
  });
  console.log(`  job id:           ${submitted.id}`);
  if (submitted.estimated_cost !== undefined) {
    console.log(`  estimated cost:   $${submitted.estimated_cost.toFixed(4)}`);
  }
  console.log("  Polling /v1/videos/{id} every 5s. Ctrl+C to abort.");

  const deadline = Date.now() + 12 * 60 * 1000;
  let last = "";
  let pollCount = 0;
  const startTime = Date.now();
  while (Date.now() < deadline) {
    const status = await getVideoStatus(args.apiKey, submitted.id);
    pollCount++;
    if (status.status !== last) {
      // newline before any prior heartbeat dots, then the status
      if (pollCount > 1) process.stdout.write("\n");
      console.log(`  status: ${status.status}`);
      last = status.status;
    } else {
      // heartbeat: a dot every poll, with elapsed time every 6 polls (30s)
      if (pollCount % 6 === 0) {
        const secs = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`  · still ${status.status} (${secs}s elapsed)\n`);
      } else {
        process.stdout.write(".");
      }
    }
    if (status.status === "completed") {
      const url = status.data?.url;
      if (!url) throw new Error("video completed but no url returned");
      return {
        id: submitted.id,
        url,
        costUsd: status.cost ?? submitted.estimated_cost,
      };
    }
    if (status.status === "failed") {
      throw new Error(status.error ?? "video generation failed");
    }
    await sleep(5_000);
  }
  throw new Error("video polling timed out (12min)");
}

/* ---------- download mp4 ---------- */

async function downloadMp4(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mp4 fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  console.log(`  saved ${buf.length.toLocaleString()} bytes → ${dest}`);
}

/* ---------- ffmpeg: extract last frame ---------- */

async function extractLastFrame(
  videoPath: string,
  framePath: string,
): Promise<void> {
  await fs.rm(framePath, { force: true });
  // -sseof -0.1 seeks to ~100ms before the end; -vframes 1 grabs one frame.
  const args = [
    "-sseof",
    "-0.1",
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-q:v",
    "2",
    framePath,
    "-y",
  ];
  await runCommand(flags.ffmpeg, args);
  const stat = await fs.stat(framePath);
  console.log(`  frame extracted: ${stat.size.toLocaleString()} bytes → ${framePath}`);
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", (err) => {
      reject(
        new Error(
          `failed to run \`${cmd}\` (${err.message}). ` +
            `Install ffmpeg or pass --ffmpeg <path>.`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}.\nstderr:\n${stderr}`));
    });
  });
}

/* ---------- upload last frame ---------- */

interface UploadProvider {
  name: string;
  url: string;
  fileField: string;
  extraFields?: Record<string, string>;
  parseResponse: (body: string) => string | undefined;
}

/**
 * Public no-auth file hosts we'll try in order until one accepts the
 * upload. Files just need to stay reachable long enough for ppq.ai to
 * fetch them once during clip 2 generation (~minutes).
 */
const UPLOAD_PROVIDERS: UploadProvider[] = [
  {
    // Persistent, reliable, allows direct image hotlinking.
    name: "catbox.moe",
    url: "https://catbox.moe/user/api.php",
    fileField: "fileToUpload",
    extraFields: { reqtype: "fileupload" },
    parseResponse: (body) => {
      const t = body.trim();
      return /^https?:\/\//.test(t) ? t : undefined;
    },
  },
  {
    // 3-hour TTL; long enough for the test, short enough to be friendly.
    name: "uguu.se",
    url: "https://uguu.se/upload.php",
    fileField: "files[]",
    parseResponse: (body) => {
      try {
        const j = JSON.parse(body) as { files?: Array<{ url?: string }> };
        const url = j.files?.[0]?.url;
        return typeof url === "string" ? url : undefined;
      } catch {
        return undefined;
      }
    },
  },
  {
    // Legacy fallback — sometimes 503s under load.
    name: "0x0.st",
    url: "https://0x0.st",
    fileField: "file",
    parseResponse: (body) => {
      const t = body.trim();
      return /^https?:\/\//.test(t) ? t : undefined;
    },
  },
];

const USER_AGENT = "phoenix-test/0.1 (+https://phoenix.example)";

async function uploadToProvider(
  framePath: string,
  provider: UploadProvider,
): Promise<string> {
  const attempt = async (): Promise<string> => {
    const buf = await fs.readFile(framePath);
    const blob = new Blob([new Uint8Array(buf)], { type: "image/png" });
    const form = new FormData();
    form.set(provider.fileField, blob, "last-frame.png");
    for (const [k, v] of Object.entries(provider.extraFields ?? {})) {
      form.set(k, v);
    }
    const res = await fetch(provider.url, {
      method: "POST",
      body: form,
      headers: { "user-agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    const url = provider.parseResponse(body);
    if (!url) throw new Error(`non-URL response: ${body.slice(0, 200)}`);
    return url;
  };

  // One retry on transient errors (DNS / TLS hiccups read as "fetch failed").
  try {
    return await attempt();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/fetch failed|EAI_AGAIN|ECONNRESET|ETIMEDOUT/i.test(msg)) {
      console.warn(`  ↻ ${provider.name} transient (${msg}), retrying once…`);
      return await attempt();
    }
    throw err;
  }
}

/**
 * HEAD the cached upload URL to confirm it's still reachable. Public file
 * hosts have varying TTLs (uguu.se = 3h; catbox.moe = persistent; 0x0.st =
 * 30+d). If the URL is dead, the script forces a fresh upload rather than
 * handing ppq.ai a stale link.
 */
async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": USER_AGENT },
    });
    if (res.ok) return true;
    // Some hosts 405 on HEAD but serve GET fine; verify with a tiny GET.
    if (res.status === 405) {
      const g = await fetch(url, {
        method: "GET",
        headers: { "user-agent": USER_AGENT, range: "bytes=0-0" },
      });
      return g.ok || g.status === 206;
    }
    return false;
  } catch {
    return false;
  }
}

async function uploadFrame(framePath: string): Promise<string> {
  if (flags.manualUpload) {
    console.log(
      `  --manual-upload: host ${framePath} somewhere reachable by ppq.ai ` +
        `(Imgur, Blossom, gist raw, etc.) and paste the URL.`,
    );
    const pasted = (await ask("frame URL?")).trim();
    if (!pasted) throw new Error("no frame URL provided");
    return pasted;
  }

  // --upload-host overrides the fallback chain with a single fixed target
  // (basic POST with file field "file"). Useful when you have an internal
  // hosting service or want to pin a specific provider.
  if (flags.uploadHost) {
    console.log(`  uploading to override host: ${flags.uploadHost} …`);
    const url = await uploadToProvider(framePath, {
      name: flags.uploadHost,
      url: flags.uploadHost,
      fileField: "file",
      parseResponse: (body) => {
        const t = body.trim();
        return /^https?:\/\//.test(t) ? t : undefined;
      },
    });
    console.log(`  ✓ uploaded: ${url}`);
    return url;
  }

  // Otherwise walk the public-host fallback chain.
  const errors: string[] = [];
  for (const provider of UPLOAD_PROVIDERS) {
    try {
      console.log(`  trying ${provider.name} …`);
      const url = await uploadToProvider(framePath, provider);
      console.log(`  ✓ uploaded via ${provider.name}: ${url}`);
      return url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗ ${provider.name}: ${msg}`);
      errors.push(`${provider.name}: ${msg}`);
    }
  }
  throw new Error(
    `All upload providers failed:\n  - ${errors.join("\n  - ")}\n\n` +
      `Re-run with --manual-upload to paste a URL of your own, or use ` +
      `--upload-host <url> to target a specific endpoint.`,
  );
}

/* ---------- i2v fallback cascade ---------- */

/**
 * Curated set of i2v candidate models on ppq.ai with the parameter
 * combos each accepts. We cascade through these for clip 2 because
 * ppq.ai's catalog advertises models without telling us which actually
 * route i2v requests — discovery is empirical.
 *
 * Order: most-likely-to-work first. Stops on first success.
 */
interface I2vCandidate {
  model: string;
  aspect: "9:16" | "16:9" | "1:1";
  duration: number;
  quality: string;
  notes?: string;
}

/**
 * Reordered to surface Kling 3.0 first — it's specifically marketed for
 * "3-15 second multi-shot sequences while maintaining subject
 * consistency", which is exactly the continuity goal we're testing.
 */
const I2V_FALLBACK_CHAIN: I2vCandidate[] = [
  { model: "kling-3.0",        aspect: "9:16", duration: 5, quality: "standard" },
  { model: "kling-2.5-turbo",  aspect: "9:16", duration: 5, quality: "standard" },
  { model: "kling-2.1-master", aspect: "9:16", duration: 5, quality: "standard" },
  { model: "kling-2.1-pro",    aspect: "9:16", duration: 5, quality: "standard" },
  { model: "runway-gen4",      aspect: "9:16", duration: 5, quality: "720p" },
  { model: "luma-dream-machine", aspect: "9:16", duration: 5, quality: "720p" },
  { model: "pika-v2.2",        aspect: "9:16", duration: 5, quality: "720p" },
  { model: "seedance-2-fast",  aspect: "9:16", duration: 5, quality: "720p" },
  { model: "hailuo-02-pro",    aspect: "9:16", duration: 6, quality: "720p" },
  { model: "pixverse-v4.5",    aspect: "9:16", duration: 5, quality: "720p" },
];

// Cascade machinery removed — we run as a singleton on the best
// available model. If it fails, the script suggests the next-best
// singleton to try via --model. No automatic fallback.

/* ---------- main ---------- */

async function main(): Promise<void> {
  console.log("Veo 3.1 Fast — last-frame conditioning continuity test");
  console.log("(locked-down world prompt + i2v second clip)");

  if (flags.reset) {
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
    console.log("Reset: cleared cache.");
  }

  const ppq = await loadPpqAccount();
  const state = await loadState();

  /* ---- discover + resolve video models ---- */

  header("0. Discover video models on ppq.ai");
  const videoModelIds = await discoverVideoModels();
  console.log(`  ${videoModelIds.length} video models advertised:`);
  for (const id of videoModelIds) console.log(`    - ${id}`);

  if (flags.listModels) {
    console.log("\n--list-models specified, exiting.");
    return;
  }

  // Singleton: one model for both clips. Different model families have
  // different latent spaces; mixing them across a continuity seam is the
  // #1 named cause of broken multi-clip continuity in 2026 AI video.
  const singletonModel = resolveBestSingleton(videoModelIds, flags.model);
  const profile =
    I2V_FALLBACK_CHAIN.find((c) => c.model === singletonModel) ?? {
      model: singletonModel,
      aspect: flags.aspect,
      duration: flags.duration,
      quality: flags.quality,
    };
  console.log(`\n  singleton model → ${singletonModel}`);
  console.log(
    `  params:           ${profile.aspect}, ${profile.duration}s, ${profile.quality}`,
  );
  if (!flags.model) {
    console.log(
      `  (auto-resolved; override with --model <id> — see --list-models for the catalog)`,
    );
  }
  // Aliases for the rest of the script's existing call sites.
  const resolvedTextModel = singletonModel;
  const resolvedI2vModel = singletonModel;

  header("World block (verbatim in both prompts)");
  printPrompt("WORLD_BLOCK", WORLD_BLOCK);
  console.log(
    "\nThe ONLY differences between clip 1 and clip 2 are (a) what the woman " +
      "says and (b) her emotional register. Everything else — character, " +
      "wardrobe, room, lighting, camera, frame — is held identical so the " +
      "model has consistent ground truth.",
  );

  /* ---- clip 1 ---- */

  // Detect model lineage mismatch — this is THE primary cause of
  // "no continuity despite locked-down world prompt + i2v conditioning".
  // Different model families have different latent spaces; the i2v
  // conditioning image fights the new model's prior and the prior wins.
  if (state.clip1 && !flags.reset) {
    const mismatch =
      !state.clip1.model || state.clip1.model !== resolvedTextModel;
    if (mismatch) {
      const cachedModel = state.clip1.model ?? "(unknown — older run)";
      console.warn(`\n  ⚠ MODEL LINEAGE MISMATCH on cached clip 1`);
      console.warn(`  Cached clip 1 model: ${cachedModel}`);
      console.warn(`  Cascade will start clip 2 on: ${resolvedI2vModel}`);
      console.warn(
        `  Mixing model families across clips is the #1 cause of broken`,
      );
      console.warn(
        `  continuity — different latent spaces disagree on "what does this`,
      );
      console.warn(
        `  person look like" even given the same conditioning frame.`,
      );
      const regenerate = await askYesNo(
        `  Regenerate clip 1 with ${resolvedTextModel} so both clips share a lineage?`,
        "y",
      );
      if (regenerate) {
        delete state.clip1;
        await fs.rm(CLIP1_PATH, { force: true }).catch(() => undefined);
        await fs.rm(LAST_FRAME_PATH, { force: true }).catch(() => undefined);
        await saveState(state);
        console.log("  Cleared cached clip 1 + last frame; will regenerate.");
      }
    }
  }

  if (state.clip1 && !flags.reset) {
    header("1. Clip 1 (text-to-video) — cached");
    console.log(`  id:    ${state.clip1.id}`);
    console.log(`  url:   ${state.clip1.url}`);
    console.log(`  model: ${state.clip1.model ?? "(unknown)"}`);
  } else if (flags.skipClip1) {
    throw new Error(
      "--skip-clip1 set, but no clip 1 is cached. Run without --skip-clip1 first.",
    );
  } else {
    header(`1. Clip 1 (text-to-video, ${resolvedTextModel})`);
    printPrompt("CLIP1_PROMPT", CLIP1_PROMPT);
    if (!(await askYesNo("Generate clip 1?"))) return;
    // Use the same parameter combo as the cascade default for this model
    // so clip 1 doesn't fail validation while clip 2 succeeds.
    const profile =
      I2V_FALLBACK_CHAIN.find((c) => c.model === resolvedTextModel) ??
      undefined;
    const clip1 = await generateClip({
      apiKey: ppq.api_key,
      model: resolvedTextModel,
      prompt: CLIP1_PROMPT,
      aspect: profile?.aspect,
      duration: profile?.duration,
      quality: profile?.quality,
    });
    console.log(`  ✓ clip 1 url:      ${clip1.url}`);
    if (clip1.costUsd !== undefined) {
      console.log(`  ✓ clip 1 cost:     $${clip1.costUsd.toFixed(4)}`);
    }
    state.clip1 = {
      id: clip1.id,
      url: clip1.url,
      model: resolvedTextModel,
    };
    await saveState(state);
  }

  /* ---- download + extract last frame ---- */

  header("2. Download clip 1 + extract last frame");
  let needFrame = true;
  try {
    await fs.access(LAST_FRAME_PATH);
    needFrame = false;
    console.log(`  cached frame:    ${LAST_FRAME_PATH}`);
  } catch {
    /* not cached */
  }
  if (needFrame) {
    let needMp4 = true;
    try {
      await fs.access(CLIP1_PATH);
      needMp4 = false;
      console.log(`  cached mp4:      ${CLIP1_PATH}`);
    } catch {
      /* not cached */
    }
    if (needMp4) {
      if (!state.clip1) throw new Error("no clip 1 url to download");
      console.log(`  downloading ${state.clip1.url} …`);
      await downloadMp4(state.clip1.url, CLIP1_PATH);
    }
    console.log(`  running ${flags.ffmpeg} to grab last frame …`);
    await extractLastFrame(CLIP1_PATH, LAST_FRAME_PATH);
  }

  /* ---- upload frame ---- */

  header("3. Upload last frame so ppq.ai can fetch it");
  if (state.uploadedFrameUrl) {
    console.log(`  cached upload:   ${state.uploadedFrameUrl}`);
    process.stdout.write("  HEAD-checking … ");
    const reachable = await isUrlReachable(state.uploadedFrameUrl);
    if (!reachable) {
      console.log("DEAD (host expired the file). Re-uploading.");
      delete state.uploadedFrameUrl;
    } else {
      console.log("OK");
      if (
        !(await askYesNo("Re-use the cached upload URL?", "y"))
      ) {
        delete state.uploadedFrameUrl;
      }
    }
  }
  if (!state.uploadedFrameUrl) {
    state.uploadedFrameUrl = await uploadFrame(LAST_FRAME_PATH);
    await saveState(state);
  }

  if (flags.skipClip2) {
    header("Stopping after upload (--skip-clip2).");
    return;
  }

  /* ---- clip 2 ---- */

  if (state.clip2 && !flags.reset) {
    header("4. Clip 2 (image-to-video) — cached");
    console.log(`  id:  ${state.clip2.id}`);
    console.log(`  url: ${state.clip2.url}`);
  } else {
    header(`4. Clip 2 (image-to-video, ${singletonModel})`);
    console.log(`  conditioning image: ${state.uploadedFrameUrl}`);
    console.log(
      `  params:             ${profile.aspect}, ${profile.duration}s, ${profile.quality}`,
    );
    printPrompt("CLIP2_PROMPT", CLIP2_PROMPT);
    if (!(await askYesNo("Generate clip 2?"))) return;
    let clip2;
    try {
      clip2 = await generateClip({
        apiKey: ppq.api_key,
        model: singletonModel,
        prompt: CLIP2_PROMPT,
        imageUrl: state.uploadedFrameUrl,
        aspect: profile.aspect,
        duration: profile.duration,
        quality: profile.quality,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextBest =
        BEST_SINGLETON_PREFERENCE.find(
          (m) => m !== singletonModel && videoModelIds.includes(m),
        ) ?? "(none)";
      throw new Error(
        `${singletonModel} failed on i2v: ${msg}\n\n` +
          `Next-best singleton to try:\n` +
          `  npx tsx tests/ai-services/test-veo-last-frame-conditioning.ts --reset --model ${nextBest}`,
        { cause: err },
      );
    }
    console.log(`\n  ✓ clip 2 url:      ${clip2.url}`);
    if (clip2.costUsd !== undefined) {
      console.log(`  ✓ clip 2 cost:     $${clip2.costUsd.toFixed(4)}`);
    }
    state.clip2 = {
      id: clip2.id,
      url: clip2.url,
      model: singletonModel,
    };
    await saveState(state);
  }

  /* ---- summary ---- */

  header("Both clips");
  console.log(`  clip 1 (intro):       ${state.clip1?.url ?? "(missing)"}`);
  console.log(`  clip 2 (corruption):  ${state.clip2?.url ?? "(missing)"}`);
  console.log(`  conditioning frame:   ${state.uploadedFrameUrl ?? "(missing)"}`);
  console.log(
    "\nVisually inspect the seam: hair, lighting, posture, wardrobe should be " +
      "identical at the join. The only delta should be what she's saying and " +
      "the emotional register. If the world drifts, the locked-down-world " +
      "technique is leaking — try moving more details into WORLD_BLOCK.",
  );
}

main()
  .catch((err) => {
    console.error("\n[FATAL]", err);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
