/**
 * Top up your ppq.ai credit balance directly via a Lightning invoice.
 *
 * Single-purpose. No Spark wallet involvement, no inference test, no
 * cascade. Creates one BOLT11 invoice on ppq.ai for the USD amount you
 * specify, prints it, and polls until settled. Pay it from any
 * Lightning wallet (Phoenix, Wallet of Satoshi, Alby, your existing
 * Spark wallet — whatever you have).
 *
 * Use this when:
 *   - The continuity / inference / video test failed pre-flight with
 *     "insufficient ppq.ai credit" and you just need credit.
 *   - You want to top up without routing through the Spark wallet
 *     (e.g. Spark wallet is also lean).
 *
 * Run:
 *   npx tsx tests/ai-services/top-up-ppq-with-lightning.ts            # prompts for amount
 *   npx tsx tests/ai-services/top-up-ppq-with-lightning.ts --usd 5
 *
 * Loads `dev/.env` automatically.
 *
 * Flags:
 *   --usd <n>             USD amount to top up (skips the prompt if set).
 *   --timeout-mins <n>    How long to wait for invoice settlement (default 15).
 */

import "../_shared/loadEnv";

import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

import {
  createTopupInvoice,
  extractBolt11,
  getBalance,
  getTopupStatus,
  isTopupExpired,
  isTopupSettled,
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
  usd: flagValue("usd"),
  timeoutMins: Number(flagValue("timeout-mins") ?? "15"),
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PPQ_ACCOUNT_PATH = path.join(SCRIPT_DIR, ".account.json");

const rl = readline.createInterface({ input, output });

async function ask(prompt: string, def?: string): Promise<string> {
  const decorated = def ? `${prompt} [${def}] ` : `${prompt} `;
  const ans = (await rl.question(decorated)).trim();
  return ans.length ? ans : (def ?? "");
}

function fmtMoney(usd: number | undefined | null): string {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "$?";
  return `$${usd.toFixed(4)}`;
}

function header(title: string): void {
  console.log(`\n────── ${title} ──────`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- ppq account loader ---------- */

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

/* ---------- main ---------- */

async function main(): Promise<void> {
  console.log("ppq.ai — direct Lightning top-up (no Spark)");

  const ppq = await loadPpqAccount();

  header("1. Current balance");
  const before = await getBalance(ppq.credit_id);
  console.log(`  ppq balance: ${fmtMoney(before.balance_usd)}`);

  header("2. Pick a top-up amount");
  const usdStr = flags.usd ?? (await ask("USD amount to top up?", "5"));
  const usd = Number(usdStr);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error(`Invalid amount: ${usdStr}`);
  }
  console.log(`  amount: ${fmtMoney(usd)}`);

  header("3. Create Lightning invoice");
  const invoice = await createTopupInvoice(
    ppq.api_key,
    "btc-lightning",
    usd,
    "USD",
  );
  const bolt11 = extractBolt11(invoice);
  console.log(`  invoice id:   ${invoice.invoice_id}`);
  console.log(`  amount:       ${invoice.amount} ${invoice.currency}`);
  if (typeof invoice.crypto_amount_due === "number") {
    const sats = Math.ceil(invoice.crypto_amount_due * 1e8);
    console.log(`  satoshis:     ${sats.toLocaleString("en-US")}`);
  }

  if (!bolt11) {
    console.warn(
      "  No BOLT11 was extracted from the response. Full payload:",
    );
    console.warn(JSON.stringify(invoice, null, 2));
    throw new Error("No BOLT11 to pay");
  }

  console.log("\nPay this with any Lightning wallet:\n");
  console.log(bolt11);
  console.log("");
  if (typeof invoice.checkout_url === "string") {
    console.log(`(Or open the hosted checkout: ${invoice.checkout_url})\n`);
  }

  header("4. Polling for settlement");
  console.log(
    `Polling /topup/status every 3s (timeout ${flags.timeoutMins}min). Ctrl+C to abort.\n`,
  );
  const deadline = Date.now() + flags.timeoutMins * 60 * 1_000;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const s = await getTopupStatus(ppq.api_key, invoice.invoice_id);
    if (s.status !== lastStatus) {
      console.log(`  status: ${s.status}`);
      lastStatus = String(s.status);
    }
    if (isTopupSettled(s.status)) {
      const after = await getBalance(ppq.credit_id);
      console.log(
        `  ✓ settled. ppq balance: ${fmtMoney(before.balance_usd)} → ${fmtMoney(after.balance_usd)}`,
      );
      return;
    }
    if (isTopupExpired(s.status)) {
      throw new Error(
        `Invoice ${String(s.status).toLowerCase()}; nothing was charged.`,
      );
    }
    await sleep(3_000);
  }
  console.warn(
    `Polling timed out after ${flags.timeoutMins}min. The invoice may still settle later — ` +
      `re-check with the ppq.ai dashboard or run this script again.`,
  );
}

main()
  .catch((err) => {
    console.error("\n[FATAL]", err);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
