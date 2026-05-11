/**
 * Fund the existing Phoenix wallet by an arbitrary number of sats.
 *
 * Reuses the persisted operator + encrypted persona from
 * `bootstrap-spark-wallet-e2e.ts`, reconnects the Spark wallet, and
 * generates one BOLT11 invoice for the amount you specify. Polls the
 * wallet balance until the invoice settles or you Ctrl+C.
 *
 * Run:
 *   npx tsx test/manual/wallet/fund-spark-wallet-with-sats.ts            # prompts for amount
 *   npx tsx test/manual/wallet/fund-spark-wallet-with-sats.ts --amount-sats 10000
 *   npx tsx test/manual/wallet/fund-spark-wallet-with-sats.ts --amount-sats 10000 --memo "demo top-up"
 *
 * Loads `.env` automatically.
 *
 * Flags:
 *   --amount-sats <n>     Amount to receive (skips the prompt if set).
 *   --memo <text>         Invoice memo. Defaults to "Phoenix wallet top-up".
 *   --timeout-mins <n>    How long to wait for inbound payment (default 10).
 */

import "../_shared/loadEnv";

import {
  connectWallet,
  disconnectWallet,
  loadWalletInfo,
  receiveBolt11,
  type WalletHandle,
} from "../../src/lib/wallet/client";

import {
  ask,
  fmtSats,
  header,
  loadOperator,
  loadPersonaOrFail,
  makeReadline,
  sleep,
} from "./_shared";

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
  amountSats: flagValue("amount-sats"),
  memo: flagValue("memo") ?? "Phoenix wallet top-up",
  timeoutMins: Number(flagValue("timeout-mins") ?? "10"),
};

const rl = makeReadline();

/* ---------- main ---------- */

async function main(): Promise<void> {
  console.log("Phoenix wallet — receive sats");
  if (!process.env.VITE_BREEZ_API_KEY) {
    console.warn(
      "VITE_BREEZ_API_KEY not found — add it to .env or export it in the shell.",
    );
  }

  let handle: WalletHandle | undefined;
  try {
    header("0. Reload wallet");
    const operator = await loadOperator();
    if (!operator) {
      throw new Error(
        "No operator key found. Run `npx tsx test/manual/wallet/bootstrap-spark-wallet-e2e.ts` first.",
      );
    }
    const envelope = await loadPersonaOrFail(operator);
    const mnemonic = envelope.wallet?.seed;
    if (!mnemonic) {
      throw new Error(
        "Persona envelope has no wallet seed. Re-run bootstrap-spark-wallet-e2e with --reset.",
      );
    }
    console.log("Connecting Spark wallet…");
    handle = await connectWallet({ mnemonic });

    const start = await loadWalletInfo(handle);
    console.log(`  starting balance: ${fmtSats(start.balanceSats)}`);

    header("1. Pick an amount");
    const amountStr =
      flags.amountSats ?? (await ask(rl, "Receive amount (sats)?", "10000"));
    const amountSats = Number(amountStr);
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      throw new Error(`Invalid amount: ${amountStr}`);
    }
    console.log(`  amount:           ${fmtSats(amountSats)}`);
    console.log(`  memo:             ${flags.memo}`);

    header("2. BOLT11 invoice");
    const inv = await receiveBolt11(handle, {
      amountSats,
      description: flags.memo,
    });
    console.log("\nPay this with any Lightning wallet:\n");
    console.log(inv.paymentRequest);
    console.log("");
    console.log(`(receive fee: ${fmtSats(inv.feeSats)})`);

    header("3. Polling for payment");
    console.log(
      `Polling balance every 4s (timeout ${flags.timeoutMins}min). Ctrl+C to abort.\n`,
    );
    const startBalance = start.balanceSats;
    const deadline = Date.now() + flags.timeoutMins * 60 * 1_000;
    while (Date.now() < deadline) {
      await sleep(4_000);
      const info = await loadWalletInfo(handle);
      if (info.balanceSats > startBalance) {
        const delta = info.balanceSats - startBalance;
        console.log(
          `  ✓ balance moved: ${fmtSats(startBalance)} → ${fmtSats(info.balanceSats)} (+${fmtSats(delta)})`,
        );
        return;
      }
    }
    console.warn(
      `Polling timed out after ${flags.timeoutMins}min. The invoice may still settle later.`,
    );
  } finally {
    rl.close();
    if (handle) {
      try {
        await disconnectWallet(handle);
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exitCode = 1;
});
