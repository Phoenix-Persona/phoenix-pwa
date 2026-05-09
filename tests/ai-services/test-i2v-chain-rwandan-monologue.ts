/**
 * End-to-end multi-clip i2v chain proof.
 *
 * Generates 4 back-to-back ~5s seedance-2-fast clips of the same
 * Rwandan woman delivering a scripted English monologue criticizing
 * the Rwandan government's human rights record. Each clip after the
 * first is image-to-video conditioned on the LAST FRAME of the
 * previous clip, so character + setting continuity carries through
 * the entire chain.
 *
 * Pipeline per segment:
 *   submit clip → download mp4 → ffmpeg last frame → upload frame →
 *   submitted as `image_url` for the next segment.
 *
 * Clip 1's conditioning image is the hard-coded DigitalOcean Spaces
 * portrait that established the proven Seedance i2v + audio path.
 *
 * No video merging — the script just prints the 4 clip URLs at the
 * end. Stitching is a separate concern (ffmpeg `concat`, premiere,
 * etc.). The point of this test is the model-side behavior: does
 * Seedance hold continuity across 3 sequential i2v hops?
 *
 * Run:
 *   npx tsx tests/ai-services/test-i2v-chain-rwandan-monologue.ts
 *
 * Loads `dev/.env`. Requires `ffmpeg` on `$PATH` and a populated
 * tests/ai-services/.account.json.
 *
 * Cost: ~4 × $0.50 = ~$2 on seedance-2-fast. Pre-flight gate at $4.
 *
 * Flags:
 *   --model <id>          Default `seedance-2-fast`. Stay in the
 *                         Seedance family or you lose audio/lip-sync.
 *   --clip-duration <s>   Per-clip duration. Default 5.
 *   --aspect <ratio>      "9:16" (default), "16:9", "1:1".
 *   --quality <q>         Default "720p".
 *   --num-clips <n>       Default 4. Lower for faster cheaper test.
 *   --seed-image <url>    Override the starting image. Default is the
 *                         hard-coded DigitalOcean Spaces portrait.
 *   --manual-upload       Paste each frame URL manually (skip auto-upload).
 *   --upload-host <url>   Pin uploads to a single host.
 *   --ffmpeg <path>       Override the ffmpeg binary path.
 */

import "../_shared/loadEnv";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

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

const DEFAULT_SEED_IMAGE =
  "https://cascdr-chads-stay-winning.nyc3.cdn.digitaloceanspaces.com/last-frame.png";

const flags = {
  model: flagValue("model") ?? "seedance-2-fast",
  clipDuration: Number(flagValue("clip-duration") ?? "5"),
  aspect: (flagValue("aspect") ?? "9:16") as "9:16" | "16:9" | "1:1",
  quality: flagValue("quality") ?? "720p",
  numClips: Number(flagValue("num-clips") ?? "4"),
  seedImage: flagValue("seed-image") ?? DEFAULT_SEED_IMAGE,
  manualUpload: argv.includes("--manual-upload"),
  uploadHost: flagValue("upload-host") ?? "",
  ffmpeg: flagValue("ffmpeg") ?? "ffmpeg",
};

/* ---------- paths ---------- */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(SCRIPT_DIR, ".i2v-chain");
const PPQ_ACCOUNT_PATH = path.join(SCRIPT_DIR, ".account.json");

/* ---------- prompts: locked-down world + per-clip action ---------- */

/**
 * The world block is verbatim in every prompt. Anything that should
 * stay constant across the 4 clips lives here.
 */
const WORLD_BLOCK = `Medium close-up of a graceful young Rwandan woman in her early thirties with warm brown skin and natural hair pulled back. She wears a soft cream linen blouse. She sits in a calm sage-green home office. Late afternoon golden light streams from a window to her left. A framed family photo and a small Rwandan flag hang on the wall behind her. Camera holds rock-steady at eye level, medium close-up. 9:16 vertical, cinematic, photorealistic, soft natural lighting, shallow depth of field. She speaks directly into the camera in clear English with a gentle Rwandan accent, with measured conviction. Lip movements sync precisely with the spoken audio.`;

