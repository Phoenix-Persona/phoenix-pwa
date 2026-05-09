/**
 * Follow-up integration test that picks up where
 * `bootstrap-spark-wallet-e2e.ts` leaves off.
 *
 * Reuses the persisted operator + encrypted persona + Spark wallet, then
 * exercises three distinct flows:
 *
 *   1. Hello-world inference. Confirms ppq.ai chat completions work with
 *      whatever credit balance the persona is carrying. Cheap (~$0.001).
 *
 *   2. Non-auto-topup path. Calls `runAutoTopupOnce({ enabled: false, … })`
 *      and asserts the policy short-circuits to `null` without paying any
 *      invoice. Validates the off switch.
 *
 *   3. Forced auto-topup path. Calls `runAutoTopupOnce` with a threshold
 *      raised above the current ppq balance so the policy *must* trigger;
 *      issues a Lightning invoice on ppq.ai, pays it from the Spark wallet,
 *      polls until settled, then re-reads the balance to prove the credit
 *      landed.
 *
 * Run:
 *   npx tsx tests/wallet/test-auto-topup-and-inference.ts
 *
 * Loads `dev/.env` automatically.
 *
 * Flags:
 *   --skip-inference         Don't run the chat completion call
 *   --skip-disabled          Don't run the disabled-policy assertion
 *   --skip-forced            Don't run the forced topup (it costs real sats)
 *   --topup-target <usd>     Override the forced-topup target (default 0.50 above current balance)
 *   --topup-threshold <usd>  Override the forced-topup threshold (default 1000)
 *   --inference-model <id>   Override the inference model (default claude-sonnet-4.5)
 */

import "../_shared/loadEnv";

import {
  connectWallet,
  disconnectWallet,
  loadWalletInfo,
  type WalletHandle,
} from "../../src/lib/wallet/client";
import { runAutoTopupOnce } from "../../src/lib/wallet/autoTopup";
import {
  chatCompletion,
  getBalance as getPpqBalance,
} from "../../src/lib/ppq/client";

import {
  askYesNo,
  fmtMoney,
  fmtSats,
  header,
  loadOperator,
  loadPersonaOrFail,
  loadPpqAccount,
  makeReadline,
  type PpqAccountFile,
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
  skipInference: argv.includes("--skip-inference"),
  skipDisabled: argv.includes("--skip-disabled"),
  skipForced: argv.includes("--skip-forced"),
  topupTarget: flagValue("topup-target"),
  topupThreshold: Number(flagValue("topup-threshold") ?? "1000"),
  inferenceModel: flagValue("inference-model") ?? "claude-sonnet-4.5",
};

const rl = makeReadline();

/* ---------- preconditions ---------- */

async function preconditions(): Promise<{
  handle: WalletHandle;
  ppq: PpqAccountFile;
}> {
  const operator = await loadOperator();
  if (!operator) {
    throw new Error(
      "No operator key found. Run `npx tsx tests/wallet/bootstrap-spark-wallet-e2e.ts` first.",
    );
  }
  const envelope = await loadPersonaOrFail(operator);
  const mnemonic = envelope.config.wallet?.mnemonic;
  if (!mnemonic) {
    throw new Error(
      "Persona envelope has no wallet mnemonic. Re-run bootstrap-spark-wallet-e2e with --reset.",
    );
  }
  const ppq = await loadPpqAccount();
  if (!ppq) {
    throw new Error(
      "No ppq.ai account found. Run bootstrap-spark-wallet-e2e and answer 'y' to the auto-topup step (or run tests/ai-services/test-all-ppq-services-e2e.ts).",
    );
  }
  console.log("Connecting Spark wallet…");
  const handle = await connectWallet({ mnemonic });
  return { handle, ppq };
}

/* ---------- snapshots ---------- */

async function snapshot(handle: WalletHandle, ppq: PpqAccountFile): Promise<{
  sats: number;
  usd: number | undefined;
}> {
  const [info, balance] = await Promise.all([
    loadWalletInfo(handle),
    getPpqBalance(ppq.credit_id),
  ]);
  return { sats: info.balanceSats, usd: balance.balance_usd };
}

/* ---------- step: hello-world inference ---------- */

async function inferenceStep(ppq: PpqAccountFile): Promise<void> {
  if (flags.skipInference) {
    console.log("Skipping inference (--skip-inference).");
    return;
  }
  if (!(await askYesNo(rl, "Run hello-world inference?"))) return;

  console.log(`  model: ${flags.inferenceModel}`);
  const res = await chatCompletion(ppq.api_key, {
    model: flags.inferenceModel,
    messages: [
      {
        role: "user",
        content: 'Reply with exactly the phrase "hello world" — nothing else.',
      },
    ],
  });
  const text = res.choices?.[0]?.message?.content ?? "(no content)";
  console.log(`  response: ${text}`);
  if (res.usage) {
    console.log(
      `  usage: prompt=${res.usage.prompt_tokens} completion=${res.usage.completion_tokens}`,
    );
  }
}

