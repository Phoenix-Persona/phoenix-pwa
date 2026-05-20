/**
 * Single-purpose probe: does ppq.ai's Seedance accept image-to-video
 * AND produce audio (lip-synced speech)?
 *
 * We've established two things from earlier probes:
 *   - Veo on ppq.ai is the only model with native lip-sync audio, but
 *     `image_url` returns 502 ("No providers available for this model").
 *   - Kling 3.0 / Kling 2.1 Master accept i2v but produce silent video.
 *
 * Open question: Seedance 2 — ByteDance's latest video model — may or
 * may not have native audio on ppq.ai's route. This probe finds out.
 *
 * What this script does:
 *   1. Pre-flight balance print (no gate).
 *   2. Submits ONE i2v video gen job to seedance-2 with a hard-coded
 *      DigitalOcean Spaces CDN image URL and a prompt that explicitly
 *      asks the woman to SAY "hello world" out loud.
 *   3. Polls until completed / failed.
 *   4. Prints the result URL — open it and check if there's audio.
 *
 * No clip 1, no ffmpeg, no upload chain, no caching. Pure probe.
 *
 * Run:
 *   npx tsx test/manual/ai-services/probe-seedance-i2v-with-speech.ts
 *   npx tsx test/manual/ai-services/probe-seedance-i2v-with-speech.ts --model seedance-2-fast
 *
 * Flags:
 *   --model <id>          Default `seedance-2-fast` (cheap + quick for
 *                         iteration). Promote to `seedance-2` for hero
 *                         renders, or `seedance-v1-lite` for the
 *                         older variant.
 *   --no-image            Submit WITHOUT image_url (text-to-video only).
 *                         Use to disprove the "image URL is the problem"
 *                         hypothesis on this model.
 *   --image-url <url>     Override the conditioning image. Default:
 *                         https://cascdr-chads-stay-winning.nyc3.cdn.digitaloceanspaces.com/last-frame.png
 *   --prompt <text>       Override the speech prompt.
 *   --aspect <ratio>      "9:16" (default), "16:9", "1:1".
 *   --duration <secs>     Default 5.
 *   --quality <q>         Default "720p".
 */

import "../_shared/loadEnv";

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getBalance,
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

const DEFAULT_IMAGE_URL =
  "https://cascdr-chads-stay-winning.nyc3.cdn.digitaloceanspaces.com/last-frame.png";

/**
 * Minimal speech prompt — just enough to test if the model produces
 * audio at all. Explicit about (a) the character continuing from the
 * conditioning image, (b) speaking aloud, (c) the exact words.
 */
const DEFAULT_PROMPT =
  `The same young Rwandan woman from the input image, in the same calm ` +
  `sage-green home office, same cream linen blouse, same lighting, same ` +
  `posture. She looks directly into the camera, smiles warmly, and ` +
  `clearly speaks the words: "Hello, world." Her lips move in sync with ` +
  `the spoken audio. Camera holds steady at eye level, medium close-up. ` +
  `9:16 vertical, cinematic, photorealistic.`;

const TEXT_ONLY_PROMPT =
  `A young Rwandan woman in a calm sage-green home office, late afternoon ` +
  `golden window light. She looks directly into the camera, smiles warmly, ` +
  `and clearly speaks the words: "Hello, world." Her lips move in sync ` +
  `with the spoken audio. Camera holds steady at eye level, medium ` +
  `close-up. 9:16 vertical, cinematic, photorealistic.`;

const flags = {
  // Default to -fast: same i2v + audio capability as seedance-2, but
  // cheaper and faster for iteration. Promote to `seedance-2` only for
  // hero / final renders.
  model: flagValue("model") ?? "seedance-2-fast",
  noImage: argv.includes("--no-image"),
  imageUrl: flagValue("image-url") ?? DEFAULT_IMAGE_URL,
  prompt: flagValue("prompt") ?? DEFAULT_PROMPT,
  aspect: (flagValue("aspect") ?? "9:16") as "9:16" | "16:9" | "1:1",
  duration: Number(flagValue("duration") ?? "5"),
  quality: flagValue("quality") ?? "720p",
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PPQ_ACCOUNT_PATH = path.join(SCRIPT_DIR, ".account.json");

/* ---------- helpers ---------- */

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
    "No ppq.ai account at test/manual/ai-services/.account.json. Run " +
      "`npx tsx test/manual/ai-services/test-all-ppq-services-e2e.ts` once.",
  );
}

