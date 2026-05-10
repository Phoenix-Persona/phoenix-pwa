import { NSecSigner } from "@nostrify/nostrify";
import type { NostrSigner } from "@nostrify/types";
import { hexToBytes } from "@noble/hashes/utils.js";

import { decodePersonaNsec } from "@/lib/personaKey";

/**
 * Build a Nostr signer for persona-owned operations.
 *
 * Use this for persona media uploads and public persona events. Do not use the
 * operator signer for persona-owned Blossom auth, because Blossom kind 24242
 * auth events expose the signer pubkey to the upload server.
 */
export function createPersonaSigner(personaNsec: string): NostrSigner {
  const keypair = decodePersonaNsec(personaNsec);
  return new NSecSigner(hexToBytes(keypair.hex.sk));
}
