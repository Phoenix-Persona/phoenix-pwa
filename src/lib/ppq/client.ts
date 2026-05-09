/**
 * Low-level HTTP client for ppq.ai.
 *
 * No React, no storage, no environment assumptions besides a fetch-capable
 * runtime. Every function takes the credentials it needs explicitly so the
 * client stays unit-testable and re-usable from hooks, scripts, or worker
 * threads.
 *
 * Errors are normalised to `PpqError` with the HTTP status preserved so the
 * caller can branch on `error.status === 402` (payment required) etc.
 */

import {
  PpqError,
  type PpqAccount,
  type PpqBalance,
  type PpqChatRequest,
  type PpqChatResponse,
  type PpqImageRequest,
  type PpqImageResponse,
  type PpqNwcConnectRequest,
  type PpqNwcSettings,
  type PpqPaymentMethod,
  type PpqTopupCurrency,
  type PpqTopupInvoice,
  type PpqTopupMethod,
  type PpqTopupStatusResponse,
  type PpqVideoRequest,
  type PpqVideoStatusResponse,
  type PpqVideoSubmitResponse,
} from "./types";

const DEFAULT_BASE_URL = "https://api.ppq.ai";

function readEnvBase(): string {
  const env = (import.meta as ImportMeta).env as
    | Record<string, string | undefined>
    | undefined;
  return env?.VITE_PPQ_API_BASE ?? DEFAULT_BASE_URL;
}

/**
 * Optional override — useful for tests, staging, or routing through a
 * passthrough proxy if CORS becomes an issue. Pass to any client function
 * via the trailing options object.
 */
export interface PpqRequestOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

interface InternalRequestInit extends PpqRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  /** When set, success responses preserve the raw fetch Response (e.g. for streaming). */
  raw?: boolean;
  /** Treat 202 as success and return the parsed body unchanged. Used for video polling. */
  accept202?: boolean;
}

async function request<T>(
  path: string,
  init: InternalRequestInit = {},
): Promise<{ data: T; status: number }> {
  const base = init.baseUrl ?? readEnvBase();
  const url = `${base.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = { ...(init.headers ?? {}) };

  let body: BodyInit | undefined;
  if (init.body !== undefined && init.body !== null) {
    if (init.body instanceof FormData) {
      body = init.body;
      // Let fetch set the multipart boundary; do not set content-type.
    } else {
      headers["content-type"] ??= "application/json";
      body = JSON.stringify(init.body);
    }
  }

  const res = await fetch(url, {
    method: init.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    signal: init.signal,
  });

  const ok = res.ok || (init.accept202 && res.status === 202);
  if (!ok) {
    const text = await res.text().catch(() => "");
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      // keep as text
    }
    throw new PpqError(
      typeof parsed === "string" && parsed
        ? parsed
        : `ppq.ai request failed (${res.status})`,
      res.status,
      parsed,
    );
  }

  // Some endpoints (TTS, signed video URLs) return non-JSON. Caller opts in.
  if (init.raw) return { data: res as unknown as T, status: res.status };

  if (res.status === 204) return { data: undefined as T, status: 204 };

  const text = await res.text();
  if (!text) return { data: undefined as T, status: res.status };

  try {
    return { data: JSON.parse(text) as T, status: res.status };
  } catch {
    throw new PpqError("Malformed JSON from ppq.ai", res.status, text);
  }
}

/* ---------- Account & balance ---------- */

/**
 * Create a fresh ppq.ai account. Returns the credit_id (spending account)
 * and api_key (auth credential). Idempotency is the caller's job — calling
 * this twice creates two distinct accounts. Persist immediately on success.
 */
export async function createAccount(
  options: PpqRequestOptions = {},
): Promise<PpqAccount> {
  const { data } = await request<PpqAccount>("/accounts/create", {
    method: "POST",
    ...options,
  });
  if (!data?.api_key || !data?.credit_id) {
    throw new PpqError("Account creation returned malformed payload", 502, data);
  }
  return data;
}

export async function getBalance(
  creditId: string,
  options: PpqRequestOptions = {},
): Promise<PpqBalance> {
  const { data } = await request<PpqBalance>("/credits/balance", {
    method: "POST",
    body: { credit_id: creditId },
    ...options,
  });
  return data;
}

/* ---------- Chat / general inference ---------- */

export async function chatCompletion(
  apiKey: string,
  req: PpqChatRequest,
  options: PpqRequestOptions = {},
): Promise<PpqChatResponse> {
  const { data } = await request<PpqChatResponse>("/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: req,
    ...options,
  });
  return data;
}

export interface PpqModel {
  id: string;
  object?: string;
  owned_by?: string;
  created?: number;
  context_window?: number;
  pricing?: { input?: number; output?: number };
}

export async function listModels(
  type?: "embedding" | "image" | "video" | "all",
  options: PpqRequestOptions = {},
): Promise<PpqModel[]> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : "";
  const { data } = await request<{ data: PpqModel[] }>(`/v1/models${qs}`, {
    method: "GET",
    ...options,
  });
  return data?.data ?? [];
}

/* ---------- Images ---------- */

export async function generateImage(
  apiKey: string,
  req: PpqImageRequest,
  options: PpqRequestOptions = {},
): Promise<PpqImageResponse> {
  const { data } = await request<PpqImageResponse>("/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: req,
    ...options,
  });
  return data;
}

/* ---------- Videos ---------- */

export async function submitVideo(
  apiKey: string,
  req: PpqVideoRequest,
  options: PpqRequestOptions = {},
): Promise<PpqVideoSubmitResponse> {
  const { data } = await request<PpqVideoSubmitResponse>("/v1/videos", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: req,
    accept202: true,
    ...options,
  });
  return data;
}

/**
 * Poll a single video job. Returns the parsed body whether the job is still
 * pending (202) or completed (200) — callers branch on `data.status`.
 */
export async function getVideoStatus(
  apiKey: string,
  id: string,
  options: PpqRequestOptions = {},
): Promise<PpqVideoStatusResponse> {
  const { data } = await request<PpqVideoStatusResponse>(
    `/v1/videos/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      accept202: true,
      ...options,
    },
  );
  return data;
}

