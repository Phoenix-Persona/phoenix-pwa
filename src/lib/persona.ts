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
 * Schema: docs/PERSONA-SCHEMA.md inner-payload structure.
 * Privacy override: tags-on-the-envelope follow the existing untrackable
 * design rather than §5.2 which would tag-leak Phoenix usage.
 * See `docs/PERSONA-SCHEMA.md`.
 */

import { getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "@nostrify/nostrify";

export const PERSONA_KIND = 30078;
export const PHOENIX_PAYLOAD_APP = "phoenix-persona";
export const PHOENIX_PAYLOAD_VERSION = 1 as const;

// ─────────── Public types ───────────

export interface PersonaSource {
  kind: "rss" | "url";
  url: string;
}

export interface PersonaAutoTopup {
  enabled: boolean;
  threshold_usd: number;
  topup_amount_usd?: number;
  funding_source?: "operator" | "persona";
  target_usd?: number;
}

export interface Persona {
  pubkey: string;
  nsec: string;
  dTag?: string;
  name: string;
  username?: string;
  display_name?: string;
  system_prompt: string;
  reference_image_url?: string;
  created_at: number;
  region?: string;
  cause?: string;
  bio?: string;
  tone?: string;
  sources?: PersonaSource[];
  cross_post?: {
    webhook_url?: string;
    webhook_platforms?: string[];
  };
}

export interface PersonaWallet {
  kind: "spark";
  seed: string;
  lightning_address?: string;
  lnurl?: string;
  auto_topup?: PersonaAutoTopup;
}

export interface PersonaModelPrefs {
  agent: string;
  image: string;
  tts: string;
  video?: string | null;
}

export interface PersonaSettings {
  default_relays: string[];
}

export interface PhoenixEnvelope {
  app: typeof PHOENIX_PAYLOAD_APP;
  version: typeof PHOENIX_PAYLOAD_VERSION;
  persona: Persona;
  wallet?: PersonaWallet;
  model_prefs?: PersonaModelPrefs;
  settings?: PersonaSettings;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringLength(value: unknown, min: number, max: number, pattern?: RegExp): value is string {
  return typeof value === "string" &&
    value.length >= min &&
    value.length <= max &&
    (!pattern || pattern.test(value));
}

function optionalString(value: unknown, min: number, max: number, pattern?: RegExp): string | undefined | null {
  if (value === undefined) return undefined;
  return isStringLength(value, min, max, pattern) ? value : null;
}

function isNumberInRange(value: unknown, min: number, max: number, integer = false): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value));
}

function optionalPositiveNumber(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return isNumberInRange(value, Number.MIN_VALUE, 10000) ? value : null;
}

function parseStringArray(value: unknown, maxItems: number, minLength: number, maxLength: number): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    if (!isStringLength(item, minLength, maxLength)) return null;
    out.push(item);
  }
  return out;
}

function parseSources(value: unknown): PersonaSource[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 64) return null;
  const out: PersonaSource[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (item.kind !== "rss" && item.kind !== "url") return null;
    if (!isStringLength(item.url, 1, 2048)) return null;
    out.push({ kind: item.kind, url: item.url });
  }
  return out;
}

function parseAutoTopup(value: unknown): PersonaAutoTopup | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (typeof value.enabled !== "boolean") return null;
  if (!isNumberInRange(value.threshold_usd, 0, 10000)) return null;
  const topupAmountUsd = optionalPositiveNumber(value.topup_amount_usd);
  const targetUsd = optionalPositiveNumber(value.target_usd);
  if (topupAmountUsd === null || targetUsd === null) return null;
  if (topupAmountUsd === undefined && targetUsd === undefined) return null;
  if (
    value.funding_source !== undefined &&
    value.funding_source !== "operator" &&
    value.funding_source !== "persona"
  ) {
    return null;
  }
  return {
    enabled: value.enabled,
    threshold_usd: value.threshold_usd,
    ...(topupAmountUsd !== undefined ? { topup_amount_usd: topupAmountUsd } : {}),
    ...(value.funding_source !== undefined ? { funding_source: value.funding_source } : {}),
    ...(targetUsd !== undefined ? { target_usd: targetUsd } : {}),
  };
}

function isValidMnemonicShape(seed: string): boolean {
  const words = seed.trim().split(/\s+/);
  return words.length === 12 ||
    words.length === 15 ||
    words.length === 18 ||
    words.length === 21 ||
    words.length === 24;
}

export function parsePersonaWallet(value: unknown): PersonaWallet | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "spark") return null;
  if (!isStringLength(value.seed, 1, 2048) || !isValidMnemonicShape(value.seed)) return null;
  const lightningAddress = optionalString(value.lightning_address, 0, 512);
  const lnurl = optionalString(value.lnurl, 1, 4096);
  const autoTopup = parseAutoTopup(value.auto_topup);
  if (lightningAddress === null || lnurl === null || autoTopup === null) return null;
  return {
    kind: "spark",
    seed: value.seed,
    ...(lightningAddress !== undefined ? { lightning_address: lightningAddress } : {}),
    ...(lnurl !== undefined ? { lnurl } : {}),
    ...(autoTopup !== undefined ? { auto_topup: autoTopup } : {}),
  };
}

