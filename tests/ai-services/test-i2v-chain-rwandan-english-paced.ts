/**
 * Paced English-language i2v chain. Same shape as
 * `test-i2v-chain-rwandan-monologue.ts` but with the timing optimized:
 *
 *   - Default clip duration is 10s (vs 5s in the original) so the model
 *     has room to deliver the line at a natural conversational pace
 *     with breaths and pauses, rather than cramming.
 *   - Each segment's dialog is the same length as before; the longer
 *     clip just stretches the surrounding silence + emotional beats.
 *   - World block explicitly tells the model to speak slowly and leave
 *     natural pauses.
 *   - `--yes` flag skips the interactive confirmation prompt so the
 *     parallel runner (`run-monologue-tests-parallel.ts`) can drive
 *     this script headlessly.
 *
 * Run:
 *   npx tsx tests/ai-services/test-i2v-chain-rwandan-english-paced.ts
 *   npx tsx tests/ai-services/test-i2v-chain-rwandan-english-paced.ts --yes
 *
 * Requires `ffmpeg` on `$PATH` and tests/ai-services/.account.json.
 *
 * Cost: ~4 × $1 = ~$4 on seedance-2-fast at 10s clips. Pre-flight gate
 * at $6.
 *
 * Flags:
 *   --yes                 Skip the y/n confirmation (for runner use).
 *   --model <id>          Default `seedance-2-fast`. Stay in the
 *                         Seedance family or you lose audio/lip-sync.
 *   --clip-duration <s>   Per-clip duration. Default 10. ppq.ai's
 *                         Seedance accepts 5 or 10; pick the longest
 *                         the API allows for breathing room.
 *   --aspect <ratio>      "9:16" (default), "16:9", "1:1".
 *   --quality <q>         Default "720p".
 *   --num-clips <n>       Default 4.
 *   --seed-image <url>    Override the starting image.
 */

import "../_shared/loadEnv";

import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

import { getBalance } from "../../src/lib/ppq/client";
import {
  SEED_IMAGE_DEFAULT,
  downloadMp4,
  extractLastFrame,
  fmtMoney,
  generateClip,
  header,
  loadPpqAccount,
  uploadFrameViaChain,
} from "./_video-chain-helpers";

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
  yes: argv.includes("--yes"),
  model: flagValue("model") ?? "seedance-2-fast",
  clipDuration: Number(flagValue("clip-duration") ?? "10"),
  aspect: (flagValue("aspect") ?? "9:16") as "9:16" | "16:9" | "1:1",
  quality: flagValue("quality") ?? "720p",
  numClips: Number(flagValue("num-clips") ?? "4"),
  seedImage: flagValue("seed-image") ?? SEED_IMAGE_DEFAULT,
};

/* ---------- paths ---------- */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(SCRIPT_DIR, ".i2v-chain-english-paced");
const PPQ_ACCOUNT_PATH = path.join(SCRIPT_DIR, ".account.json");

/* ---------- prompts: locked-down world + per-clip action ---------- */

/**
 * The world block now explicitly directs the model toward a slower,
 * more deliberate delivery — natural pauses between clauses, room to
 * breathe between sentences. This is the fix for the "scrunched"
 * 5s output where the dialog was crammed in.
 */
const WORLD_BLOCK = `Medium close-up of a graceful young Rwandan woman in her early thirties with warm brown skin and natural hair pulled back. She wears a soft cream linen blouse. She sits in a calm sage-green home office. Late afternoon golden light streams from a window to her left. A framed family photo and a small Rwandan flag hang on the wall behind her. Camera holds rock-steady at eye level, medium close-up. 9:16 vertical, cinematic, photorealistic, soft natural lighting, shallow depth of field. She speaks directly into the camera in clear English with a gentle Rwandan accent, slowly and with measured conviction. Natural pauses between sentences. She breathes. Lip movements sync precisely with the spoken audio. Do NOT rush; let the silence between phrases carry weight.`;

/**
 * Same four segments as the original chain test, but the dialog is
 * unchanged — the longer 10s clip lets the model space the words with
 * natural pauses instead of compressing.
 */
