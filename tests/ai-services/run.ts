/**
 * Manual end-to-end smoke test for the ppq.ai integration.
 *
 * Walks each primitive: account creation → balance → Lightning topup
 * → general-purpose inference → image generation → video generation
 * (Veo 3). Each step is interactive (y/n) so you can run a subset.
 *
 * Run:
 *   npx tsx tests/ai-services/run.ts
 *
 * Flags:
 *   --reset            Wipe the persisted account before starting
 *   --base=<url>       Override PPQ_API_BASE
 *   --skip-balance     Don't fail if /credits/balance hiccups
 *
 * Env:
 *   PPQ_API_BASE       Same as --base
 *   PPQ_INFERENCE_MODEL  Override the chat model (default claude-sonnet-4.5)
 *   PPQ_IMAGE_MODEL    Override the image model (default: first listed)
 *   PPQ_VIDEO_MODEL    Override the video model (default: first listed Veo 3)
 *
 * The persisted account is written to tests/ai-services/.account.json.
 * That file is gitignored — but it grants spending power, so don't commit it.
 */

// Load dev/.env into process.env BEFORE any module that reads env vars.
import "../_shared/loadEnv";

import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

import {
  chatCompletion,
  createAccount,
  createTopupInvoice,
  extractBolt11,
  generateImage,
  getBalance,
  getTopupStatus,
  getVideoStatus,
  isTopupSettled,
  isTopupExpired,
  listModels,
  submitVideo,
  type PpqRequestOptions,
} from "../../src/lib/ppq/client";
import type { PpqAccount, PpqVideoStatusResponse } from "../../src/lib/ppq/types";

/* ---------- arg parsing ---------- */

const argv = process.argv.slice(2);
const flags = {
  reset: argv.includes("--reset"),
  skipBalance: argv.includes("--skip-balance"),
  skipTopup: argv.includes("--skip-topup"),
  resumeTopup: argv.includes("--resume-topup"),
  base:
    argv.find((a) => a.startsWith("--base="))?.slice(7) ??
    process.env.PPQ_API_BASE,
  invoiceId:
    argv.find((a) => a.startsWith("--invoice-id="))?.slice("--invoice-id=".length) ??
    process.env.PPQ_INVOICE_ID,
};

const baseOpts: PpqRequestOptions = flags.base ? { baseUrl: flags.base } : {};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNT_PATH = path.join(SCRIPT_DIR, ".account.json");
const LAST_INVOICE_PATH = path.join(SCRIPT_DIR, ".last-invoice.json");

interface LastInvoice {
  invoice_id: string;
  created_at: number;
  amount: number | string;
  currency: string;
}

async function loadLastInvoice(): Promise<LastInvoice | null> {
  try {
    const raw = await fs.readFile(LAST_INVOICE_PATH, "utf8");
    const parsed = JSON.parse(raw) as LastInvoice;
    return parsed?.invoice_id ? parsed : null;
  } catch {
    return null;
  }
}

async function saveLastInvoice(inv: LastInvoice): Promise<void> {
  await fs.writeFile(LAST_INVOICE_PATH, JSON.stringify(inv, null, 2), {
    mode: 0o600,
  });
}

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

function fmtMoney(usd: number | undefined | null): string {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "$?";
  return `$${usd.toFixed(4)}`;
}

function header(title: string) {
  console.log(`\n────── ${title} ──────`);
}

/* ---------- account persistence ---------- */