function fmtMoney(usd: number | undefined | null): string {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "$?";
  return `$${usd.toFixed(4)}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- main ---------- */

async function main(): Promise<void> {
  // Swap to text-only prompt if --no-image and the user didn't override.
  const userOverrodePrompt = flagValue("prompt") !== undefined;
  const promptToUse =
    flags.noImage && !userOverrodePrompt ? TEXT_ONLY_PROMPT : flags.prompt;

  const mode = flags.noImage ? "TEXT-TO-VIDEO (no image_url)" : "IMAGE-TO-VIDEO";
  console.log(`ppq.ai Seedance probe — ${mode}`);
  console.log("(does Seedance produce lip-synced audio?)");
  console.log("");
  console.log(`  model:       ${flags.model}`);
  if (flags.noImage) {
    console.log(`  image_url:   (omitted — --no-image)`);
  } else {
    console.log(`  image_url:   ${flags.imageUrl}`);
  }
  console.log(`  aspect:      ${flags.aspect}`);
  console.log(`  duration:    ${flags.duration}s`);
  console.log(`  quality:     ${flags.quality}`);
  console.log("");
  console.log("  prompt:");
  for (const line of promptToUse.split("\n")) console.log(`  | ${line}`);
  console.log("");

  const ppq = await loadPpqAccount();

  try {
    const bal = await getBalance(ppq.credit_id);
    console.log(`  ppq balance: ${fmtMoney(bal.balance_usd)}`);
  } catch {
    /* non-fatal */
  }

  console.log("\nSubmitting…");
  const submitted = await submitVideo(ppq.api_key, {
    model: flags.model,
    prompt: promptToUse,
    aspect_ratio: flags.aspect,
    duration: flags.duration,
    quality: flags.quality,
    ...(flags.noImage ? {} : { image_url: flags.imageUrl }),
  });
  console.log(`  job id:        ${submitted.id}`);
  if (submitted.estimated_cost !== undefined) {
    console.log(`  estimated:     ${fmtMoney(submitted.estimated_cost)}`);
  }

  console.log("\nPolling /v1/videos/{id} every 5s…");
  const deadline = Date.now() + 12 * 60 * 1000;
  let last = "";
  let pollCount = 0;
  const start = Date.now();
  while (Date.now() < deadline) {
    const status = await getVideoStatus(ppq.api_key, submitted.id);
    pollCount++;
    if (status.status !== last) {
      if (pollCount > 1) process.stdout.write("\n");
      console.log(`  status: ${status.status}`);
      last = status.status;
    } else if (pollCount % 6 === 0) {
      const secs = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`  · still ${status.status} (${secs}s elapsed)\n`);
    } else {
      process.stdout.write(".");
    }
    if (status.status === "completed") {
      const url = status.data?.url;
      console.log(`\n\n  ✓ ${flags.model} accepted ${flags.noImage ? "t2v" : "i2v"}.`);
      console.log(`  ✓ video url:   ${url}`);
      if (status.cost !== undefined) {
        console.log(`  ✓ cost:        ${fmtMoney(status.cost)}`);
      }
      console.log("");
      console.log("  Open the file. Three things to check:");
      console.log("    1. Does it have audio at all? (the test signal)");
      console.log("    2. If yes — does she say 'hello world'? (lip-sync)");
      console.log("    3. Does the conditioning image's character carry?");
      console.log("");
      console.log("  If audio is present + lip-synced, Seedance is the answer");
      console.log("  to the multi-clip continuity-with-audio problem on ppq.ai.");
      return;
    }
    if (status.status === "failed") {
      console.log("");
      console.error(`\n  ✗ ${flags.model} FAILED`);
      console.error(`  error:         ${status.error ?? "(no error msg)"}`);
      console.error(`  full status:   ${JSON.stringify(status, null, 2)}`);
      throw new Error(`Job failed: ${status.error ?? "unknown"}`);
    }
    await sleep(5_000);
  }
  throw new Error(`Polling timed out after 12min on job ${submitted.id}`);
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.message : err);
  if (err && typeof err === "object" && "status" in err) {
    console.error("status:", (err as { status: unknown }).status);
  }
  if (err && typeof err === "object" && "body" in err) {
    console.error("body:", JSON.stringify((err as { body: unknown }).body, null, 2));
  }
  process.exitCode = 1;
});
