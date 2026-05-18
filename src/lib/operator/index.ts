/**
 * Phoenix operator envelope — the user-level encrypted backup storing
 * the operator's Spark wallet seed + PPQ account credentials.
 *
 * The operator wallet is the *funder* of AI inference: creation costs
 * (when those grow), default fallback when a persona's wallet is
 * empty, and the source of any auto-topup the operator initiates from
 * the header. Per-persona wallets exist separately and receive donations on
 * behalf of each persona; they are not
 * the operator's funder.
 *
 * Privacy posture matches the persona pattern documented in
 * `docs/PERSONA-SCHEMA.md`:
 *   - kind 30078 event with a fresh random UUID d-tag (no Phoenix
 *     fingerprint in tags)
 *   - NIP-44 self-encryption to the operator's own pubkey
 *   - Discriminator (`app: "phoenix-operator"`) lives inside the
 *     ciphertext, never in plaintext tags
 *
 * One operator envelope per user. Discovery is scan-and-decrypt: walk
 * all kind-30078 events authored by the user, decrypt each, find the
 * one whose plaintext shape matches `OperatorEnvelope`. The same
 * scan also surfaces persona envelopes — they're disambiguated by the
 * `app` field inside the ciphertext.
 */

import type { NostrEvent } from "@nostrify/nostrify";

import { parsePersonaWallet, type PersonaWallet } from "@/lib/persona";
import type { Nip44Signer } from "@/lib/personaCrypto";

export const OPERATOR_KIND = 30078;
export const PHOENIX_OPERATOR_APP = "phoenix-operator";
export const PHOENIX_OPERATOR_VERSION = 1 as const;

export interface OperatorPpqAccount {
  api_key: string;
  credit_id: string;
}

export interface OperatorEnvelope {
  app: typeof PHOENIX_OPERATOR_APP;
  version: typeof PHOENIX_OPERATOR_VERSION;
  dTag?: string;
  wallet?: PersonaWallet;
  ppq?: OperatorPpqAccount;
  created_at: number;
}

export interface OperatorEnvelopeInput {
  dTag?: string;
  wallet?: PersonaWallet;
  ppq?: OperatorPpqAccount;
}

/** Encrypt an operator envelope to the user's own pubkey (NIP-44 self-encryption). */
export async function encryptOperatorEnvelope(
  payload: OperatorEnvelopeInput,
  userPubkey: string,
  signer: Nip44Signer,
): Promise<string> {
  const envelope: OperatorEnvelope = {
    app: PHOENIX_OPERATOR_APP,
    version: PHOENIX_OPERATOR_VERSION,
    dTag: payload.dTag,
    wallet: payload.wallet,
    ppq: payload.ppq,
    created_at: Math.floor(Date.now() / 1000),
  };
  return signer.nip44.encrypt(userPubkey, JSON.stringify(envelope));
}

/**
 * Try to decrypt an event content as an operator envelope. Returns
 * `null` if the ciphertext can't be decrypted with the user's signer
 * OR if the plaintext isn't a Phoenix operator payload (likely
 * belongs to another app or to a persona).
 */
export async function tryDecryptOperatorEnvelope(
  ciphertext: string,
  userPubkey: string,
  signer: Nip44Signer,
): Promise<OperatorEnvelope | null> {
  let plaintext: string;
  try {
    plaintext = await signer.nip44.decrypt(userPubkey, ciphertext);
  } catch {
    return null;
  }
  return parseOperatorEnvelope(plaintext);
}

export function parseOperatorEnvelope(plaintext: string): OperatorEnvelope | null {
  try {
    const json = JSON.parse(plaintext) as unknown;
    return parseOperatorEnvelopeValue(json);
  } catch {
    return null;
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringLength(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function parsePpqAccount(value: unknown): OperatorPpqAccount | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (!isStringLength(value.api_key, 1, 2048)) return null;
  if (!isStringLength(value.credit_id, 0, 512)) return null;
  return {
    api_key: value.api_key,
    credit_id: value.credit_id,
  };
}

function parseOperatorEnvelopeValue(value: unknown): OperatorEnvelope | null {
  if (!isRecord(value)) return null;
  if (value.app !== PHOENIX_OPERATOR_APP) return null;
  if (value.version !== PHOENIX_OPERATOR_VERSION) return null;
  if (
    typeof value.created_at !== "number" ||
    !Number.isInteger(value.created_at) ||
    value.created_at < 0
  ) {
    return null;
  }
  if (value.dTag !== undefined && !isStringLength(value.dTag, 1, 128)) return null;
  const wallet = value.wallet === undefined ? undefined : parsePersonaWallet(value.wallet);
  const ppq = parsePpqAccount(value.ppq);
  if (wallet === null || ppq === null) return null;
  return {
    app: PHOENIX_OPERATOR_APP,
    version: PHOENIX_OPERATOR_VERSION,
    created_at: value.created_at,
    ...(value.dTag !== undefined ? { dTag: value.dTag } : {}),
    ...(wallet !== undefined ? { wallet } : {}),
    ...(ppq !== undefined ? { ppq } : {}),
  };
}

export function generateOperatorDTag(): string {
  return crypto.randomUUID();
}

export function buildOperatorEventTemplate(args: {
  dTag: string;
  encryptedContent: string;
  createdAt?: number;
}): {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
} {
  return {
    kind: OPERATOR_KIND,
    created_at: args.createdAt ?? Math.floor(Date.now() / 1000),
    tags: [["d", args.dTag]],
    content: args.encryptedContent,
  };
}

export function isCandidateOperatorEvent(event: NostrEvent): boolean {
  if (event.kind !== OPERATOR_KIND) return false;
  return event.tags.some(([n]) => n === "d");
}
