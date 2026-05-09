/**
 * Shared types for the ppq.ai integration.
 *
 * ppq.ai (PayPerQ) is an OpenAI-compatible, pay-per-query service that
 * Phoenix uses in lieu of running its own backend. Everything below mirrors
 * the on-the-wire shapes documented at https://ppq.ai/api-docs.
 *
 * The api_key + credit_id pair created by `POST /accounts/create` is what
 * lets the operator spend credits. We persist it client-side (see
 * `./storage`) so the operator's PWA can call ppq.ai directly without a
 * Phoenix-owned backend.
 */

/**
 * Credentials returned by `POST /accounts/create`. The `api_key` authenticates
 * inference / media calls; the `credit_id` is the spending account that holds
 * the USD balance — used for `/credits/balance`, `/keys`, and NWC auto-topup.
 */
export interface PpqAccount {
  credit_id: string;
  api_key: string;
}

/** Response of `POST /credits/balance`. */
export interface PpqBalance {
  balance_usd: number;
}

/* ---------- Chat / inference ---------- */

export type PpqChatRole = "system" | "user" | "assistant";

export interface PpqChatMessage {
  role: PpqChatRole;
  content: string;
}

export interface PpqChatPlugin {
  /** "web" enables online search. */
  id: string;
  max_results?: number;
}

export interface PpqChatRequest {
  model: string;
  messages: PpqChatMessage[];
  plugins?: PpqChatPlugin[];
  /** Permitted by the OpenAI-compatible surface; pass through if needed. */
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface PpqChatChoice {
  message: PpqChatMessage;
  finish_reason?: string;
}

export interface PpqChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

export interface PpqChatResponse {
  choices: PpqChatChoice[];
  usage?: PpqChatUsage;
  model: string;
  created: number;
}

/* ---------- Image generation ---------- */

export interface PpqImageRequest {
  model: string;
  prompt: string;
  /** Optional source image URL for editing-style models. */
  image_url?: string;
  /** 1..4 */
  n?: number;
  quality?: string;
  /** Aspect ratio, e.g. "1:1", "16:9", "9:16". */
  size?: string;
  resolution?: "1K" | "2K" | "4K";
  negative_prompt?: string;
  output_format?: "png" | "jpeg" | "webp";
}

export interface PpqImageResultItem {
  url: string;
  content_type: string;
}

export interface PpqImageResponse {
  created: number;
  model: string;
  cost: number;
  data: PpqImageResultItem[];
}

/* ---------- Video generation ---------- */

/**
 * The video models documented by ppq.ai. We type these as a string union for
 * IDE autocomplete but accept any `string` so callers aren't blocked when
 * ppq.ai adds models faster than we update this file.
 */
export type PpqVideoModel =
  | "veo3"
  | "veo3-fast"
  | "veo3-i2v"
  | "kling-2.1-pro"
  | "kling-2.1-master"
  | "kling-2.5-turbo"
  | "kling-2.1-master-i2v"
  | "kling-2.5-turbo-i2v"
  | "runway-gen4"
  | "runway-aleph"
  | (string & {});

export interface PpqVideoRequest {
  model: PpqVideoModel;
  prompt: string;
  aspect_ratio?: "16:9" | "9:16" | "1:1";
  /** Seconds. Most models accept 5/8/10. */
  duration?: number | string;
  quality?: "720p" | "1080p";
  /** Required for image-to-video models (e.g. veo3-i2v, *-i2v). */
  image_url?: string;
}

export type PpqVideoStatus = "pending" | "completed" | "failed";

export interface PpqVideoSubmitResponse {
  id: string;
  model: string;
  status: PpqVideoStatus;
  created: number;
  estimated_cost?: number;
}

export interface PpqVideoResultData {
  url: string;
  content_type: string;
}

export interface PpqVideoStatusResponse {
  id: string;
  model: string;
  status: PpqVideoStatus;
  created: number;
  estimated_cost?: number;
  cost?: number;
  data?: PpqVideoResultData;
  error?: string;
}

/* ---------- Topup ---------- */

export type PpqTopupMethod = "btc-lightning" | "btc" | "ltc" | "lbtc" | "xmr";
export type PpqTopupCurrency =
  | "USD"
  | "BTC"
  | "SATS"
  | "LTC"
  | "LBTC"
  | "XMR";
export type PpqTopupStatus = "pending" | "completed" | "expired";

/**
 * Response of `POST /topup/create/{method}`.
 *
 * The doc snippet only enumerates `invoice_id`, `expires_at`, `amount`,
 * `currency`, but a Lightning topup must also return a payable BOLT11 string
 * (otherwise the operator's wallet has nothing to pay). We accept whichever
 * key ppq.ai actually returns it under, and provide `extractBolt11()` as a
 * defensive accessor in `./client`.
 */
export interface PpqTopupInvoice {
  invoice_id: string;
  expires_at: string;
  amount: number | string;
  currency: PpqTopupCurrency | string;
  /** BOLT11 string. ppq.ai may return this under several names. */
  payment_request?: string;
  invoice?: string;
  bolt11?: string;
  /** On-chain address for non-Lightning methods. */
  address?: string;
  /** Pass-through escape hatch — keep additional fields visible to callers. */
  [extra: string]: unknown;
}

export interface PpqTopupStatusResponse {
  invoice_id: string;
  status: PpqTopupStatus;
  amount: number | string;
  currency: PpqTopupCurrency | string;
  [extra: string]: unknown;
}

export interface PpqPaymentMethod {
  method: string;
  min_usd?: number;
  max_usd?: number;
  currencies?: string[];
  expiration_minutes?: number;
}

/**
 * NWC = Nostr Wallet Connect (NIP-47). When the operator hands ppq.ai an NWC
 * URL, ppq.ai will pull `topup_amount_usd` from the connected wallet whenever
 * the credit balance dips below `threshold_usd`. This is the natural
 * "wallet tops them up at will" primitive for a Nostr-native app.
 */
export interface PpqNwcConnectRequest {
  nwc_url: string;
  threshold_usd?: number;
  topup_amount_usd?: number;
}

export interface PpqNwcSettings {
  nwc_url?: string;
  threshold_usd?: number;
  topup_amount_usd?: number;
  connected?: boolean;
  [extra: string]: unknown;
}

/* ---------- Errors ---------- */

export class PpqError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "PpqError";
  }
}
