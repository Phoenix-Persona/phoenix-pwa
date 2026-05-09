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
 *   --text-model <id>        Override clip 1 model. Default: auto-resolve an
 *                            i2v-capable family from `/v1/models?type=video`
 *                            (kling-2.5-turbo > kling-2.1-master >
 *                            kling-2.1-pro > runway-gen4 > luma-dream-machine
 *                            > seedance-2-fast > hailuo-02-pro > pika-v2.2 >
 *                            pixverse-v4.5). Pass `veo3-fast` to use Veo for
 *                            clip 1 (clip 2 will be a different lineage and
 *                            the seam will show).
 *   --i2v-model <id>         Override clip 2 model. Default: same id as clip 1.
 *                            ppq.ai's `veo3-fast` does NOT accept `image_url`
 *                            today (returns 502), so don't point this at Veo.
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
  // Empty string means "auto-resolve from /v1/models?type=video".
  textModel: flagValue("text-model") ?? "",
  i2vModel: flagValue("i2v-model") ?? "",
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

const I2V_CAPABLE_PREFERENCE = [
  // Kling 2.5 Turbo — modern, talking-head friendly, native i2v.
  "kling-2.5-turbo",
  // Kling 2.x line — high quality, slower.
  "kling-2.1-master",
  "kling-2.1-pro",
  "kling-2.1-standard",
  "kling-3.0",
  // Runway Gen-4 — strong reference-image consistency.
  "runway-gen4",
  // Luma — supports start- and end-frame conditioning.
  "luma-dream-machine",
  // ByteDance Seedance — fast, decent realism, native i2v.
  "seedance-2-fast",
  "seedance-2",
  // Hailuo (MiniMax).
  "hailuo-02-pro",
  "hailuo-02-standard",
  // Pika 2.2 — Pikaframes (first+last frame interpolation) is a related
  // primitive; here we just use plain i2v with the last frame of clip 1.
  "pika-v2.2",
  // PixVerse v4.5 — supports i2v.
  "pixverse-v4.5",
];

const I2V_CAPABLE_FAMILIES = [
  "kling",
  "runway",
  "luma",
  "seedance",
  "hailuo",
  "pika",
  "pixverse",
  "minimax",
];

