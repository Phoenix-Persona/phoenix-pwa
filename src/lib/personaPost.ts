/**
 * Helpers for building persona posts (kind 1).
 *
 * Privacy: posts MUST NOT carry any tag that identifies the operator or
 * advertises Phoenix usage. They look like ordinary kind 1 notes from
 * any account. Source-attribution `r` tags and topical `t` tags are
 * content, not identity, and remain.
 *
 * What we publish:
 *   ["t", <region-slug>]      e.g. "rwanda" — topical discovery
 *   ["t", <cause-slug>]       e.g. "human-rights" — topical discovery
 *   ["r", <source-url>]       repeatable; source attribution
 *   ["t", <extra-topic>]      optional extras
 *
 * What we deliberately DON'T publish:
 *   - operator pubkey tag       (would directly link persona → human)
 *   - "phoenix" / "client" tag  (would fingerprint the app)
 *   - persona name in alt tag   (would identify the persona)
 */

export interface PersonaPostInput {
  /** Final post body (post-styling). */
  text: string;
  /** Region slug, e.g. "rwanda" — lowercased ISO name or similar. */
  regionSlug: string;
  /** Cause slug, e.g. "human-rights". */
  causeSlug: string;
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
  const tags: string[][] = [];

  if (input.regionSlug) tags.push(["t", input.regionSlug]);
  if (input.causeSlug) tags.push(["t", input.causeSlug]);

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