async function loadAccount(): Promise<PpqAccount | null> {
  try {
    const raw = await fs.readFile(ACCOUNT_PATH, "utf8");
    const parsed = JSON.parse(raw) as PpqAccount;
    if (parsed?.api_key && parsed?.credit_id) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function saveAccount(acct: PpqAccount): Promise<void> {
  await fs.mkdir(path.dirname(ACCOUNT_PATH), { recursive: true });
  await fs.writeFile(ACCOUNT_PATH, JSON.stringify(acct, null, 2), {
    mode: 0o600,
  });
}

/* ---------- steps ---------- */

async function ensureAccount(): Promise<PpqAccount> {
  if (flags.reset) {
    await fs.rm(ACCOUNT_PATH, { force: true });
    console.log("Reset: cleared persisted account.");
  }

  let acct = await loadAccount();
  if (acct) {
    console.log(`Loaded persisted account from ${ACCOUNT_PATH}`);
  } else {
    console.log("No persisted account found — creating a fresh ppq.ai account…");
    acct = await createAccount(baseOpts);
    await saveAccount(acct);
    console.log(`Created and saved to ${ACCOUNT_PATH}`);
  }

  console.log(`  credit_id: ${acct.credit_id}`);
  console.log(`  api_key:   ${acct.api_key.slice(0, 12)}…${acct.api_key.slice(-4)}`);
  return acct;
}

async function showBalance(acct: PpqAccount): Promise<number | null> {
  try {
    const b = await getBalance(acct.credit_id, baseOpts);
    if (typeof b.balance_usd === "number") {
      console.log(`Current balance: ${fmtMoney(b.balance_usd)}`);
      return b.balance_usd;
    }
    console.warn(
      "Balance response did not include a recognizable balance field.",
    );
    console.warn("Raw payload:");
    console.warn(JSON.stringify(b.raw, null, 2));
    return null;
  } catch (err) {
    if (flags.skipBalance) {
      console.warn("Balance check failed (continuing):", (err as Error).message);
      return null;
    }
    throw err;
  }
}

async function pollInvoice(
  acct: PpqAccount,
  invoiceId: string,
  timeoutMs = 10 * 60 * 1000,
): Promise<"settled" | "expired" | "timeout"> {
  console.log("Polling status every 3s. Ctrl+C to abort.\n");
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const s = await getTopupStatus(acct.api_key, invoiceId, baseOpts);
    if (s.status !== lastStatus) {
      console.log(`  status: ${s.status}`);
      lastStatus = s.status;
    }
    if (isTopupSettled(s.status)) {
      console.log("Topup settled.");
      await showBalance(acct);
      return "settled";
    }
    if (isTopupExpired(s.status)) {
      console.log(`Invoice ${String(s.status).toLowerCase()}.`);
      return "expired";
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  console.log("Polling timed out. The invoice may still settle later.");
  return "timeout";
}

async function resumeInvoiceStep(
  acct: PpqAccount,
  invoiceId: string,
): Promise<boolean> {
  console.log(`Resuming invoice: ${invoiceId}`);
  // First poll once before any prompts — if it's already settled, just say so.
  const initial = await getTopupStatus(acct.api_key, invoiceId, baseOpts);
  console.log(`  current status: ${initial.status}`);
  if (isTopupSettled(initial.status)) {
    console.log("Already settled — skipping payment wait.");
    await showBalance(acct);
    return true;
  }
  if (isTopupExpired(initial.status)) {
    console.log(`Invoice ${String(initial.status).toLowerCase()} — cannot resume.`);
    return false;
  }
  await pollInvoice(acct, invoiceId);
  return true;
}

async function topupStep(acct: PpqAccount): Promise<void> {
  if (flags.skipTopup) {
    console.log("Skipping topup (--skip-topup).");
    return;
  }

  // Explicit invoice id — non-interactive resume.
  if (flags.invoiceId) {
    await resumeInvoiceStep(acct, flags.invoiceId);
    return;
  }

  // Resume the most recently created invoice from disk.
  if (flags.resumeTopup) {
    const last = await loadLastInvoice();
    if (!last) {
      console.warn("No saved invoice to resume — falling through to create flow.");
    } else {
      console.log(
        `Last invoice: ${last.invoice_id} (${last.amount} ${last.currency})`,
      );
      await resumeInvoiceStep(acct, last.invoice_id);
      return;
    }
  }

  // Otherwise prompt: resume the saved one, or create a new one, or skip.
  const last = await loadLastInvoice();
  if (last) {
    const resume = await askYesNo(
      `Resume saved invoice ${last.invoice_id} (${last.amount} ${last.currency})?`,
      "y",
    );
    if (resume) {
      await resumeInvoiceStep(acct, last.invoice_id);
      return;
    }
  }

  const wantTopup = await askYesNo(
    "Create a new Lightning topup? (you'll pay the BOLT11 manually)",
    last ? "n" : "n",
  );
  if (!wantTopup) return;

  const amountStr = await ask("USD amount to top up?", "1");
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.warn("Invalid amount — skipping topup.");
    return;
  }

  const invoice = await createTopupInvoice(
    acct.api_key,
    "btc-lightning",
    amount,
    "USD",
    baseOpts,
  );
  await saveLastInvoice({
    invoice_id: invoice.invoice_id,
    created_at: Math.floor(Date.now() / 1000),
    amount: invoice.amount,
    currency: String(invoice.currency),
  });
  const bolt11 = extractBolt11(invoice);

  console.log(`Invoice id: ${invoice.invoice_id}`);
  console.log(`Expires:    ${invoice.expires_at}`);
  console.log(`Amount:     ${invoice.amount} ${invoice.currency}`);

  if (bolt11) {
    console.log("\nPay this BOLT11 with any Lightning wallet:\n");
    console.log(bolt11);
    console.log("");
    if (typeof invoice.checkout_url === "string") {
      console.log(`(Or open the hosted checkout: ${invoice.checkout_url})\n`);
    }
  } else {
    console.log("\nNo BOLT11 was extracted from the response. Full payload:");
    console.log(JSON.stringify(invoice, null, 2));
    console.log("");
  }

  console.log(
    `(Saved to ${path.basename(LAST_INVOICE_PATH)} — re-run with --resume-topup to ` +
      `pick up here without paying again.)\n`,
  );

  await pollInvoice(acct, invoice.invoice_id);
}

async function inferenceStep(acct: PpqAccount): Promise<void> {
  if (!(await askYesNo("Run hello-world inference?"))) return;

  const model = process.env.PPQ_INFERENCE_MODEL ?? "claude-sonnet-4.5";
  console.log(`  model: ${model}`);
  const res = await chatCompletion(
    acct.api_key,
    {
      model,
      messages: [
        {
          role: "user",
          content: 'Reply with exactly the phrase "hello world" — nothing else.',
        },
      ],
    },
    baseOpts,
  );
  const text = res.choices?.[0]?.message?.content ?? "(no content)";
  console.log(`  response: ${text}`);
  if (res.usage) {
    console.log(
      `  usage: prompt=${res.usage.prompt_tokens} completion=${res.usage.completion_tokens}`,
    );
  }
}

async function imageStep(acct: PpqAccount): Promise<void> {
  if (!(await askYesNo("Run image generation?"))) return;

  let model = process.env.PPQ_IMAGE_MODEL;
  if (!model) {
    const imageModels = await listModels("image", baseOpts);
    if (!imageModels.length) {
      console.warn("No image models advertised — skipping.");
      return;
    }
    model = imageModels[0]!.id;
    console.log(
      `  available image models: ${imageModels.map((m) => m.id).join(", ")}`,
    );
  }
  console.log(`  model: ${model}`);

  const prompt =
    (await ask("  prompt?", "a friendly cartoon phoenix waving hello")) ||
    "a friendly cartoon phoenix waving hello";

  const res = await generateImage(
    acct.api_key,
    { model, prompt, size: "1:1", n: 1 },
    baseOpts,
  );
  console.log(`  cost: ${fmtMoney(res.cost ?? 0)}`);
  for (const item of res.data ?? []) {
    console.log(`  image url: ${item.url}`);
  }
}

async function videoStep(acct: PpqAccount): Promise<void> {
  if (!(await askYesNo("Run video generation (Veo 3)?", "n"))) return;

  const model = process.env.PPQ_VIDEO_MODEL ?? "veo3-fast";
  console.log(`  model: ${model}`);

  const prompt =
    (await ask(
      "  prompt?",
      "A small cartoon phoenix waving its wing, saying hello world, sunny background",
    )) ||
    "A small cartoon phoenix waving its wing, saying hello world, sunny background";

  const submitted = await submitVideo(
    acct.api_key,
    {
      model,
      prompt,
      aspect_ratio: "16:9",
      duration: 8,
      quality: "720p",
    },
    baseOpts,
  );
  console.log(`  job id: ${submitted.id}`);
  if (submitted.estimated_cost !== undefined) {
    console.log(`  estimated cost: ${fmtMoney(submitted.estimated_cost)}`);
  }
  console.log("  Polling every 4s (max 6 min). Ctrl+C to abort.");

  const deadline = Date.now() + 6 * 60 * 1000;
  let last: PpqVideoStatusResponse["status"] | undefined;
  while (Date.now() < deadline) {
    const s = await getVideoStatus(acct.api_key, submitted.id, baseOpts);
    if (s.status !== last) {
      console.log(`  status: ${s.status}`);
      last = s.status;
    }
    if (s.status === "completed") {
      console.log(`  video url: ${s.data?.url}`);
      if (s.cost !== undefined) console.log(`  final cost: ${fmtMoney(s.cost)}`);
      return;
    }
    if (s.status === "failed") {
      console.warn(`  job failed: ${s.error ?? "(no error message)"}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 4_000));
  }
  console.log(
    `Polling timed out. Re-run with: PPQ_VIDEO_JOB=${submitted.id} (job stays alive on ppq.ai).`,
  );
}

/* ---------- main ---------- */

async function main() {
  console.log(`ppq.ai integration smoke test — base ${flags.base ?? "(default)"}`);

  try {
    header("1. Account");
    const acct = await ensureAccount();

    header("2. Balance");
    await showBalance(acct);

    header("3. Lightning Topup (manual pay)");
    await topupStep(acct);

    header("4. Inference (general-purpose)");
    await inferenceStep(acct);

    header("5. Image Generation");
    await imageStep(acct);

    header("6. Video Generation (Veo 3)");
    await videoStep(acct);

    header("Done");
    await showBalance(acct);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exitCode = 1;
});
