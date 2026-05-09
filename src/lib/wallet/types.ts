/**
 * Shared types for the headless Phoenix wallet — a thin Phoenix-flavoured
 * facade over the Breez Spark SDK (`@breeztech/breez-sdk-spark`).
 *
 * The SDK ships its own TypeScript types; we re-export the ones our hooks
 * and integration tests touch so the rest of the codebase doesn't need to
 * import from the SDK directly.
 */

import type {
  BreezSdk,
  GetInfoResponse,
  Network,
  Payment,
  ReceivePaymentResponse,
  SdkEvent,
  SendPaymentResponse,
} from "@breeztech/breez-sdk-spark";

/** The connected SDK handle. Treat as opaque. */
export type WalletHandle = BreezSdk;

export type {
  GetInfoResponse,
  Payment,
  ReceivePaymentResponse,
  SdkEvent,
  SendPaymentResponse,
};

export interface WalletConnectOptions {
  /** BIP-39 mnemonic phrase. 12 or 24 words. */
  mnemonic: string;
  /** Optional BIP-39 passphrase ("25th word"). Defaults to none. */
  passphrase?: string;
  /** Bitcoin network. Defaults to `"mainnet"`. */
  network?: Network;
  /**
   * Breez API key. Defaults to `import.meta.env.VITE_BREEZ_API_KEY`. Pass
   * explicitly when calling from a Node integration test where Vite's
   * `import.meta.env` isn't populated.
   */
  apiKey?: string;
}

/**
 * Phoenix-flavoured wallet snapshot. Populated by `loadWalletInfo()` on
 * top of the raw `GetInfoResponse`. The raw payload is preserved under
 * `raw` for callers that want fields we haven't surfaced.
 */
export interface WalletInfo {
  /** Spendable balance in satoshis. */
  balanceSats: number;
  /**
   * The wallet's Lightning Address (e.g. `imani@spark.money`), if the SDK
   * has one assigned. Used as the persona's public donate destination.
   */
  lightningAddress?: string;
  /**
   * The wallet's static LNURL-pay string, if the SDK exposes one.
   */
  lnurlPay?: string;
  raw: GetInfoResponse;
}

/* ---------- Receive ---------- */

export interface ReceiveBolt11Args {
  /** Optional fixed amount. Omit for an amountless invoice. */
  amountSats?: number;
  /** Free-form description embedded in the invoice. */
  description?: string;
  /** Expiry in seconds. SDK default applies if omitted. */
  expirySecs?: number;
}

export interface ReceiveBolt11Result {
  /** BOLT11 string the payer pays. */
  paymentRequest: string;
  /** Receive-side fee in sats (typically 0 for plain BOLT11 receive). */
  feeSats: number;
  raw: ReceivePaymentResponse;
}

/* ---------- Send ---------- */

export interface SendBolt11Args {
  /** BOLT11 invoice to pay. */
  paymentRequest: string;
  /** Override amount for amountless invoices (sats). */
  amountSats?: number;
  /**
   * Prefer Spark rails over Lightning when both are available. Defaults
   * to false — we want the BOLT11 paid via Lightning.
   */
  preferSpark?: boolean;
  /** Wait at most this many seconds for completion. Default 30. */
  completionTimeoutSecs?: number;
  /** Optional client-supplied idempotency key. */
  idempotencyKey?: string;
}

export interface SendResult {
  /** Final outcome from the SDK. */
  raw: SendPaymentResponse;
}

/* ---------- Auto-topup ---------- */

/**
 * Default-on policy: when ppq.ai's USD balance dips below `thresholdUsd`,
 * top it up to `targetUsd` by paying a Lightning invoice issued by ppq.ai
 * out of the Phoenix wallet.
 */
export interface AutoTopupConfig {
  enabled: boolean;
  /** Trigger when ppq balance < this many USD. */
  thresholdUsd: number;
  /** After topping up, ppq balance should be at least this many USD. */
  targetUsd: number;
}

export const DEFAULT_AUTO_TOPUP_CONFIG: AutoTopupConfig = {
  enabled: true,
  thresholdUsd: 1,
  targetUsd: 5,
};

export interface AutoTopupRunResult {
  /** What we asked ppq.ai to top up by, in USD. */
  toppedUpUsd: number;
  /** ppq.ai invoice id we paid. */
  invoiceId: string;
  /** BOLT11 we paid. */
  paymentRequest: string;
  /** Final ppq.ai status — "Settled" on success. */
  status: string;
}

export class WalletError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "WalletError";
  }
}
