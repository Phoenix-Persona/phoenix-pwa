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

export interface ImetaImage {
  url: string;
  mime?: string;
  alt?: string;
  blurhash?: string;
  dim?: { w: number; h: number };
}

/**
 * Parse NIP-92 `imeta` tags into renderable image descriptors.
 *
 * NIP-92 stuffs space-separated key/value pairs into the imeta tag's
 * remaining elements (e.g.
 * `["imeta", "url https://...", "m image/png", "alt ...", "dim 1024x768"]`).
 * Some clients use the alternative form where each kv pair is a
 * separate tag element — we accept either shape.
 *
 * Only entries with a sanitisable http(s) URL and an image MIME (or a
 * URL that ends in a recognised image extension) are returned.
 */
export function extractImetaImages(tags: string[][]): ImetaImage[] {
  const images: ImetaImage[] = [];

  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;

    const fields: Record<string, string> = {};
    for (const part of tag.slice(1)) {
      if (typeof part !== "string") continue;
      const idx = part.indexOf(" ");
      if (idx < 1) continue;
      const key = part.slice(0, idx);
      const value = part.slice(idx + 1).trim();
      if (key && value && !(key in fields)) {
        fields[key] = value;
      }
    }

    const url = fields.url;
    if (!url) continue;

    // Reject anything but http(s) — never let data: / javascript: through.
    let safeUrl: string | null = null;
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        safeUrl = u.toString();
      }
    } catch {
      continue;
    }
    if (!safeUrl) continue;

    const mime = fields.m;
    const isImage =
      (mime && mime.startsWith("image/")) ||
      /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(safeUrl);
    if (!isImage) continue;

    const dimMatch = fields.dim?.match(/^(\d+)x(\d+)$/);
    const dim = dimMatch
      ? { w: Number(dimMatch[1]), h: Number(dimMatch[2]) }
      : undefined;

    images.push({
      url: safeUrl,
      mime,
      alt: fields.alt,
      blurhash: fields.blurhash,
      dim,
    });
  }

  return images;
}
