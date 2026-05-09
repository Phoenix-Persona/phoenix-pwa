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
 *   3. Auto-topup pass with the configured policy. Resolves threshold and
 *      target from `DEFAULT_AUTO_TOPUP_CONFIG` (overridable via flags),
 *      then calls `runAutoTopupOnce`. If the ppq balance is below the
 *      threshold this issues a Lightning invoice, pays it from the Spark
 *      wallet, polls until settled, and re-reads the balance to prove
 *      the credit landed; otherwise it short-circuits to `null`.
 *
 * Run:
 *   npx tsx tests/wallet/test-auto-topup-and-inference.ts
 *
 * Loads `dev/.env` automatically.
 *
 * Flags:
 *   --skip-inference         Don't run the chat completion call
 *   --skip-disabled          Don't run the disabled-policy assertion
 *   --skip-forced            Don't run the topup pass (it costs real sats)
 *   --topup-target <usd>     Override topup target (default: DEFAULT_AUTO_TOPUP_CONFIG.targetUsd)
 *   --topup-threshold <usd>  Override topup threshold (default: DEFAULT_AUTO_TOPUP_CONFIG.thresholdUsd)
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
import { DEFAULT_AUTO_TOPUP_CONFIG } from "../../src/lib/wallet/types";
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

// Single source of truth: the global DEFAULT_AUTO_TOPUP_CONFIG. CLI flags
// override per-run; absent that, we use whatever the production policy uses.
const flags = {
  skipInference: argv.includes("--skip-inference"),
  skipDisabled: argv.includes("--skip-disabled"),
  skipForced: argv.includes("--skip-forced"),
  topupTarget: Number(
    flagValue("topup-target") ?? String(DEFAULT_AUTO_TOPUP_CONFIG.targetUsd),
  ),
  topupThreshold: Number(
    flagValue("topup-threshold") ??
      String(DEFAULT_AUTO_TOPUP_CONFIG.thresholdUsd),
  ),
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

/* ---------- step: auto-topup using the configured policy ---------- */

async function topupStep(
  handle: WalletHandle,
  ppq: PpqAccountFile,
  startingPpqUsd: number | undefined,
  startingSparkSats: number,
): Promise<void> {
  if (flags.skipForced) {
    console.log("Skipping topup pass (--skip-forced).");
    return;
  }
  if (typeof startingPpqUsd !== "number") {
    console.warn("Cannot run topup — ppq balance is unknown.");
    return;
  }

  const threshold = flags.topupThreshold;
  const target = flags.topupTarget;

  if (!Number.isFinite(threshold) || !Number.isFinite(target)) {
    console.warn(
      `Skipping topup: invalid policy values (threshold=${threshold}, target=${target}).`,
    );
    return;
  }

  const willFire = startingPpqUsd < threshold;
  console.log(
    `  policy: enabled=true threshold=${fmtMoney(threshold)} target=${fmtMoney(target)}`,
  );
  if (!willFire) {
    console.log(
      `  ppq balance ${fmtMoney(startingPpqUsd)} is already ≥ threshold ${fmtMoney(threshold)} — runAutoTopupOnce will short-circuit to null.`,
    );
  } else {
    console.log(
      `  ppq balance ${fmtMoney(startingPpqUsd)} < threshold ${fmtMoney(threshold)} — would top up to ${fmtMoney(target)} (~${fmtMoney(target - startingPpqUsd)} in sats).`,
    );
  }

  const promptDefault: "y" | "n" = willFire ? "y" : "n";
  const wantTopup = await askYesNo(
    rl,
    willFire ? "Run the topup pass now?" : "Run anyway (no-op expected)?",
    promptDefault,
  );
  if (!wantTopup) {
    console.log("Skipped by user.");
    return;
  }

  const result = await runAutoTopupOnce({
    wallet: handle,
    ppqApiKey: ppq.api_key,
    ppqBalanceUsd: startingPpqUsd,
    config: {
      enabled: true,
      thresholdUsd: threshold,
      targetUsd: target,
    },
  });

  if (!result) {
    console.log("  policy returned null — balance was already at/above threshold.");
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

    header("3. Auto-topup (configured policy)");
    await topupStep(handle, pre.ppq, start.usd, start.sats);

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