/**
 * Four ~5-second segments of an English monologue criticizing the
 * Rwandan government's human rights record. Tight phrasing so each
 * segment fits comfortably in a 5-second clip.
 *
 * Topics covered (commonly cited in HRW / RSF / Amnesty reporting):
 *   1. Hook + framing the disconnect between Rwanda's image abroad
 *      and the experience of citizens at home.
 *   2. Press freedom — disappeared / jailed journalists.
 *   3. Political opposition — Ingabire, Rwigara, criminalization
 *      of dissent.
 *   4. Closing call — the economic miracle is real, so is the fear
 *      behind it.
 */
const SCRIPT_SEGMENTS: { label: string; action: string }[] = [
  {
    label: "1 — hook",
    action: `Her expression is calm and resolved. She says: "My name is Imani. The world admires Rwanda's recovery. Few people ask what it costs those of us who live here."`,
  },
  {
    label: "2 — press freedom",
    action: `Her expression hardens slightly. She continues: "Journalists who criticize our government disappear. Some are jailed on vague charges. Press freedom in Rwanda is a fiction."`,
  },
  {
    label: "3 — political opposition",
    action: `Her tone becomes more urgent. She says: "Opposition leaders are silenced before they can speak. Victoire Ingabire was jailed. Diane Rwigara was prosecuted. Dissent is criminalized."`,
  },
  {
    label: "4 — closing call",
    action: `Her expression softens with conviction. She concludes: "The economic miracle is real. So is the fear behind it. Rwandans deserve to speak, to vote, to dissent. To be free."`,
  },
];

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

