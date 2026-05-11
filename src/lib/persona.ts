/**
 * Phoenix persona event schema (encrypted, untrackable, validated).
 *
 * Privacy posture
 * ───────────────
 * Personas MUST NOT be trackable from outside the encrypted payload.
 * The kind 30078 event that carries a persona's config carries NO
 * Phoenix-specific metadata in its tags. From the wire it is
 * indistinguishable from any other app's NIP-78 application data.
 *
 * Event shape:
 *   kind: 30078
 *   pubkey: <user pubkey>          (unavoidable; events must be signed)
 *   tags:
 *     ["d", <random uuid>]         unique addressing only — no semantics
 *   content: NIP-44(user → user) of JSON {
 *     app: "phoenix-persona",      magic discriminator
 *     version: 1,                  schema version (only 1 accepted)
 *     persona: { pubkey, nsec, name, system_prompt, ... },
 *     wallet?: { kind, seed, lnurl? },         (optional for now; required once wallet wiring lands)
 *     model_prefs?: { agent, image, tts, video? },
 *     settings?:    { default_relays }
 *   }
 *
 * The Phoenix discriminator and the user-pubkey ↔ persona-pubkey link
 * only exist inside the encrypted payload. To find a persona, the user
 * scans their own kind 30078 events and decrypts each one — successful
 * decryption + Phoenix discriminator + Zod-validated shape + derived-key
 * match = a Phoenix persona event.
 *
 * Defense in depth — every layer must agree:
 *   (a) NIP-44 decryptable by the user's signer (else: not for me)
 *   (b) Plaintext is valid JSON
 *   (c) Zod schema accepts the envelope (else: malformed / wrong app)
 *   (d) Derived pubkey from persona.nsec matches the claimed persona.pubkey
 *       (else: tampered envelope)
 *
 * Persona POSTS (kind 1)
 * ──────────────────────
 * Posts published by the persona's own keypair carry NO user tag, NO
 * "phoenix" client tag, and NO persona-name disclosure. They look like
 * any other kind 1 note from any account — only topical `t` tags and
 * source-attribution `r` tags (which are content, not identity) remain.
 * The persona's kind 0 profile bio is the right place to disclose AI
 * usage; individual posts stay metadata-clean.
 *
 * Schema: PROJECT.md §5.2 inner-payload structure.
 * Privacy override: tags-on-the-envelope follow the existing untrackable
 * design rather than §5.2 which would tag-leak Phoenix usage.
 * See `dev/PROJECT.md` §5.
 */