/* ---------- step: non-auto-topup (off switch) ---------- */

async function disabledTopupStep(
  handle: WalletHandle,
  ppq: PpqAccountFile,
  ppqBalanceUsd: number | undefined,
): Promise<void> {
  if (flags.skipDisabled) {
    console.log("Skipping disabled-policy assertion (--skip-disabled).");
    return;
  }
  console.log("  policy: enabled=false (off switch)");
  const result = await runAutoTopupOnce({
    wallet: handle,
    ppqApiKey: ppq.api_key,
    ppqBalanceUsd,
    config: {
      enabled: false,
      // Even with absurd thresholds, disabled MUST short-circuit.
      thresholdUsd: 1000,
      targetUsd: 1000,
    },
  });
  if (result === null) {
    console.log("  ✓ runAutoTopupOnce returned null — off switch holds.");
  } else {
    console.warn(
      `  ✗ unexpected non-null result: ${JSON.stringify(result)}`,
    );
  }
}

/* ---------- step: forced auto-topup ---------- */

async function forcedTopupStep(
  handle: WalletHandle,
  ppq: PpqAccountFile,
  startingPpqUsd: number | undefined,
  startingSparkSats: number,
): Promise<void> {
  if (flags.skipForced) {
    console.log("Skipping forced topup (--skip-forced).");
    return;
  }
  if (typeof startingPpqUsd !== "number") {
    console.warn("Cannot force a topup — ppq balance is unknown.");
    return;
  }

  // Default: top up by ~$0.50 above the current balance — small, but enough
  // to see the BOLT11 round-trip end to end.
  const defaultTarget = Math.round((startingPpqUsd + 0.5) * 100) / 100;
  const target = Number(flags.topupTarget ?? String(defaultTarget));
  if (!Number.isFinite(target) || target <= startingPpqUsd) {
    console.warn(
      `Skipping forced topup: target ${target} is ≤ current balance ${startingPpqUsd}.`,
    );
    return;
  }

  const wantTopup = await askYesNo(
    rl,
    `Force a topup from ${fmtMoney(startingPpqUsd)} → ${fmtMoney(target)} (~${fmtMoney(target - startingPpqUsd)} of sats)?`,
    "n",
  );
  if (!wantTopup) {
    console.log("Skipped by user.");
    return;
  }

  console.log(
    `  policy: enabled=true threshold=${fmtMoney(flags.topupThreshold)} target=${fmtMoney(target)}`,
  );

  const result = await runAutoTopupOnce({
    wallet: handle,
    ppqApiKey: ppq.api_key,
    ppqBalanceUsd: startingPpqUsd,
    config: {
      enabled: true,
      thresholdUsd: flags.topupThreshold,
      targetUsd: target,
    },
  });

  if (!result) {
    console.warn("  policy returned null — was the threshold not high enough?");
    return;
  }
  console.log(`  ✓ topped up ${fmtMoney(result.toppedUpUsd)}`);
  console.log(`    invoice id:  ${result.invoiceId}`);
  console.log(`    final state: ${result.status}`);

  const after = await getPpqBalance(ppq.credit_id);
  const walletInfo = await loadWalletInfo(handle);
  console.log(
    `    ppq balance:   ${fmtMoney(startingPpqUsd)} → ${fmtMoney(after.balance_usd)}`,
  );
  console.log(
    `    spark balance: ${fmtSats(startingSparkSats)} → ${fmtSats(walletInfo.balanceSats)}`,
  );
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  console.log("Phoenix wallet — auto-topup + inference test");
  if (!process.env.VITE_BREEZ_API_KEY) {
    console.warn(
      "VITE_BREEZ_API_KEY not found — add it to dev/.env or export it in the shell.",
    );
  }

  let handle: WalletHandle | undefined;
  try {
    header("0. Reload wallet + persona + ppq account");
    const pre = await preconditions();
    handle = pre.handle;

    const start = await snapshot(handle, pre.ppq);
    console.log(`  spark balance: ${fmtSats(start.sats)}`);
    console.log(`  ppq balance:   ${fmtMoney(start.usd)}`);

    header("1. Hello-world inference");
    await inferenceStep(pre.ppq);

    header("2. Non-auto-topup (enabled=false → null)");
    await disabledTopupStep(handle, pre.ppq, start.usd);

    header("3. Forced auto-topup (threshold > current balance)");
    await forcedTopupStep(handle, pre.ppq, start.usd, start.sats);

    header("Done");
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