const SCRIPT_SEGMENTS: { label: string; action: string }[] = [
  {
    label: "1 — hook",
    action: `Her expression is calm and resolved. She speaks slowly, leaving a brief pause after each sentence: "My name is Imani. The world admires Rwanda's recovery. Few people ask what it costs those of us who live here."`,
  },
  {
    label: "2 — press freedom",
    action: `Her expression hardens slightly. She continues at a measured pace, with a natural breath before the final sentence: "Journalists who criticize our government disappear. Some are jailed on vague charges. Press freedom in Rwanda is a fiction."`,
  },
  {
    label: "3 — political opposition",
    action: `Her tone becomes more urgent but still controlled, with deliberate pauses between names: "Opposition leaders are silenced before they can speak. Victoire Ingabire was jailed. Diane Rwigara was prosecuted. Dissent is criminalized."`,
  },
  {
    label: "4 — closing call",
    action: `Her expression softens with conviction. She speaks slowly, almost prayer-like, with full beats between phrases: "The economic miracle is real. So is the fear behind it. Rwandans deserve to speak. To vote. To dissent. To be free."`,
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
  if (flags.yes) return true;
  const ans = (await ask(`${prompt} (y/n)`, def)).toLowerCase();
  return ans === "y" || ans === "yes";
}

/* ---------- main ---------- */

const PREFLIGHT_USD_REQUIRED = 6;

async function main(): Promise<void> {
  const numClips = Math.max(
    1,
    Math.min(SCRIPT_SEGMENTS.length, flags.numClips),
  );

  console.log("Phoenix multi-clip i2v chain — English (paced)");
  console.log(
    `(${numClips} sequential ${flags.clipDuration}s clips, ${flags.model}, last-frame conditioning each step)`,
  );

  await fs.rm(CACHE_DIR, { recursive: true, force: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const ppq = await loadPpqAccount(PPQ_ACCOUNT_PATH);

  /* pre-flight */
  header("0. Pre-flight balance check");
  if (!ppq.credit_id) {
    console.log(
      `  Using PPQ_API_KEY from env — no credit_id available, balance check skipped.`,
    );
    console.log(
      `  (If you hit "insufficient credit" mid-run, top up via ppq.ai's dashboard.)`,
    );
  } else {
    const balance = await getBalance(ppq.credit_id);
    const balanceUsd = balance.balance_usd;
    if (typeof balanceUsd === "number") {
      console.log(`  ppq balance:     ${fmtMoney(balanceUsd)}`);
      console.log(
        `  required:        ≥ ${fmtMoney(PREFLIGHT_USD_REQUIRED)} (covers ~${numClips} × 10s clips)`,
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
  }

  /* preview */
  header("1. Locked-down world block");
  console.log(`\n${WORLD_BLOCK}\n`);

  header(`2. Monologue script (${numClips} segments, paced)`);
  for (let i = 0; i < numClips; i++) {
    console.log(`\n  Clip ${SCRIPT_SEGMENTS[i].label}:`);
    for (const line of SCRIPT_SEGMENTS[i].action.split("\n")) {
      console.log(`    | ${line}`);
    }
  }

  console.log(
    `\nThis run submits ${numClips} ${flags.model} jobs back to back, no caching.`,
  );
  console.log(`Estimated cost: ~${fmtMoney(numClips * 1.0)} at 10s clips.`);
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

    if (i < numClips - 1) {
      const mp4Path = path.join(CACHE_DIR, `clip-${i + 1}.mp4`);
      const framePath = path.join(CACHE_DIR, `frame-${i + 1}.png`);
      console.log(`  downloading clip ${i + 1} mp4 …`);
      await downloadMp4(clip.url, mp4Path);
      console.log(`  extracting last frame …`);
      await extractLastFrame(mp4Path, framePath);
      console.log(`  uploading frame for clip ${i + 2} conditioning …`);
      currentImageUrl = await uploadFrameViaChain(framePath);
    }
  }

  /* summary */
  header(
    `Done — ${numClips} clips, ~${numClips * flags.clipDuration}s of footage`,
  );
  for (const c of clipUrls) {
    console.log(`  Clip ${c.label}`);
    console.log(`    url:  ${c.url}`);
    if (c.costUsd !== undefined) {
      console.log(`    cost: ${fmtMoney(c.costUsd)}`);
    }
  }
  console.log(`\n  total cost: ${fmtMoney(totalCost)}`);
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
