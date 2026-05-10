/**
 * Single-clip i2v test in Kinyarwanda — Rwanda's native language.
 *
 * Same hard-coded DigitalOcean Spaces seed image as the English chain.
 * Same locked-down world block. The clip's dialog is in Kinyarwanda
 * (with an English gloss preserved in the source for review).
 *
 * Goal: confirm seedance-2-fast can lip-sync non-English audio
 * convincingly. If yes, the persona can address Rwandans in their
 * native tongue — which is the real use case for an HRF-targeted
 * activist persona.
 *
 * Just one clip — no chain. Establishes the basic capability before
 * scaling to multi-clip Kinyarwanda monologues.
 *
 * Run:
 *   npx tsx tests/ai-services/test-i2v-clip-rwandan-kinyarwanda.ts
 *   npx tsx tests/ai-services/test-i2v-clip-rwandan-kinyarwanda.ts --yes
 *
 * Cost: ~$1 at 10s on seedance-2-fast. Pre-flight gate at $2.
 *
 * Flags:
 *   --yes                 Skip confirmation (for runner use).
 *   --model <id>          Default `seedance-2-fast`.
 *   --clip-duration <s>   Default 10. Pick the longest the API allows.
 *   --aspect <ratio>      "9:16" (default), "16:9", "1:1".
 *   --quality <q>         Default "720p".
 *   --seed-image <url>    Override the conditioning image.
 */

import "../_shared/loadEnv";

import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

import { getBalance } from "../../src/lib/ppq/client";
import {
  SEED_IMAGE_DEFAULT,
  fmtMoney,
  generateClip,
  header,
  loadPpqAccount,
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
  seedImage: flagValue("seed-image") ?? SEED_IMAGE_DEFAULT,
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PPQ_ACCOUNT_PATH = path.join(SCRIPT_DIR, ".account.json");

/* ---------- prompts ---------- */

/**
 * World block. Same Imani-in-home-office setup as the English chain.
 * Explicit instruction that the spoken language is Kinyarwanda — this
 * matters because the model's TTS layer needs to pick the right
 * phoneme set.
 */
const WORLD_BLOCK = `Medium close-up of a graceful young Rwandan woman in her early thirties with warm brown skin and natural hair pulled back. She wears a soft cream linen blouse. She sits in a calm sage-green home office. Late afternoon golden light streams from a window to her left. A framed family photo and a small Rwandan flag hang on the wall behind her. Camera holds rock-steady at eye level, medium close-up. 9:16 vertical, cinematic, photorealistic, soft natural lighting, shallow depth of field. She speaks directly into the camera in fluent Kinyarwanda (Rwanda's native language) with a natural Rwandan accent, slowly and with measured conviction. Natural pauses between sentences. Her lip movements sync precisely with the spoken Kinyarwanda audio.`;

/**
 * Kinyarwanda monologue. Approximate translation in the comment.
 * Topic mirrors the English chain: a journalist named Imani naming
 * the gap between Rwanda's image abroad and the lived reality of
 * suppression at home.
 *
 * Kinyarwanda text:
 *   "Muraho. Izina ryanjye ni Imani. Ndi umunyamakuru wo mu Kigali.
 *    Mu gihugu cyacu, ukuri ku burenganzira bwa muntu rwagize
 *    ingorane zo kuvugwa. Ariko ukuri kuracyari hano, mu mitima
 *    y'Abanyarwanda."
 *
 * English gloss:
 *   "Hello. My name is Imani. I am a journalist from Kigali. In our
 *    country, the truth about human rights has had difficulty being
 *    spoken. But the truth still lives here, in the hearts of
 *    Rwandans."
 */
const KINYARWANDA_DIALOG = `Muraho. Izina ryanjye ni Imani. Ndi umunyamakuru wo mu Kigali. Mu gihugu cyacu, ukuri ku burenganzira bwa muntu rwagize ingorane zo kuvugwa. Ariko ukuri kuracyari hano, mu mitima y'Abanyarwanda.`;

const CLIP_PROMPT = `${WORLD_BLOCK}

Her expression is calm and resolved. She speaks slowly in Kinyarwanda, leaving a brief pause after each sentence. She says, in Kinyarwanda: "${KINYARWANDA_DIALOG}"

(English translation for reference, NOT to be spoken: "Hello. My name is Imani. I am a journalist from Kigali. In our country, the truth about human rights has had difficulty being spoken. But the truth still lives here, in the hearts of Rwandans.")

She must speak the Kinyarwanda text, not the English translation.`;

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

const PREFLIGHT_USD_REQUIRED = 2;

async function main(): Promise<void> {
  console.log("Phoenix single-clip i2v test — Kinyarwanda");
  console.log(
    `(${flags.clipDuration}s clip, ${flags.model}, conditioned on the same seed image)`,
  );

  const ppq = await loadPpqAccount(PPQ_ACCOUNT_PATH);

  /* pre-flight */
  header("0. Pre-flight balance check");
  if (!ppq.credit_id) {
    console.log(
      `  Using PPQ_API_KEY from env — no credit_id available, balance check skipped.`,
    );
  } else {
    const balance = await getBalance(ppq.credit_id);
    const balanceUsd = balance.balance_usd;
    if (typeof balanceUsd === "number") {
      console.log(`  ppq balance:     ${fmtMoney(balanceUsd)}`);
      console.log(
        `  required:        ≥ ${fmtMoney(PREFLIGHT_USD_REQUIRED)} (covers 1 × 10s clip)`,
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

  header("2. Kinyarwanda dialog");
  console.log(`\n  Spoken (Kinyarwanda):`);
  console.log(`    | ${KINYARWANDA_DIALOG}`);
  console.log(`\n  English gloss (NOT spoken, for review):`);
  console.log(
    `    | Hello. My name is Imani. I am a journalist from Kigali.`,
  );
  console.log(
    `    | In our country, the truth about human rights has had`,
  );
  console.log(
    `    | difficulty being spoken. But the truth still lives here,`,
  );
  console.log(
    `    | in the hearts of Rwandans.`,
  );

  console.log(
    `\nThis run submits 1 ${flags.model} job. Estimated cost: ~${fmtMoney(1.0)}.`,
  );
  if (!(await askYesNo("Proceed?", "y"))) return;

  console.log(`\nSeed image: ${flags.seedImage}`);

  /* generate */
  header(`Clip 1/1 — Kinyarwanda monologue`);
  console.log(`  conditioning:  ${flags.seedImage}`);

  const clip = await generateClip({
    apiKey: ppq.api_key,
    model: flags.model,
    prompt: CLIP_PROMPT,
    imageUrl: flags.seedImage,
    aspect: flags.aspect,
    duration: flags.clipDuration,
    quality: flags.quality,
  });
  console.log(`  ✓ clip url:    ${clip.url}`);
  if (clip.costUsd !== undefined) {
    console.log(`  ✓ cost:        ${fmtMoney(clip.costUsd)}`);
  }

  /* summary */
  header("Done");
  console.log(`  Kinyarwanda clip url: ${clip.url}`);
  if (clip.costUsd !== undefined) {
    console.log(`  cost:                ${fmtMoney(clip.costUsd)}`);
  }
  console.log(
    `\nDownload the clip and check: does she clearly speak Kinyarwanda?`,
  );
  console.log(
    `Are her lips synced to the Kinyarwanda phonemes (not English)? If yes,`,
  );
  console.log(
    `seedance-2-fast handles non-English lip sync and we can scale this`,
  );
  console.log(`to a multi-clip Kinyarwanda chain next.`);
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
