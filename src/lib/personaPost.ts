/**
 * Helpers for building persona posts (kind 1).
 *
 * Privacy: posts MUST NOT carry any tag that identifies the user or
 * advertises Phoenix usage. They look like ordinary kind 1 notes from
 * any account. Source-attribution `r` tags are content, not identity,
 * and remain.
 *
 * What we publish:
 *   ["r", <source-url>]       repeatable; source attribution
 *
 * What we deliberately DON'T publish:
 *   - user pubkey tag           (would directly link persona → human)
 *   - "phoenix" / "client" tag  (would fingerprint the app)
 *   - persona name in alt tag   (would identify the persona)
 *
 * See `docs/THREAT-MODEL.md` for the operator/persona privacy model.
 */

export interface PersonaPostInput {
  /** Final post body (post-styling). */
  text: string;
  /** Source URLs that informed the post. */
  sources?: string[];
  /**
   * Optional NIP-92 `imeta` attachment. When provided we add:
   *   1. an `["imeta", "url <url>", "m <mimeType>"]` tag — for clients
   *      that render NIP-92 media inline (Damus, Iris, Highlighter), AND
   *   2. the URL appended on its own line at the end of `content` —
   *      for clients that only auto-link URLs found in body text
   *      (older / simpler clients).
   *
   * This double-emit is conventional Nostr practice; clients that
   * understand imeta deduplicate against the body URL automatically.
   */
  media?: {
    url: string;
    /** MIME type, e.g. "video/mp4" or "image/png". */
    mimeType: string;
  };
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

  for (const url of input.sources ?? []) {
    if (url) tags.push(["r", url]);
  }

  let content = input.text;
  if (input.media?.url) {
    tags.push([
      "imeta",
      `url ${input.media.url}`,
      `m ${input.media.mimeType}`,
    ]);
    // Append the URL on its own line if the user's caption doesn't
    // already mention it. This makes the media visible on clients
    // that only render auto-linked URLs from body text.
    if (!content.includes(input.media.url)) {
      const sep = content.endsWith("\n") || content.length === 0 ? "" : "\n\n";
      content = `${content}${sep}${input.media.url}`;
    }
  }

  return {
    kind: 1,
    created_at: createdAt,
    tags,
    content,
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

export interface ImetaMedia {
  url: string;
  mime?: string;
  alt?: string;
  blurhash?: string;
  dim?: { w: number; h: number };
  /**
   * Optional poster URL for video imeta — some clients emit
   * `image url` inside the same imeta tag pointing at a thumbnail.
   */
  poster?: string;
}

export type ImetaImage = ImetaMedia;
export type ImetaVideo = ImetaMedia;

/**
 * Parse a single `imeta` tag into a key→value map. NIP-92 puts
 * space-separated key/value pairs into each tag element; some
 * clients forget and put each kv pair as its own tag element. We
 * accept either shape.
 */
function parseImetaFields(tag: string[]): Record<string, string> {
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
  return fields;
}

/** Sanitise to HTTPS-only URLs. Rejects http:/data:/javascript:/etc. */
function sanitizeMediaUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") {
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Pull dimensions from a NIP-92 `dim WxH` field if present. */
function parseDim(
  raw: string | undefined
): { w: number; h: number } | undefined {
  const m = raw?.match(/^(\d+)x(\d+)$/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : undefined;
}

/**
 * Parse NIP-92 `imeta` tags into renderable image descriptors.
 *
 * Accepts MIME-tagged images (`m image/...`) or URLs with a
 * recognised image extension. Video imeta entries are skipped — use
 * `extractImetaVideos` for those.
 */
export function extractImetaImages(tags: string[][]): ImetaImage[] {
  const images: ImetaImage[] = [];

  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const fields = parseImetaFields(tag);
    const safeUrl = sanitizeMediaUrl(fields.url);
    if (!safeUrl) continue;

    const mime = fields.m;
    const isImage =
      (mime && mime.startsWith("image/")) ||
      (!mime && /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(safeUrl));
    if (!isImage) continue;

    images.push({
      url: safeUrl,
      mime,
      alt: fields.alt,
      blurhash: fields.blurhash,
      dim: parseDim(fields.dim),
    });
  }

  return images;
}

/**
 * Parse NIP-92 `imeta` tags into renderable video descriptors.
 *
 * Accepts MIME-tagged videos (`m video/...`) or URLs with a
 * recognised video extension. Optional `image` field is treated as
 * a poster URL.
 */
export function extractImetaVideos(tags: string[][]): ImetaVideo[] {
  const videos: ImetaVideo[] = [];

  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const fields = parseImetaFields(tag);
    const safeUrl = sanitizeMediaUrl(fields.url);
    if (!safeUrl) continue;

    const mime = fields.m;
    const isVideo =
      (mime && mime.startsWith("video/")) ||
      (!mime && /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(safeUrl));
    if (!isVideo) continue;

    videos.push({
      url: safeUrl,
      mime,
      alt: fields.alt,
      blurhash: fields.blurhash,
      dim: parseDim(fields.dim),
      poster: sanitizeMediaUrl(fields.image) ?? undefined,
    });
  }

  return videos;
}