/* ---------- Topup (Lightning et al) ---------- */

export async function createTopupInvoice(
  apiKey: string,
  method: PpqTopupMethod,
  amount: number,
  currency: PpqTopupCurrency = "USD",
  options: PpqRequestOptions = {},
): Promise<PpqTopupInvoice> {
  const { data } = await request<PpqTopupInvoice>(
    `/topup/create/${encodeURIComponent(method)}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: { amount, currency },
      ...options,
    },
  );
  return data;
}

export async function getTopupStatus(
  apiKey: string,
  invoiceId: string,
  options: PpqRequestOptions = {},
): Promise<PpqTopupStatusResponse> {
  const { data } = await request<PpqTopupStatusResponse>(
    `/topup/status/${encodeURIComponent(invoiceId)}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      ...options,
    },
  );
  return data;
}

export async function listPaymentMethods(
  options: PpqRequestOptions = {},
): Promise<PpqPaymentMethod[]> {
  const { data } = await request<{ data: PpqPaymentMethod[] }>(
    "/topup/payment-methods",
    { method: "GET", ...options },
  );
  return data?.data ?? [];
}

/**
 * Defensive accessor — ppq.ai returns the payable BOLT11 under one of a few
 * possible keys depending on the version, so we check the common ones in
 * order. Returns undefined for non-Lightning methods (which expose `address`
 * instead).
 */
export function extractBolt11(invoice: PpqTopupInvoice): string | undefined {
  return (
    invoice.payment_request ??
    invoice.invoice ??
    invoice.bolt11 ??
    (typeof invoice["pr"] === "string" ? (invoice["pr"] as string) : undefined)
  );
}

/* ---------- NWC auto-topup (NIP-47) ---------- */

export async function connectNwcAutoTopup(
  creditId: string,
  req: PpqNwcConnectRequest,
  options: PpqRequestOptions = {},
): Promise<PpqNwcSettings> {
  const { data } = await request<PpqNwcSettings>("/nwc-auto-topup/connect", {
    method: "POST",
    headers: { "x-credit-id": creditId },
    body: req,
    ...options,
  });
  return data;
}

export async function getNwcAutoTopup(
  creditId: string,
  options: PpqRequestOptions = {},
): Promise<PpqNwcSettings> {
  const { data } = await request<PpqNwcSettings>("/nwc-auto-topup", {
    method: "GET",
    headers: { "x-credit-id": creditId },
    ...options,
  });
  return data;
}

export async function disconnectNwcAutoTopup(
  creditId: string,
  options: PpqRequestOptions = {},
): Promise<void> {
  await request<void>("/nwc-auto-topup/connection", {
    method: "DELETE",
    headers: { "x-credit-id": creditId },
    ...options,
  });
}
