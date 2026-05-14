import type { NostrMetadata } from "@nostrify/types";

const STRING_METADATA_FIELDS = [
  "about",
  "display_name",
  "lud06",
  "lud16",
  "name",
  "nip05",
] as const;

const URL_METADATA_FIELDS = ["banner", "picture", "website"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseNostrMetadata(content: string | undefined): NostrMetadata | null {
  if (!content) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const metadata: NostrMetadata = {};
  for (const key of STRING_METADATA_FIELDS) {
    const value = parsed[key];
    if (typeof value === "string") metadata[key] = value;
  }

  for (const key of URL_METADATA_FIELDS) {
    const value = parsed[key];
    if (typeof value === "string" && isAbsoluteUrl(value)) metadata[key] = value;
  }

  if (typeof parsed.bot === "boolean") metadata.bot = parsed.bot;

  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in metadata)) metadata[key] = value;
  }

  return metadata;
}
