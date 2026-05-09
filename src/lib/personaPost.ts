/**
 * Helpers for building Phoenix persona posts (kind 1) with
 * provenance, source attribution, and discovery tags.
 *
 * Tag layout for a Phoenix-published note:
 *   ["t", "phoenix"]                       — discovery / app tag
 *   ["t", <region-slug>]                   — e.g. "rwanda" (lowercased ISO name)
 *   ["t", <cause-slug>]                    — e.g. "human-rights"
 *   ["r", <source-url>]                    — repeatable; one per source informing the post
 *   ["operator", <hex-pubkey>]             — the human accountable for this persona
 *   ["client", "phoenix"]                  — client tag
 *   ["alt", "AI-styled post by Phoenix persona ..."]  — NIP-31 transparency
 *
 * Posts are signed by the **persona's** nsec (not the operator's).
 */

import { PHOENIX_CLIENT_TAG } from "./persona";

export interface PersonaPostInput {
  /** Final post body (post-styling). */
  text: string;
  /** Persona display name (used in alt tag). */
  personaName: string;
  /** Region slug, e.g. "rwanda". */
  regionSlug: string;
  /** Cause slug, e.g. "human-rights". */
  causeSlug: string;
  /** Operator hex pubkey (provenance). */
  operatorPubkey: string;
  /** Source URLs that informed the post. */
  sources?: string[];
  /** Optional extra topical hashtags (lowercased, no #). */
  extraTopics?: string[];
}

export function buildPersonaPostTemplate(
  input: PersonaPostInput,
  createdAt: number = Math.floor(Date.now() / 1000)
): {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
} {
  const tags: string[][] = [
    ["t", "phoenix"],
    ["t", input.regionSlug],
    ["t", input.causeSlug],
    ["operator", input.operatorPubkey],
    ["client", PHOENIX_CLIENT_TAG],
    [
      "alt",
      `AI-styled post by Phoenix persona "${input.personaName}". Provenance and sources verifiable on Nostr.`,
    ],
  ];

  for (const url of input.sources ?? []) {
    if (url) tags.push(["r", url]);
  }

  for (const topic of input.extraTopics ?? []) {
    if (topic) tags.push(["t", topic]);
  }

  return {
    kind: 1,
    created_at: createdAt,
    tags,
    content: input.text,
  };
}

/**
 * Extract source URLs from a kind 1 event for the attribution UI.
 */
export function extractSources(tags: string[][]): string[] {
  return tags
    .filter(([n]) => n === "r")
    .map(([, url]) => url)
    .filter(Boolean);
}

/**
 * Extract source domains (for attribution pills).
 */
export function extractSourceDomains(tags: string[][]): string[] {
  return Array.from(
    new Set(
      extractSources(tags)
        .map((url) => {
          try {
            return new URL(url).hostname.replace(/^www\./, "");
          } catch {
            return null;
          }
        })
        .filter((d): d is string => Boolean(d))
    )
  );
}
