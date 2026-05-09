/**
 * Phoenix persona event schema (encrypted, untrackable, validated).
 *
 * Privacy posture
 * ───────────────
 * Personas MUST NOT be trackable. The kind 30078 event that holds a persona
 * config carries NO Phoenix-specific metadata in its tags. From the outside
 * it is indistinguishable from any other app's encrypted-app-data event.
 *
 * Event shape:
 *   kind: 30078
 *   pubkey: <operator pubkey>      (unavoidable; events must be signed)
 *   tags:
 *     ["d", <random uuid>]         unique addressing only — no semantics
 *   content: NIP-44(operator → operator) of JSON {
 *     app: "phoenix-persona",      magic discriminator
 *     version: 1,                  schema version (only 1 accepted)
 *     personaPubkey: <hex>,        cross-reference to the persona's npub
 *     config: { ...PersonaConfig } system prompt, sources, persona nsec, etc.
 *   }
 *
 * The Phoenix discriminator and the persona-pubkey ↔ operator link only
 * exist inside the encrypted payload. To find a persona, the operator
 * scans their own kind 30078 events and decrypts each one — successful
 * decryption + Phoenix discriminator + Zod-validated shape + derived-key
 * match = a Phoenix persona event.
 *
 * Defense in depth — every layer must agree:
 *   (a) NIP-44 decryptable by the operator's signer (else: not for me)
 *   (b) Plaintext is valid JSON
 *   (c) Zod schema accepts the envelope (else: malformed / wrong app)
 *   (d) Derived pubkey from personaNsec matches the claimed personaPubkey
 *       (else: tampered envelope)
 *
 * Persona POSTS (kind 1)
 * ──────────────────────
 * Posts published by the persona's own keypair carry NO operator tag, NO
 * "phoenix" client tag, and NO persona-name disclosure. They look like
 * any other kind 1 note from any account — only the source-attribution
 * `r` tags (which are content, not identity) and topical `t` tags remain.
 * The persona's kind 0 profile bio is the right place to disclose AI
 * usage; individual posts stay metadata-clean.
 */

import { z } from "zod";
import { getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "@nostrify/nostrify";

export const PERSONA_KIND = 30078;
export const PHOENIX_PAYLOAD_APP = "phoenix-persona";
export const PHOENIX_PAYLOAD_VERSION = 1 as const;

export type SourceKind = "rss" | "url";

// ─────────── Zod schemas ───────────

const personaSourceSchema = z.object({
  kind: z.enum(["rss", "url"]),
  url: z.string(),
});

const personaConfigSchema = z.object({
  name: z.string().min(1).max(120),
  region: z.string().min(1).max(8),
  cause: z.string().min(1).max(120),
  languages: z.array(z.string().min(1).max(16)).min(1).max(16),
  tone: z.string().max(2000),
  frequencySec: z.number().int().nonnegative().max(60 * 60 * 24 * 30),
  sources: z.array(personaSourceSchema).max(64),
  focus: z.array(z.string().min(1).max(120)).max(32),
  model: z.string().min(1).max(120),
  systemPrompt: z.string().max(20000),
  personality: z.string().max(2000),
  bio: z.string().max(2000),
  voiceStyle: z.string().max(2000).optional(),
  avoidTopics: z.array(z.string().min(1).max(240)).max(32).optional(),
  personaNsec: z
    .string()
    .regex(/^nsec1[02-9ac-hj-np-z]{58,}$/i, "must be a valid nsec1… string"),
});

const phoenixEnvelopeSchema = z.object({
  app: z.literal(PHOENIX_PAYLOAD_APP),
  version: z.literal(PHOENIX_PAYLOAD_VERSION),
  personaPubkey: z.string().regex(/^[0-9a-f]{64}$/i, "must be 64 hex chars"),
  config: personaConfigSchema,
});

// ─────────── Public types (inferred from schemas) ───────────

export type PersonaSource = z.infer<typeof personaSourceSchema>;
export type PersonaConfig = z.infer<typeof personaConfigSchema>;
export type PhoenixEnvelope = z.infer<typeof phoenixEnvelopeSchema>;

// ─────────── Event template builder ───────────

/**
 * Build the unsigned event template for an encrypted persona definition.
 * The d-tag is a random UUID — no semantic information.
 */
export function buildEncryptedPersonaTemplate(
  args: {
    /** Random UUID used as the d-tag (unique addressing only). */
    dTag: string;
    /** NIP-44 ciphertext of the PhoenixEnvelope. */
    encryptedContent: string;
  },
  createdAt: number = Math.floor(Date.now() / 1000)
): {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
} {
  return {
    kind: PERSONA_KIND,
    created_at: createdAt,
    // No t/p/alt/client tags — anything Phoenix-specific lives inside content.
    tags: [["d", args.dTag]],
    content: args.encryptedContent,
  };
}

/**
 * Generate a random d-tag for a new persona. Browsers ship crypto.randomUUID().
 */
export function generatePersonaDTag(): string {
  return crypto.randomUUID();
}

// ─────────── Envelope parsing & verification ───────────

/**
 * Derive the persona pubkey from an nsec. Returns the hex pubkey, or null
 * if the nsec doesn't decode.
 */
function pubkeyFromNsec(nsec: string): string | null {
  try {
    const decoded = nip19.decode(nsec);
    if (decoded.type !== "nsec") return null;
    return getPublicKey(decoded.data);
  } catch {
    return null;
  }
}

/**
 * Validate a decrypted JSON string is a Phoenix persona envelope and that
 * the embedded persona nsec matches the claimed persona pubkey.
 *
 * Returns the parsed envelope on success, null on any validation failure.
 * Never throws — callers in the scan-and-decrypt loop expect a null sentinel.
 *
 * Defense layers (in order):
 *   1. JSON parse
 *   2. Zod schema (app discriminator, version pin, shape, length limits)
 *   3. Pubkey-from-nsec match
 */
export function parsePhoenixEnvelope(plaintext: string): PhoenixEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }

  const result = phoenixEnvelopeSchema.safeParse(parsed);
  if (!result.success) return null;

  const envelope = result.data;

  // Derive-and-verify: the personaPubkey claim must match the public key
  // derived from the embedded personaNsec. Defends against a tampered
  // envelope where the operator's signer was used to encrypt a config
  // claiming the wrong identity.
  const derived = pubkeyFromNsec(envelope.config.personaNsec);
  if (!derived) return null;
  if (derived.toLowerCase() !== envelope.personaPubkey.toLowerCase()) {
    return null;
  }

  // Normalize the pubkey casing for downstream comparators.
  return {
    ...envelope,
    personaPubkey: envelope.personaPubkey.toLowerCase(),
  };
}

/**
 * Quick filter: is this event a candidate kind 30078 we should attempt to
 * decrypt? (We can't tell from tags alone whether it's a Phoenix event —
 * that's the point — but we can require kind and a `d` tag.)
 */
export function isCandidatePersonaEvent(event: NostrEvent): boolean {
  if (event.kind !== PERSONA_KIND) return false;
  if (!event.tags.some(([n]) => n === "d")) return false;
  return true;
}

// ─────────── Defaults ───────────

export const DEFAULT_PERSONA_MODEL = "anthropic/claude-sonnet-4.5";
export const DEFAULT_FREQUENCY_SEC = 3600;
