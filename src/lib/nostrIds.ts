import { nip19 } from "nostr-tools";

export function npubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    return decoded.type === "npub" ? decoded.data : null;
  } catch {
    return null;
  }
}
