/**
 * Shared helpers for the i2v chain test scripts.
 *
 * Extracted from `test-i2v-chain-rwandan-monologue.ts` so the multiple
 * monologue variants (English-paced, Kinyarwanda single-clip, plus
 * future languages / scripts) can share a single battle-tested
 * pipeline without copy-pasting ~200 LOC each.
 *
 * No top-level execution — pure module exports.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  getVideoStatus,
  submitVideo,
} from "../../src/lib/ppq/client";

export const SEED_IMAGE_DEFAULT =
  "https://cascdr-chads-stay-winning.nyc3.cdn.digitaloceanspaces.com/last-frame.png";

/* ---------- ppq account ---------- */

/**
 * The shape returned by loadPpqAccount. `credit_id` may be empty when
 * the api_key came from PPQ_API_KEY env (e.g. when ppq.ai handed you
 * direct credits without a credit_id). Callers should guard balance
 * checks on `credit_id ? getBalance(credit_id) : skip`.
 */
export interface PpqAccountFile {
  credit_id: string;
  api_key: string;
}

/**
 * Resolve the ppq.ai credentials, in order of precedence:
 *
 *   1. `PPQ_API_KEY` env var (with optional `PPQ_CREDIT_ID`). This is
 *      the path for users who have a directly-issued api_key (free
 *      credits from ppq.ai's team) and don't want a credit_id-backed
 *      account file.
 *   2. The file at `accountPath` (typically test/manual/ai-services/.account.json),
 *      which carries both credit_id and api_key from a self-served
 *      `POST /accounts/create`.
 *
 * Either path returns the same shape; callers shouldn't care which
 * source produced it.
 */
export async function loadPpqAccount(
  accountPath: string,
): Promise<PpqAccountFile> {
  // Env wins — supports the "free credits, no account file" path.
  const envKey = process.env.PPQ_API_KEY;
  if (envKey && envKey.length > 0) {
    return {
      api_key: envKey,
      credit_id: process.env.PPQ_CREDIT_ID ?? "",
    };
  }

  // Fall back to the local account file.
  try {
    const raw = await fs.readFile(accountPath, "utf8");
    const parsed = JSON.parse(raw) as PpqAccountFile;
    if (parsed?.api_key && parsed?.credit_id) return parsed;
  } catch {
    /* fall through */
  }
  throw new Error(
    `No ppq.ai credentials found.\n\n` +
      `Either:\n` +
      `  • Set PPQ_API_KEY in dev/.env (use this if ppq.ai gave you a\n` +
      `    direct api_key for free credits), OR\n` +
      `  • Run \`npx tsx test/manual/ai-services/test-all-ppq-services-e2e.ts\` once\n` +
      `    to mint a credit_id-backed account at ${accountPath}.`,
  );
}

/* ---------- formatting ---------- */

export function fmtMoney(usd: number | undefined | null): string {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "$?";
  return `$${usd.toFixed(4)}`;
}

export function header(title: string): void {
  console.log(`\n────── ${title} ──────`);
}

export const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/* ---------- video submit + poll ---------- */

export interface ClipResult {
  id: string;
  url: string;
  costUsd?: number;
}

export interface GenerateClipArgs {
  apiKey: string;
  model: string;
  prompt: string;
  imageUrl?: string;
  aspect: "9:16" | "16:9" | "1:1";
  duration: number;
  quality: string;
}

export async function generateClip(
  args: GenerateClipArgs,
): Promise<ClipResult> {
  const submitted = await submitVideo(args.apiKey, {
    model: args.model,
    prompt: args.prompt,
    aspect_ratio: args.aspect,
    duration: args.duration,
    quality: args.quality,
    ...(args.imageUrl !== undefined ? { image_url: args.imageUrl } : {}),
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

export async function downloadMp4(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mp4 fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  console.log(
    `  saved ${buf.length.toLocaleString()} bytes → ${path.basename(dest)}`,
  );
}

/* ---------- ffmpeg: extract last frame ---------- */

export async function extractLastFrame(
  videoPath: string,
  framePath: string,
  ffmpegBin = "ffmpeg",
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
  await runCommand(ffmpegBin, args);
  const stat = await fs.stat(framePath);
  console.log(
    `  frame:         ${stat.size.toLocaleString()} bytes → ${path.basename(framePath)}`,
  );
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

export interface UploadProvider {
  name: string;
  url: string;
  fileField: string;
  extraFields?: Record<string, string>;
  parseResponse: (body: string) => string | undefined;
}

export const UPLOAD_PROVIDERS: UploadProvider[] = [
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

export async function uploadToProvider(
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

export async function uploadFrameViaChain(framePath: string): Promise<string> {
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
    `All upload providers failed:\n  - ${errors.join("\n  - ")}`,
  );
}