function parseModelPrefs(value: unknown): PersonaModelPrefs | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (!isStringLength(value.agent, 1, 120)) return null;
  if (!isStringLength(value.image, 1, 120)) return null;
  if (!isStringLength(value.tts, 1, 120)) return null;
  if (
    value.video !== undefined &&
    value.video !== null &&
    !isStringLength(value.video, 1, 120)
  ) {
    return null;
  }
  return {
    agent: value.agent,
    image: value.image,
    tts: value.tts,
    ...(value.video !== undefined ? { video: value.video } : {}),
  };
}

function parseSettings(value: unknown): PersonaSettings | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const defaultRelays = parseStringArray(value.default_relays, 64, 1, 2048);
  if (defaultRelays === null) return null;
  return { default_relays: defaultRelays ?? [] };
}

function parseCrossPost(value: unknown): Persona["cross_post"] | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const webhookUrl = optionalString(value.webhook_url, 1, 4096);
  const webhookPlatforms = parseStringArray(value.webhook_platforms, 8, 1, 32);
  if (webhookUrl === null || webhookPlatforms === null) return null;
  return {
    ...(webhookUrl !== undefined ? { webhook_url: webhookUrl } : {}),
    ...(webhookPlatforms !== undefined ? { webhook_platforms: webhookPlatforms } : {}),
  };
}

function parsePersona(value: unknown): Persona | null {
  if (!isRecord(value)) return null;
  if (!isStringLength(value.pubkey, 64, 64, /^[0-9a-f]{64}$/i)) return null;
  if (!isStringLength(value.nsec, 1, 128, /^nsec1[02-9ac-hj-np-z]{58,}$/i)) return null;
  if (!isStringLength(value.name, 1, 120)) return null;
  if (!isStringLength(value.system_prompt, 0, 20000)) return null;
  if (!isNumberInRange(value.created_at, 0, Number.MAX_SAFE_INTEGER, true)) return null;

  const dTag = optionalString(value.dTag, 1, 128);
  const username = optionalString(value.username, 1, 60, /^[a-z0-9][a-z0-9-]*$/);
  const displayName = optionalString(value.display_name, 1, 120);
  const referenceImageUrl = optionalString(value.reference_image_url, 1, 2048);
  const region = optionalString(value.region, 1, 8);
  const cause = optionalString(value.cause, 1, 120);
  const bio = optionalString(value.bio, 0, 2000);
  const tone = optionalString(value.tone, 0, 2000);
  const sources = parseSources(value.sources);
  const crossPost = parseCrossPost(value.cross_post);
  if (
    dTag === null ||
    username === null ||
    displayName === null ||
    referenceImageUrl === null ||
    region === null ||
    cause === null ||
    bio === null ||
    tone === null ||
    sources === null ||
    crossPost === null
  ) {
    return null;
  }

  return {
    pubkey: value.pubkey,
    nsec: value.nsec,
    name: value.name,
    system_prompt: value.system_prompt,
    created_at: value.created_at,
    ...(dTag !== undefined ? { dTag } : {}),
    ...(username !== undefined ? { username } : {}),
    ...(displayName !== undefined ? { display_name: displayName } : {}),
    ...(referenceImageUrl !== undefined ? { reference_image_url: referenceImageUrl } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(cause !== undefined ? { cause } : {}),
    ...(bio !== undefined ? { bio } : {}),
    ...(tone !== undefined ? { tone } : {}),
    ...(sources !== undefined ? { sources } : {}),
    ...(crossPost !== undefined ? { cross_post: crossPost } : {}),
  };
}

function parseEnvelope(value: unknown): PhoenixEnvelope | null {
  if (!isRecord(value)) return null;
  if (value.app !== PHOENIX_PAYLOAD_APP) return null;
  if (value.version !== PHOENIX_PAYLOAD_VERSION) return null;
  const persona = parsePersona(value.persona);
  if (!persona) return null;
  const wallet = value.wallet === undefined ? undefined : parsePersonaWallet(value.wallet);
  const modelPrefs = parseModelPrefs(value.model_prefs);
  const settings = parseSettings(value.settings);
  if (wallet === null || modelPrefs === null || settings === null) return null;
  return {
    app: PHOENIX_PAYLOAD_APP,
    version: PHOENIX_PAYLOAD_VERSION,
    persona,
    ...(wallet !== undefined ? { wallet } : {}),
    ...(modelPrefs !== undefined ? { model_prefs: modelPrefs } : {}),
    ...(settings !== undefined ? { settings } : {}),
  };
}

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
 *   2. Runtime schema check (app discriminator, version pin, shape, length limits)
 *   3. Pubkey-from-nsec match
 */
export function parsePhoenixEnvelope(plaintext: string): PhoenixEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }

  const envelope = parseEnvelope(parsed);
  if (!envelope) return null;

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
 * Default model preferences per task. Model strings
 * follow whatever PPQ's `/v1/models` returns; the strings below are
 * placeholders adjusted post-Spike A.
 */
export const DEFAULT_MODEL_PREFS: PersonaModelPrefs = {
  agent: "anthropic/claude-sonnet-4.5",
  image: "openai/gpt-image-1",
  tts: "openai/tts-1-hd",
  video: null,
};
