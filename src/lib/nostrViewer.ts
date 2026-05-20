import { nip19 } from "nostr-tools";
import type { NostrEvent } from "@nostrify/nostrify";

export const NOSTR_VIEWER_STORAGE_KEY = "zuka:nostr-viewer";

export interface NostrViewerPreset {
  readonly id: string;
  readonly label: string;
  readonly urlPrefix: string;
}

export const NOSTR_VIEWER_PRESETS: readonly NostrViewerPreset[] = [
  { id: "njump", label: "njump.me", urlPrefix: "https://njump.me/" },
  { id: "primal", label: "primal.net", urlPrefix: "https://primal.net/e/" },
  { id: "snort", label: "snort.social", urlPrefix: "https://snort.social/e/" },
];

export const DEFAULT_NOSTR_VIEWER_URL = NOSTR_VIEWER_PRESETS[0].urlPrefix;

export function sanitizeNostrViewerUrlPrefix(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const href = url.toString().replace(/\/+$/, "");
    return `${href}/`;
  } catch {
    return null;
  }
}

export function buildEventUrl(viewerPrefix: string, nevent: string): string {
  const safePrefix =
    sanitizeNostrViewerUrlPrefix(viewerPrefix) ?? DEFAULT_NOSTR_VIEWER_URL;
  const trimmed = safePrefix.replace(/\/+$/, "");
  return `${trimmed}/${nevent}`;
}

export function truncateNevent(nevent: string, head = 12, tail = 6): string {
  if (nevent.length <= head + tail + 1) return nevent;
  return `${nevent.slice(0, head)}…${nevent.slice(-tail)}`;
}

export function encodeEventAsNevent(
  event: Pick<NostrEvent, "id" | "pubkey" | "kind">,
  relays?: readonly string[],
): string {
  return nip19.neventEncode({
    id: event.id,
    author: event.pubkey,
    kind: event.kind,
    relays: relays ? [...relays] : undefined,
  });
}

export function encodePubkeyAsNprofile(
  pubkey: string,
  relays?: readonly string[],
): string {
  return nip19.nprofileEncode({
    pubkey,
    relays: relays ? [...relays] : undefined,
  });
}

export function findPresetByUrl(
  urlPrefix: string,
): NostrViewerPreset | undefined {
  return NOSTR_VIEWER_PRESETS.find((p) => p.urlPrefix === urlPrefix);
}