function resolveI2vCapableModel(ids: string[], preferRequested: string): string {
  if (preferRequested) {
    if (ids.includes(preferRequested)) return preferRequested;
    throw new Error(
      `Model "${preferRequested}" is not in the available video models. ` +
        `Available:\n  - ${ids.join("\n  - ")}`,
    );
  }

  // 1. Curated exact-match preference list.
  for (const candidate of I2V_CAPABLE_PREFERENCE) {
    if (ids.includes(candidate)) return candidate;
  }

  // 2. Fuzzy fallback: anything that contains a known i2v-capable family
  // marker. (We deliberately exclude Veo here — Veo on ppq.ai doesn't
  // accept image_url today.)
  const lc = ids.map((id) => ({ id, lc: id.toLowerCase() }));
  for (const family of I2V_CAPABLE_FAMILIES) {
    const hit = lc.find((e) => e.lc.includes(family));
    if (hit) return hit.id;
  }

  throw new Error(
    `No i2v-capable model found in catalog. Available:\n  - ${ids.join("\n  - ")}\n\n` +
      `Pass --text-model <id> and --i2v-model <id> explicitly.`,
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
}

async function generateClip(args: ClipSubmitArgs): Promise<{
  id: string;
  url: string;
  costUsd?: number;
}> {
  const submitted = await submitVideo(args.apiKey, {
    model: args.model,
    prompt: args.prompt,
    aspect_ratio: flags.aspect,
    duration: flags.duration,
    quality: flags.quality,
    ...(args.imageUrl !== undefined ? { image_url: args.imageUrl } : {}),
  });
  console.log(`  job id:           ${submitted.id}`);
  if (submitted.estimated_cost !== undefined) {
    console.log(`  estimated cost:   $${submitted.estimated_cost.toFixed(4)}`);
  }
  console.log("  Polling /v1/videos/{id} every 5s. Ctrl+C to abort.");

  const deadline = Date.now() + 12 * 60 * 1000;
  let last = "";
  while (Date.now() < deadline) {
    const status = await getVideoStatus(args.apiKey, submitted.id);
    if (status.status !== last) {
      console.log(`  status: ${status.status}`);
      last = status.status;
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

  // Both clips default to the same auto-resolved i2v-capable model so
  // the aesthetic matches across the seam. Veo on ppq.ai today is
  // text-to-video only — passing `image_url` to `veo3-fast` returns
  // 502, so we deliberately steer away from Veo here. Override via
  // --text-model if you want to mix lineages.
  const resolvedTextModel = resolveI2vCapableModel(
    videoModelIds,
    flags.textModel,
  );
  const resolvedI2vModel = flags.i2vModel
    ? resolveI2vCapableModel(videoModelIds, flags.i2vModel)
    : resolvedTextModel;
  console.log(`\n  text-to-video  (clip 1) → ${resolvedTextModel}`);
  console.log(`  image-to-video (clip 2) → ${resolvedI2vModel}`);
  if (resolvedI2vModel === resolvedTextModel) {
    console.log(
      `  (both clips on the same model — i2v switch is just whether we pass image_url)`,
    );
  } else {
    console.log(
      `  (clips on different models — expect a visible aesthetic shift at the seam)`,
    );
  }
  if (!flags.textModel && !flags.i2vModel) {
    console.log(
      `  (auto-resolved; override with --text-model / --i2v-model — see --list-models for the catalog)`,
    );
  }

  header("World block (verbatim in both prompts)");
  printPrompt("WORLD_BLOCK", WORLD_BLOCK);
  console.log(
    "\nThe ONLY differences between clip 1 and clip 2 are (a) what the woman " +
      "says and (b) her emotional register. Everything else — character, " +
      "wardrobe, room, lighting, camera, frame — is held identical so the " +
      "model has consistent ground truth.",
  );

  /* ---- clip 1 ---- */

  if (state.clip1 && !flags.reset) {
    header("1. Clip 1 (text-to-video) — cached");
    console.log(`  id:    ${state.clip1.id}`);
    console.log(`  url:   ${state.clip1.url}`);
    if (state.clip1.model) {
      console.log(`  model: ${state.clip1.model}`);
      if (state.clip1.model !== resolvedTextModel) {
        console.warn(
          `  ⚠ cached clip 1 was generated with ${state.clip1.model}, but ` +
            `the current text-to-video resolution is ${resolvedTextModel}. ` +
            `Clip 2 will be on ${resolvedI2vModel} — expect an aesthetic ` +
            `shift at the seam. Run with --reset to regenerate clip 1.`,
        );
      }
    } else {
      console.warn(
        `  ⚠ cached clip 1 has no model record (older run). It may have ` +
          `been generated on a different model than ${resolvedTextModel}. ` +
          `Run with --reset to be sure.`,
      );
    }
  } else if (flags.skipClip1) {
    throw new Error(
      "--skip-clip1 set, but no clip 1 is cached. Run without --skip-clip1 first.",
    );
  } else {
    header(`1. Clip 1 (text-to-video, ${resolvedTextModel})`);
    printPrompt("CLIP1_PROMPT", CLIP1_PROMPT);
    if (!(await askYesNo("Generate clip 1?"))) return;
    const clip1 = await generateClip({
      apiKey: ppq.api_key,
      model: resolvedTextModel,
      prompt: CLIP1_PROMPT,
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
    header(`4. Clip 2 (image-to-video, ${resolvedI2vModel})`);
    console.log(`  conditioning image: ${state.uploadedFrameUrl}`);
    printPrompt("CLIP2_PROMPT", CLIP2_PROMPT);
    if (!(await askYesNo("Generate clip 2?"))) return;
    const clip2 = await generateClip({
      apiKey: ppq.api_key,
      model: resolvedI2vModel,
      prompt: CLIP2_PROMPT,
      imageUrl: state.uploadedFrameUrl,
    });
    console.log(`  ✓ clip 2 url:      ${clip2.url}`);
    if (clip2.costUsd !== undefined) {
      console.log(`  ✓ clip 2 cost:     $${clip2.costUsd.toFixed(4)}`);
    }
    state.clip2 = {
      id: clip2.id,
      url: clip2.url,
      model: resolvedI2vModel,
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
