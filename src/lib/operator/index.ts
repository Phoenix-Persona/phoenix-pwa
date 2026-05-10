/**
 * Phoenix operator envelope — the user-level encrypted backup storing
 * the operator's Spark wallet seed + PPQ account credentials.
 *
 * The operator wallet is the *funder* of AI inference: creation costs
 * (when those grow), default fallback when a persona's wallet is
 * empty, and the source of any auto-topup the operator initiates from
 * the header. Per-persona wallets exist separately (see PROJECT.md
 * §7) and receive donations on behalf of each persona; they are not
 * the operator's funder.
 *
 * Privacy posture matches the persona pattern (PROJECT.md §5.2):
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

import { z } from "zod";
import type { NostrEvent } from "@nostrify/nostrify";

import { walletSchema, type PersonaWallet } from "@/lib/persona";
import type { Nip44Signer } from "@/lib/personaCrypto";

export const OPERATOR_KIND = 30078;
export const PHOENIX_OPERATOR_APP = "phoenix-operator";
export const PHOENIX_OPERATOR_VERSION = 1 as const;

const ppqAccountSchema = z.object({
  api_key: z.string().min(1).max(2048),
  credit_id: z.string().min(0).max(512),
});
export type OperatorPpqAccount = z.infer<typeof ppqAccountSchema>;

const operatorEnvelopeSchema = z.object({
  app: z.literal(PHOENIX_OPERATOR_APP),
  version: z.literal(PHOENIX_OPERATOR_VERSION),
  dTag: z.string().min(1).max(128).optional(),
  wallet: walletSchema.optional(),
  ppq: ppqAccountSchema.optional(),
  created_at: z.number().int().nonnegative(),
});
export type OperatorEnvelope = z.infer<typeof operatorEnvelopeSchema>;

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
    const result = operatorEnvelopeSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
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
