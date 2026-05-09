/**
 * Auto-topup policy: keep the persona's ppq.ai credit balance funded out
 * of the persona's own Spark wallet.
 *
 * Pure-ish module — no React, no global state. Composes over:
 *   - ppq.ai client functions (createTopupInvoice, getTopupStatus, …)
 *   - the headless wallet's `sendBolt11`
 *
 * Design notes
 *
 * - The single entry point is `runAutoTopupOnce()`, which decides whether
 *   to act and runs the full lifecycle synchronously. Callers are
 *   responsible for:
 *     - Throttling (don't fire on every render — gate via a mutation
 *       that's pending-locked).
 *     - Handling the resolved promise (`null` = no action needed).
 *
 * - We poll ppq.ai's `/topup/status` endpoint for the BOLT11 settlement
 *   rather than listening to wallet events. The wallet event would only
 *   tell us the payment left our side; ppq.ai's status confirms credit
 *   actually landed on the account. That's the signal that matters.
 *
 * - "Default on" lives in `DEFAULT_AUTO_TOPUP_CONFIG` (`./types`). The
 *   policy here only checks the `enabled` flag; storage / UI toggles are
 *   the caller's job.
 */

import {
  createTopupInvoice,
  extractBolt11,
  getTopupStatus,
  isTopupExpired,
  isTopupSettled,
} from "@/lib/ppq/client";

import { sendBolt11 } from "./client";
import {
  WalletError,
  type AutoTopupConfig,
  type AutoTopupRunResult,
  type WalletHandle,
} from "./types";

export interface RunAutoTopupArgs {
  /** Connected Spark wallet. */
  wallet: WalletHandle;
  /** Current ppq.ai api_key — used to issue a topup invoice. */
  ppqApiKey: string;
  /** Most recent ppq.ai balance, in USD. */
  ppqBalanceUsd: number | undefined;
  /** Auto-topup configuration. */
  config: AutoTopupConfig;
  /** Optional abort signal — applies to the polling loop and the wallet pay. */
  signal?: AbortSignal;
  /**
   * Override the polling cadence (ms) and timeout (ms). Defaults are tuned
   * for a hackathon demo: 3s polling, 5min timeout.
   */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1_000;

/**
 * Run the auto-topup decision once. Returns:
 *   - `null` if no action needed (disabled, or balance already ≥ threshold).
 *   - An `AutoTopupRunResult` if a top-up actually settled.
 *
 * Throws a `WalletError` for hard failures (no BOLT11 returned, payment
 * rejected, polling timeout, expired invoice).
 */
export async function runAutoTopupOnce(
  args: RunAutoTopupArgs,
): Promise<AutoTopupRunResult | null> {
  const {
    wallet,
    ppqApiKey,
    ppqBalanceUsd,
    config,
    signal,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  } = args;

  if (!config.enabled) return null;
  if (typeof ppqBalanceUsd !== "number" || !Number.isFinite(ppqBalanceUsd)) {
    // We refuse to top up when we can't read the current balance — could
    // result in over-spending. Caller should refresh balance first.
    return null;
  }
  if (ppqBalanceUsd >= config.thresholdUsd) return null;

  const needUsd = round2(config.targetUsd - ppqBalanceUsd);
  if (needUsd <= 0) return null;

  // 1. Ask ppq.ai for a Lightning invoice.
  const invoice = await createTopupInvoice(
    ppqApiKey,
    "btc-lightning",
    needUsd,
    "USD",
    { signal },
  );
  const bolt11 = extractBolt11(invoice);
  if (!bolt11) {
    throw new WalletError(
      "ppq.ai topup response did not include a Lightning invoice",
      invoice,
    );
  }

  // 2. Pay it from the Spark wallet.
  try {
    await sendBolt11(wallet, { paymentRequest: bolt11 });
  } catch (err) {
    throw new WalletError(
      "Spark wallet failed to pay ppq.ai topup invoice",
      err,
    );
  }

  // 3. Poll ppq.ai status until settled / expired / timeout.
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new WalletError("Auto-topup aborted by caller", signal.reason);
    }
    const status = await getTopupStatus(ppqApiKey, invoice.invoice_id, {
      signal,
    });
    if (isTopupSettled(status.status)) {
      return {
        toppedUpUsd: needUsd,
        invoiceId: invoice.invoice_id,
        paymentRequest: bolt11,
        status: String(status.status),
      };
    }
    if (isTopupExpired(status.status)) {
      throw new WalletError(
        `ppq.ai topup invoice reached terminal state without settling: ${status.status}`,
      );
    }
    await sleep(pollIntervalMs);
  }
  throw new WalletError("Auto-topup polling timed out before settlement");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
