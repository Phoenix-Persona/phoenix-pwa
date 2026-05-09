/**
 * Phoenix persona event schema (encrypted).
 *
 * Persona configurations are PRIVATE to the operator who created them.
 * The operator signs a kind 30078 event whose content is NIP-44 encrypted
 * to the operator's own pubkey. Only the operator can decrypt and use the
 * persona; nobody else on Nostr can extract the system prompt, source list,
 * or persona nsec — so personas can't be cloned by others.
 *
 * Schema:
 *   kind: 30078
 *   pubkey: <operator pubkey>          (signed by operator)
 *   tags:
 *     ["d", <persona-pubkey-hex>]      addressable per persona
 *     ["t", "phoenix-persona"]         filter for "my personas"
 *     ["p", <persona-pubkey-hex>]      cross-reference to the persona's npub
 *     ["alt", <human-readable>]        NIP-31
 *     ["client", "phoenix"]
 *   content: NIP-44(operator → operator) of JSON {
 *     name, region, cause, languages, tone, frequencySec,
 *     sources, focus, model,
 *     systemPrompt, personality, bio, voiceStyle?, avoidTopics?,
 *     personaNsec   // included so the operator can recover the persona key
 *                   // from any device they sign in on
 *   }
 *
 * The persona's *posts* (kind 1) remain PUBLIC. The persona also publishes
 * a public kind 0 profile so the persona is discoverable via standard Nostr
 * tools (any client can render the persona's feed without Phoenix knowledge).
 */

import type { NostrEvent } from "@nostrify/nostrify";

export const PERSONA_KIND = 30078;
export const PERSONA_FILTER_TAG = "phoenix-persona";
export const PHOENIX_CLIENT_TAG = "phoenix";

export type SourceKind = "rss" | "url";

export interface PersonaSource {
  kind: SourceKind;
  url: string;
}

/**
 * Decrypted persona configuration.
 * Everything the operator needs to reproduce and operate the persona.
 */
export interface PersonaConfig {
  /** Persona display name. */
  name: string;
  /** ISO-3166-1 alpha-2 region code. */
  region: string;
  /** Cause slug (e.g. "human-rights"). */
  cause: string;
  /** BCP-47 language codes. */
  languages: string[];
  /** Freeform tone descriptor. */
  tone: string;
  /** Target posting interval (seconds) for V2 brainstorm. */
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
  /**
   * Persona nsec — included so the operator can recover the persona keypair
   * from any device they sign in on. Never leaves the encrypted blob.
   */
  personaNsec: string;
}

/**
 * Build the unsigned-event template for a persona definition.
 * Caller is responsible for:
 *   1. Encrypting the JSON-serialized PersonaConfig with the operator's
 *      NIP-44 signer (encrypt to self).
 *   2. Signing the resulting template with the operator's signer.
 */
export function buildEncryptedPersonaTemplate(
  args: {
    operatorPubkey: string;
    personaPubkey: string;
    personaName: string;
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
    tags: [
      ["d", args.personaPubkey],
      ["t", PERSONA_FILTER_TAG],
      ["p", args.personaPubkey],
      [
        "alt",
        `Phoenix persona definition (encrypted) for "${args.personaName}". Only the operator (${args.operatorPubkey.slice(0, 12)}…) can decrypt.`,
      ],
      ["client", PHOENIX_CLIENT_TAG],
    ],
    content: args.encryptedContent,
  };
}

/**
 * Validate that an event is a Phoenix persona definition.
 * Returns the persona pubkey if valid, otherwise null.
 * The actual config is encrypted; decrypting requires the operator's signer.
 */
export function getPersonaPubkeyFromEvent(event: NostrEvent): string | null {
  if (event.kind !== PERSONA_KIND) return null;
  if (!event.tags.some(([n, v]) => n === "t" && v === PERSONA_FILTER_TAG)) {
    return null;
  }
  const dTag = event.tags.find(([n]) => n === "d")?.[1];
  if (!dTag) return null;
  // Persona pubkey is the d-tag value. Validate hex format.
  if (!/^[0-9a-f]{64}$/i.test(dTag)) return null;
  return dTag.toLowerCase();
}

/**
 * Default model used for a fresh persona.
 */
export const DEFAULT_PERSONA_MODEL = "anthropic/claude-sonnet-4.5";

/**
 * Default posting frequency (1 hour).
 */
export const DEFAULT_FREQUENCY_SEC = 3600;
