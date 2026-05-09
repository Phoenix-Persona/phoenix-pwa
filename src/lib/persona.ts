/**
 * Phoenix persona event schema (encrypted, untrackable).
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
 *     app: "phoenix",
 *     version: 1,
 *     personaPubkey: <hex>,        cross-reference to the persona's npub
 *     ...PersonaConfig             everything else (system prompt, sources,
 *                                  persona nsec, etc.)
 *   }
 *
 * The Phoenix discriminator and the persona-pubkey ↔ operator link only
 * exist inside the encrypted payload. To find a persona, the operator
 * scans their own kind 30078 events and decrypts each one — successful
 * decryption + Phoenix discriminator = a Phoenix persona event.
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

import type { NostrEvent } from "@nostrify/nostrify";

export const PERSONA_KIND = 30078;
export const PHOENIX_PAYLOAD_APP = "phoenix";
export const PHOENIX_PAYLOAD_VERSION = 1;

export type SourceKind = "rss" | "url";

export interface PersonaSource {
  kind: SourceKind;
  url: string;
}

/**
 * Decrypted persona configuration. Everything an operator needs to run the
 * persona, including the persona's own nsec for cross-device recovery.
 */
export interface PersonaConfig {
  /** Persona display name. */
  name: string;
  /** ISO-3166-1 alpha-2 region code. */
  region: string;
  /** Cause slug. */
  cause: string;
  /** BCP-47 language codes. */
  languages: string[];
  /** Freeform tone descriptor. */
  tone: string;
  /** Target posting interval (seconds) — V2 brainstorm. */
  frequencySec: number;
  /** Source materials. */
  sources: PersonaSource[];
  /** Topic foci. */
  focus: string[];
  /** OpenRouter model id. */
  model: string;
  /** Editorial voice spec applied to every styled post. */
  systemPrompt: string;
  /** Freeform personality descriptor. */
  personality: string;
  /** Public-ish bio (also published as part of the persona's kind 0). */
  bio: string;
  /** Optional voice style notes. */
  voiceStyle?: string;
  /** Topics to avoid. */
  avoidTopics?: string[];
  /** Persona nsec — included for cross-device recovery. Never leaves the encrypted blob. */
  personaNsec: string;
}

/**
 * Phoenix payload wrapper (the JSON value that gets NIP-44 encrypted).
 * Includes a discriminator (so the operator's decrypt-and-scan loop knows
 * which 30078 events are Phoenix personas) and the persona pubkey (so the
 * UI can resolve a persona npub to the right encrypted event).
 */
export interface PhoenixEnvelope {
  app: typeof PHOENIX_PAYLOAD_APP;
  version: number;
  personaPubkey: string;
  config: PersonaConfig;
}

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

/**
 * Validate a decrypted JSON string is a Phoenix persona envelope.
 * Returns the parsed envelope on success, null if it's some other app's
 * payload or malformed data.
 */
export function parsePhoenixEnvelope(plaintext: string): PhoenixEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.app !== PHOENIX_PAYLOAD_APP) return null;
  if (typeof obj.version !== "number") return null;
  if (typeof obj.personaPubkey !== "string") return null;
  if (!/^[0-9a-f]{64}$/i.test(obj.personaPubkey)) return null;
  const config = obj.config as Record<string, unknown> | undefined;
  if (!config || typeof config.name !== "string" || typeof config.personaNsec !== "string") {
    return null;
  }
  return {
    app: PHOENIX_PAYLOAD_APP,
    version: obj.version,
    personaPubkey: obj.personaPubkey.toLowerCase(),
    config: config as unknown as PersonaConfig,
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

/**
 * Default model used for a fresh persona.
 */
export const DEFAULT_PERSONA_MODEL = "anthropic/claude-sonnet-4.5";

/** Default posting frequency (1 hour). */
export const DEFAULT_FREQUENCY_SEC = 3600;
