/**
 * Helpers for building persona posts (kind 1).
 *
 * Privacy: posts MUST NOT carry any tag that identifies the user or
 * advertises Phoenix usage. They look like ordinary kind 1 notes from
 * any account. Source-attribution `r` tags and topical `t` tags are
 * content, not identity, and remain.
 *
 * What we publish:
 *   ["t", <topic-slug>]       repeatable; topical discovery (e.g. "rwanda", "press-freedom")
 *   ["r", <source-url>]       repeatable; source attribution
 *
 * What we deliberately DON'T publish:
 *   - user pubkey tag           (would directly link persona → human)
 *   - "phoenix" / "client" tag  (would fingerprint the app)
 *   - persona name in alt tag   (would identify the persona)
 *
 * See tasks/derek-plan.md "Locked decisions" §2 (kind 1 posts).
 */

export interface PersonaPostInput {
  /** Final post body (post-styling). */
  text: string;
  /** Topical tags — region, cause, etc. Lowercased, no `#` prefix. */
  tags?: string[];
  /** Source URLs that informed the post. */
  sources?: string[];
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

  for (const t of input.tags ?? []) {
    if (t) tags.push(["t", t]);
  }

  for (const url of input.sources ?? []) {
    if (url) tags.push(["r", url]);
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
