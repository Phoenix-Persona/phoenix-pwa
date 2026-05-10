/**
 * Test: does Veo 3.1 Fast preserve continuity across two clips when
 *
 *   (a) the user provides a "locked-down world" — verbatim character +
 *       setting + wardrobe + lighting + camera-language block in both
 *       prompts, and
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
 * Loads `.env` automatically.
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
 *   --text-model <id>        Override clip 1 model (default `veo3.1-fast`).
 *   --i2v-model <id>         Override clip 2 model (default `veo3.1-fast-i2v`).
 *   --aspect <ratio>         "9:16" (default), "16:9", "1:1".
 *   --duration <secs>        Per-clip duration (default 8).
 *   --quality <p>            "720p" (default) or "1080p".
 *   --manual-upload          Skip 0x0.st upload; prompt for a URL you host yourself.
 *   --upload-host <url>      Override the upload host (default https://0x0.st).
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
  textModel: flagValue("text-model") ?? "veo3.1-fast",
  i2vModel: flagValue("i2v-model") ?? "veo3.1-fast-i2v",
  aspect: (flagValue("aspect") ?? "9:16") as "9:16" | "16:9" | "1:1",
  duration: Number(flagValue("duration") ?? "8"),
  quality: (flagValue("quality") ?? "720p") as "720p" | "1080p",
  uploadHost: flagValue("upload-host") ?? "https://0x0.st",
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
  clip1?: { id: string; url: string };
  uploadedFrameUrl?: string;
  clip2?: { id: string; url: string };
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

async function uploadFrame(framePath: string): Promise<string> {
  if (flags.manualUpload) {
    console.log(
      `  --manual-upload: please host ${framePath} somewhere reachable by ppq.ai (Imgur, Blossom, gist raw, etc.) and paste the URL.`,
    );
    const pasted = (await ask("frame URL?")).trim();
    if (!pasted) throw new Error("no frame URL provided");
    return pasted;
  }

  console.log(`  uploading ${framePath} → ${flags.uploadHost} …`);
  const buf = await fs.readFile(framePath);
  const blob = new Blob([new Uint8Array(buf)], { type: "image/png" });
  const form = new FormData();
  form.set("file", blob, "last-frame.png");

  const res = await fetch(flags.uploadHost, {
    method: "POST",
    body: form,
    // 0x0.st requires a User-Agent — many Node fetch clients omit one and
    // get 403'd back. Set a sane default.
    headers: { "user-agent": "phoenix-test/0.1 (+https://phoenix.example)" },
  });
  if (!res.ok) {
    throw new Error(
      `upload to ${flags.uploadHost} failed (${res.status}). ` +
        `Re-run with --manual-upload to paste a URL of your own.`,
    );
  }
  const url = (await res.text()).trim();
  if (!/^https?:\/\//.test(url)) {
    throw new Error(
      `upload host returned non-URL response: ${url.slice(0, 200)}. ` +
        `Re-run with --manual-upload.`,
    );
  }
  console.log(`  uploaded:        ${url}`);
  return url;
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
    console.log(`  id:  ${state.clip1.id}`);
    console.log(`  url: ${state.clip1.url}`);
  } else if (flags.skipClip1) {
    throw new Error(
      "--skip-clip1 set, but no clip 1 is cached. Run without --skip-clip1 first.",
    );
  } else {
    header(`1. Clip 1 (text-to-video, ${flags.textModel})`);
    printPrompt("CLIP1_PROMPT", CLIP1_PROMPT);
    if (!(await askYesNo("Generate clip 1?"))) return;
    const clip1 = await generateClip({
      apiKey: ppq.api_key,
      model: flags.textModel,
      prompt: CLIP1_PROMPT,
    });
    console.log(`  ✓ clip 1 url:      ${clip1.url}`);
    if (clip1.costUsd !== undefined) {
      console.log(`  ✓ clip 1 cost:     $${clip1.costUsd.toFixed(4)}`);
    }
    state.clip1 = { id: clip1.id, url: clip1.url };
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
    if (
      !(await askYesNo(
        "Re-use the cached upload URL? (y) or upload a fresh copy? (n)",
        "y",
      ))
    ) {
      delete state.uploadedFrameUrl;
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
    header(`4. Clip 2 (image-to-video, ${flags.i2vModel})`);
    console.log(`  conditioning image: ${state.uploadedFrameUrl}`);
    printPrompt("CLIP2_PROMPT", CLIP2_PROMPT);
    if (!(await askYesNo("Generate clip 2?"))) return;
    const clip2 = await generateClip({
      apiKey: ppq.api_key,
      model: flags.i2vModel,
      prompt: CLIP2_PROMPT,
      imageUrl: state.uploadedFrameUrl,
    });
    console.log(`  ✓ clip 2 url:      ${clip2.url}`);
    if (clip2.costUsd !== undefined) {
      console.log(`  ✓ clip 2 cost:     $${clip2.costUsd.toFixed(4)}`);
    }
    state.clip2 = { id: clip2.id, url: clip2.url };
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