import { z } from "zod";
import { getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "@nostrify/nostrify";

export const PERSONA_KIND = 30078;
export const PHOENIX_PAYLOAD_APP = "phoenix-persona";
export const PHOENIX_PAYLOAD_VERSION = 1 as const;

// ─────────── Zod schemas ───────────

/** Source of content the persona references (e.g. RSS feed, article URL). */
const personaSourceSchema = z.object({
  kind: z.enum(["rss", "url"]),
  url: z.string().min(1).max(2048),
});

/**
 * Auto-topup policy for the persona's PPQ credit (NIP-47 NWC). Persisted
 * inside the encrypted payload so the user's choice rides the backup
 * across devices.
 */
const personaAutoTopupSchema = z.object({
  enabled: z.boolean(),
  threshold_usd: z.number().nonnegative().max(10000),
  topup_amount_usd: z.number().positive().max(10000).optional(),
  funding_source: z.enum(["operator", "persona"]).optional(),
  target_usd: z.number().positive().max(10000).optional(),
}).refine(
  (cfg) => cfg.topup_amount_usd !== undefined || cfg.target_usd !== undefined,
  "must include topup_amount_usd",
);

const personaSchema = z.object({
  pubkey: z.string().regex(/^[0-9a-f]{64}$/i, "must be 64 hex chars"),
  nsec: z
    .string()
    .regex(/^nsec1[02-9ac-hj-np-z]{58,}$/i, "must be a valid nsec1… string"),
  /**
   * Stable per-persona d-tag. Generated once at creation, mirrored
   * onto the kind 30078 envelope's `["d", ...]` tag, and reused on
   * every update so addressable-event semantics replace the prior
   * revision (see PROJECT.md §5.2).
   *
   * Optional here for back-compat with personas published before this
   * field landed; readers fall back to the event tag. New personas
   * always write it.
   */
  dTag: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(120),
  /**
   * URL-friendly persona handle used for the kind 0 `name` field.
   * Lightning Address registration is tracked separately in the wallet
   * payload. Optional for back-compat with personas authored before this
   * field landed; new personas always write it. Lowercase letters,
   * digits, and hyphens.
   */
  username: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits, and hyphens; must start with a letter or digit")
    .optional(),
  /**
   * Rich/free-form name shown in the persona's kind 0 `display_name`.
   * Falls back to `name` if missing — the two are aliases on read but
   * `display_name` is preferred when present.
   */
  display_name: z.string().min(1).max(120).optional(),
  system_prompt: z.string().max(20000),
  reference_image_url: z.string().min(1).max(2048).optional(),
  created_at: z.number().int().nonnegative(),
  // Demo-critical domain fields (added during PR #2 schema reconciliation).
  // All optional for back-compat with personas authored before they shipped.
  region: z.string().min(1).max(8).optional(),
  cause: z.string().min(1).max(120).optional(),
  bio: z.string().max(2000).optional(),
  tone: z.string().max(2000).optional(),
  sources: z.array(personaSourceSchema).max(64).optional(),
  /**
   * Cross-posting webhook (V1.5 — see derek-plan.md "Cross-post +
   * video composer"). When set, the Dashboard composer POSTs every
   * published kind 1 event to `webhook_url` so a third-party
   * aggregator (Buffer / Zapier / Make.com / etc.) can fan it out
   * to non-Nostr platforms (X / Facebook / Instagram / etc.).
   *
   * `webhook_platforms` is a hint passed to the aggregator inside
   * the payload — the aggregator's account configuration is the
   * actual source of truth for what gets posted where.
   */
  cross_post: z
    .object({
      webhook_url: z.string().min(1).max(4096).optional(),
      webhook_platforms: z
        .array(z.string().min(1).max(32))
        .max(8)
        .optional(),
    })
    .optional(),
});

export const walletSchema = z.object({
  // Phoenix V1 uses Breez Spark SDK (`@breeztech/breez-sdk-spark`).
  // Future SDK variants land as a discriminated union.
  kind: z.literal("spark"),
  /** BIP-39 mnemonic (12, 15, 18, 21, or 24 words). Held only inside the encrypted backup. */
  seed: z
    .string()
    .min(1)
    .max(2048)
    .refine((m) => {
      const words = m.trim().split(/\s+/);
      return words.length === 12 || words.length === 15 ||
        words.length === 18 || words.length === 21 || words.length === 24;
    }, "must be a valid BIP-39 mnemonic (12, 15, 18, 21, or 24 words)"),
  /** Public donate handle. Safe to embed; already public via the kind 0 lud16. */
  lightning_address: z.string().max(512).optional(),
  lnurl: z.string().min(1).max(4096).optional(),
  auto_topup: personaAutoTopupSchema.optional(),
});

const modelPrefsSchema = z.object({
  agent: z.string().min(1).max(120),
  image: z.string().min(1).max(120),
  tts: z.string().min(1).max(120),
  video: z.string().min(1).max(120).nullable().optional(),
});

const settingsSchema = z.object({
  default_relays: z.array(z.string().min(1).max(2048)).max(64).default([]),
});

const phoenixEnvelopeSchema = z.object({
  app: z.literal(PHOENIX_PAYLOAD_APP),
  version: z.literal(PHOENIX_PAYLOAD_VERSION),
  persona: personaSchema,
  // Optional until the wallet wiring lands; required after that.
  wallet: walletSchema.optional(),
  // Optional; defaults applied at use-time.
  model_prefs: modelPrefsSchema.optional(),
  settings: settingsSchema.optional(),
});

// ─────────── Public types (inferred from schemas) ───────────

export type PersonaSource = z.infer<typeof personaSourceSchema>;
export type PersonaAutoTopup = z.infer<typeof personaAutoTopupSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type PersonaWallet = z.infer<typeof walletSchema>;
export type PersonaModelPrefs = z.infer<typeof modelPrefsSchema>;
export type PersonaSettings = z.infer<typeof settingsSchema>;
export type PhoenixEnvelope = z.infer<typeof phoenixEnvelopeSchema>;

// ─────────── Event template builder ───────────

/**
 * Build the unsigned event template for an encrypted persona definition.
 * The d-tag is a random UUID — no semantic information.
 *
 * No `t`, no `alt`, no client tag — anything that would identify the
 * event as Phoenix-related lives strictly inside the ciphertext.
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

  // Derive-and-verify: the persona.pubkey claim must match the public key
  // derived from the embedded persona.nsec. Defends against a tampered
  // envelope where the user's signer was used to encrypt a config
  // claiming the wrong identity.
  const derived = pubkeyFromNsec(envelope.persona.nsec);
  if (!derived) return null;
  if (derived.toLowerCase() !== envelope.persona.pubkey.toLowerCase()) {
    return null;
  }

  // Normalize the pubkey casing for downstream comparators.
  return {
    ...envelope,
    persona: {
      ...envelope.persona,
      pubkey: envelope.persona.pubkey.toLowerCase(),
    },
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

/**
 * Default model preferences per task. PROJECT.md §6 — model strings
 * follow whatever PPQ's `/v1/models` returns; the strings below are
 * placeholders adjusted post-Spike A.
 */
export const DEFAULT_MODEL_PREFS: PersonaModelPrefs = {
  agent: "anthropic/claude-sonnet-4.5",
  image: "openai/gpt-image-1",
  tts: "openai/tts-1-hd",
  video: null,
};