function fmtMoney(usd: number | undefined | null): string {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "$?";
  return `$${usd.toFixed(4)}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- ppq account ---------- */

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
    "No ppq.ai account at tests/ai-services/.account.json. Run " +
      "`npx tsx tests/ai-services/test-all-ppq-services-e2e.ts` once.",
  );
}

/* ---------- video submit + poll ---------- */

interface ClipResult {
  id: string;
  url: string;
  costUsd?: number;
}

async function generateClip(args: {
  apiKey: string;
  model: string;
  prompt: string;
  imageUrl: string;
  aspect: "9:16" | "16:9" | "1:1";
  duration: number;
  quality: string;
}): Promise<ClipResult> {
  const submitted = await submitVideo(args.apiKey, {
    model: args.model,
    prompt: args.prompt,
    aspect_ratio: args.aspect,
    duration: args.duration,
    quality: args.quality,
    image_url: args.imageUrl,
  });
  console.log(`  job id:        ${submitted.id}`);
  if (submitted.estimated_cost !== undefined) {
    console.log(`  estimated:     ${fmtMoney(submitted.estimated_cost)}`);
  }

  const deadline = Date.now() + 12 * 60 * 1000;
  let last = "";
  let pollCount = 0;
  const start = Date.now();
  while (Date.now() < deadline) {
    const status = await getVideoStatus(args.apiKey, submitted.id);
    pollCount++;
    if (status.status !== last) {
      if (pollCount > 1) process.stdout.write("\n");
      console.log(`  status:        ${status.status}`);
      last = status.status;
    } else if (pollCount % 6 === 0) {
      const secs = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`  · still ${status.status} (${secs}s elapsed)\n`);
    } else {
      process.stdout.write(".");
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
  console.log(`  saved ${buf.length.toLocaleString()} bytes → ${path.basename(dest)}`);
}

/* ---------- ffmpeg: extract last frame ---------- */

async function extractLastFrame(
  videoPath: string,
  framePath: string,
): Promise<void> {
  await fs.rm(framePath, { force: true });
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
  console.log(`  frame:         ${stat.size.toLocaleString()} bytes → ${path.basename(framePath)}`);
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
          `failed to run \`${cmd}\` (${err.message}). Install ffmpeg or pass --ffmpeg.`,
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

const UPLOAD_PROVIDERS: UploadProvider[] = [
  {
    name: "catbox.moe",
    url: "https://catbox.moe/user/api.php",
    fileField: "fileToUpload",
    extraFields: { reqtype: "fileupload" },
    parseResponse: (b) => {
      const t = b.trim();
      return /^https?:\/\//.test(t) ? t : undefined;
    },
  },
  {
    name: "uguu.se",
    url: "https://uguu.se/upload.php",
    fileField: "files[]",
    parseResponse: (b) => {
      try {
        const j = JSON.parse(b) as { files?: Array<{ url?: string }> };
        const url = j.files?.[0]?.url;
        return typeof url === "string" ? url : undefined;
      } catch {
        return undefined;
      }
    },
  },
  {
    name: "0x0.st",
    url: "https://0x0.st",
    fileField: "file",
    parseResponse: (b) => {
      const t = b.trim();
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
    form.set(provider.fileField, blob, "frame.png");
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

async function uploadFrame(framePath: string): Promise<string> {
  if (flags.manualUpload) {
    console.log(
      `  --manual-upload: host ${framePath} somewhere reachable by ppq.ai and paste the URL.`,
    );
    const pasted = (await ask("frame URL?")).trim();
    if (!pasted) throw new Error("no frame URL provided");
    return pasted;
  }

  if (flags.uploadHost) {
    return uploadToProvider(framePath, {
      name: flags.uploadHost,
      url: flags.uploadHost,
      fileField: "file",
      parseResponse: (b) => {
        const t = b.trim();
        return /^https?:\/\//.test(t) ? t : undefined;
      },
    });
  }

  const errors: string[] = [];
  for (const provider of UPLOAD_PROVIDERS) {
    try {
      const url = await uploadToProvider(framePath, provider);
      console.log(`  uploaded:      ${provider.name} → ${url}`);
      return url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗ ${provider.name}: ${msg}`);
      errors.push(`${provider.name}: ${msg}`);
    }
  }
  throw new Error(
    `All upload providers failed:\n  - ${errors.join("\n  - ")}\n\n` +
      `Re-run with --manual-upload or --upload-host <url>.`,
  );
}

/* ---------- main ---------- */

const PREFLIGHT_USD_REQUIRED = 4;

async function main(): Promise<void> {
  const numClips = Math.max(
    1,
    Math.min(SCRIPT_SEGMENTS.length, flags.numClips),
  );

  console.log("Phoenix multi-clip i2v chain test");
  console.log(
    `(${numClips} sequential ${flags.clipDuration}s clips, ${flags.model}, last-frame conditioning each step)`,
  );

  await fs.rm(CACHE_DIR, { recursive: true, force: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const ppq = await loadPpqAccount();

  /* pre-flight */
  header("0. Pre-flight balance check");
  const balance = await getBalance(ppq.credit_id);
  const balanceUsd = balance.balance_usd;
  if (typeof balanceUsd === "number") {
    console.log(`  ppq balance:     ${fmtMoney(balanceUsd)}`);
    console.log(
      `  required:        ≥ ${fmtMoney(PREFLIGHT_USD_REQUIRED)} (covers ~${numClips} clips with margin)`,
    );
    if (balanceUsd < PREFLIGHT_USD_REQUIRED) {
      const need = (PREFLIGHT_USD_REQUIRED - balanceUsd).toFixed(2);
      throw new Error(
        `Insufficient ppq.ai credit. Top up at least $${need} more:\n\n` +
          `  npx tsx tests/ai-services/top-up-ppq-with-lightning.ts --usd ${Math.ceil(parseFloat(need))}`,
      );
    }
  } else {
    console.warn(
      "  Could not parse ppq.ai balance — proceeding anyway. Raw payload:",
    );
    console.warn(JSON.stringify(balance.raw, null, 2));
  }

  /* preview script */
  header("1. Locked-down world block");
  console.log(`\n${WORLD_BLOCK}\n`);

  header(`2. Monologue script (${numClips} segments)`);
  for (let i = 0; i < numClips; i++) {
    console.log(`\n  Clip ${SCRIPT_SEGMENTS[i].label}:`);
    for (const line of SCRIPT_SEGMENTS[i].action.split("\n")) {
      console.log(`    | ${line}`);
    }
  }

  /* single confirmation */
  console.log(
    `\nThis run submits ${numClips} ${flags.model} jobs back to back, no caching.`,
  );
  console.log(`Estimated cost: ~${fmtMoney(numClips * 0.5)} (rough).`);
  if (!(await askYesNo("Proceed end to end?", "y"))) return;

  /* chain */
  let currentImageUrl = flags.seedImage;
  console.log(`\nSeed image: ${currentImageUrl}`);

  const clipUrls: { label: string; url: string; costUsd?: number }[] = [];
  let totalCost = 0;

  for (let i = 0; i < numClips; i++) {
    const segment = SCRIPT_SEGMENTS[i];
    header(`Clip ${i + 1}/${numClips} — ${segment.label}`);
    console.log(`  conditioning:  ${currentImageUrl}`);

    const prompt = `${WORLD_BLOCK}\n\n${segment.action}`;
    const clip = await generateClip({
      apiKey: ppq.api_key,
      model: flags.model,
      prompt,
      imageUrl: currentImageUrl,
      aspect: flags.aspect,
      duration: flags.clipDuration,
      quality: flags.quality,
    });
    console.log(`  ✓ clip url:    ${clip.url}`);
    if (clip.costUsd !== undefined) {
      console.log(`  ✓ cost:        ${fmtMoney(clip.costUsd)}`);
      totalCost += clip.costUsd;
    }
    clipUrls.push({
      label: segment.label,
      url: clip.url,
      costUsd: clip.costUsd,
    });

    // If this isn't the last clip, extract + upload the last frame to
    // become the next clip's conditioning image.
    if (i < numClips - 1) {
      const mp4Path = path.join(CACHE_DIR, `clip-${i + 1}.mp4`);
      const framePath = path.join(CACHE_DIR, `frame-${i + 1}.png`);
      console.log(`  downloading clip ${i + 1} mp4 …`);
      await downloadMp4(clip.url, mp4Path);
      console.log(`  extracting last frame …`);
      await extractLastFrame(mp4Path, framePath);
      console.log(`  uploading frame for clip ${i + 2} conditioning …`);
      currentImageUrl = await uploadFrame(framePath);
    }
  }

  /* summary */
  header(`Done — ${numClips} clips, ~${numClips * flags.clipDuration}s of footage`);
  for (const c of clipUrls) {
    console.log(`  Clip ${c.label}`);
    console.log(`    url:  ${c.url}`);
    if (c.costUsd !== undefined) {
      console.log(`    cost: ${fmtMoney(c.costUsd)}`);
    }
  }
  console.log(`\n  total cost: ${fmtMoney(totalCost)}`);
  console.log(
    `\nDownload each URL and inspect: does the woman look like the same person`,
  );
  console.log(
    `across all ${numClips} clips? Does her room/wardrobe/lighting hold? Does each`,
  );
  console.log(
    `clip have lip-synced audio for its segment of the monologue?`,
  );
  console.log(
    `\nMerging is out of scope for this test. Use ffmpeg concat for that:`,
  );
  console.log(`  ffmpeg -f concat -safe 0 -i list.txt -c copy stitched.mp4`);
}

main()
  .catch((err) => {
    console.error("\n[FATAL]", err instanceof Error ? err.message : err);
    if (err && typeof err === "object" && "status" in err) {
      console.error("status:", (err as { status: unknown }).status);
    }
    if (err && typeof err === "object" && "body" in err) {
      console.error(
        "body:",
        JSON.stringify((err as { body: unknown }).body, null, 2),
      );
    }
    process.exitCode = 1;
  })
  .finally(() => rl.close());
