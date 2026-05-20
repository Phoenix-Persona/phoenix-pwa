/**
 * Single-purpose probe: does ppq.ai's Veo 3 Fast accept image-to-video
 * when the conditioning image is on a properly-hosted public CDN
 * (not a fly-by-night file bin like uguu.se)?
 *
 * Earlier runs against `veo3-fast` returned 502 ("No providers available
 * for this model") with a uguu.se URL. The hypothesis under test: maybe
 * ppq.ai's worker silently rejected the image source rather than the
 * model genuinely lacking i2v support.
 *
 * What this script does:
 *   1. Pre-flight balance check.
 *   2. Submits ONE video gen job to the chosen model with the chosen
 *      `image_url`.
 *   3. Polls until completed / failed.
 *   4. Prints the result URL (or the failure verbatim).
 *
 * No clip 1, no ffmpeg, no upload chain, no caching. Just leg 2 in
 * isolation with a URL we trust.
 *
 * Run:
 *   npx tsx test/manual/ai-services/probe-veo-i2v-with-public-cdn.ts
 *   npx tsx test/manual/ai-services/probe-veo-i2v-with-public-cdn.ts --model kling-3.0
 *
 * Flags:
 *   --model <id>          Default `veo3-fast`. Try `kling-3.0`,
 *                         `runway-gen4`, etc. via --model.
 *   --no-image            Submit WITHOUT image_url (text-to-video only).
 *                         Use this to disprove the "image URL is the
 *                         problem" hypothesis — if the same model also
 *                         502s text-only, the route is broken.
 *   --image-url <url>     Override the conditioning image. Default:
 *                         https://cascdr-chads-stay-winning.nyc3.cdn.digitaloceanspaces.com/last-frame.png
 *   --prompt <text>       Override the prompt.
 *   --aspect <ratio>      "9:16" (default), "16:9", "1:1".
 *   --duration <secs>     Default 5.
 *   --quality <q>         Default depends on model (Veo: "720p", Kling: "standard").
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

const DEFAULT_PROMPT =
  `The same young Rwandan woman in the same calm sage-green home office, ` +
  `same cream linen blouse, same lighting, same posture as the conditioning ` +
  `image. Her expression turns serious and she speaks directly into the camera ` +
  `in clear English with a gentle Rwandan accent: "For too long, corruption ` +
  `inside our government has stolen what was promised to ordinary Rwandans. ` +
  `We deserve transparency." Camera holds rock-steady at eye level, medium ` +
  `close-up. 9:16 vertical. Cinematic, photorealistic, soft natural lighting.`;

const flags = {
  model: flagValue("model") ?? "veo3-fast",
  noImage: argv.includes("--no-image"),
  imageUrl: flagValue("image-url") ?? DEFAULT_IMAGE_URL,
  prompt: flagValue("prompt") ?? DEFAULT_PROMPT,
  aspect: (flagValue("aspect") ?? "9:16") as "9:16" | "16:9" | "1:1",
  duration: Number(flagValue("duration") ?? "5"),
  quality: flagValue("quality"),
};

// Text-only fallback prompt — used when --no-image is set so the prompt
// doesn't reference a conditioning image that wasn't provided.
const TEXT_ONLY_PROMPT =
  `A young Rwandan woman in her early thirties, warm brown skin, ` +
  `natural hair in a low bun, cream linen blouse, sits in a calm ` +
  `sage-green home office. Late afternoon golden window light from her ` +
  `left. She looks directly into the camera and speaks in clear English ` +
  `with a gentle Rwandan accent: "Hello, my name is Imani. I am a ` +
  `journalist from Kigali." Camera holds rock-steady, medium close-up. ` +
  `9:16 vertical, cinematic, photorealistic, soft natural lighting.`;

// Per-model default quality if the user didn't specify one.
function defaultQualityFor(model: string): string {
  if (/^kling/.test(model)) return "standard";
  return "720p";
}

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
  // If --no-image is set, swap the prompt for the text-only variant
  // (unless the user passed an explicit --prompt override).
  const userOverrodePrompt = flagValue("prompt") !== undefined;
  const promptToUse =
    flags.noImage && !userOverrodePrompt ? TEXT_ONLY_PROMPT : flags.prompt;

  const mode = flags.noImage ? "TEXT-TO-VIDEO (no image_url)" : "IMAGE-TO-VIDEO";
  console.log(`ppq.ai probe — ${mode}`);
  console.log("");
  console.log(`  model:       ${flags.model}`);
  if (flags.noImage) {
    console.log(`  image_url:   (omitted — --no-image)`);
  } else {
    console.log(`  image_url:   ${flags.imageUrl}`);
  }
  console.log(`  aspect:      ${flags.aspect}`);
  console.log(`  duration:    ${flags.duration}s`);
  const quality = flags.quality ?? defaultQualityFor(flags.model);
  console.log(`  quality:     ${quality}`);
  console.log("");
  console.log("  prompt:");
  for (const line of promptToUse.split("\n")) console.log(`  | ${line}`);
  console.log("");

  const ppq = await loadPpqAccount();

  // Pre-flight: just print balance, don't gate. This is a probe — the
  // user has already paid and they want signal fast.
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
    quality,
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
      console.log(`\n\n  ✓ ${flags.model} accepted i2v with this CDN.`);
      console.log(`  ✓ video url:   ${url}`);
      if (status.cost !== undefined) {
        console.log(`  ✓ cost:        ${fmtMoney(status.cost)}`);
      }
      console.log("");
      console.log("  Check the file: does it have audio? If yes — the");
      console.log("  earlier 502/404 wasn't about Veo's i2v capability,");
      console.log("  it was about the upload host. If no — confirms Veo");
      console.log("  on ppq.ai is silent on i2v even when it accepts the");
      console.log("  request.");
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
