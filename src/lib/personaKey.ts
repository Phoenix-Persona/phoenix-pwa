/**
 * Persona key utilities.
 *
 * Each persona has its own Nostr keypair. The nsec is stored *inside* the
 * encrypted persona event (NIP-44'd to the operator), so the operator can
 * recover and operate the persona from any device they sign in on. We do
 * NOT persist persona nsecs in localStorage — that would be both redundant
 * and a leak surface.
 */

import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { NostrEvent } from "@nostrify/nostrify";

export interface PersonaKeypair {
  nsec: string;
  npub: string;
  hex: {
    sk: string;
    pk: string;
  };
}

function fromSecretKeyBytes(sk: Uint8Array): PersonaKeypair {
  const pkHex = getPublicKey(sk);
  const skHex = bytesToHex(sk);
  const nsec = nip19.nsecEncode(sk);
  const npub = nip19.npubEncode(pkHex);
  return { nsec, npub, hex: { sk: skHex, pk: pkHex } };
}

export function generatePersonaKeypair(): PersonaKeypair {
  return fromSecretKeyBytes(generateSecretKey());
}

export function decodePersonaNsec(nsec: string): PersonaKeypair {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== "nsec") {
    throw new Error("Provided value is not an nsec");
  }
  return fromSecretKeyBytes(decoded.data);
}

/**
 * Sign an unsigned event template with a persona keypair.
 */
export function signWithPersona(
  template: { kind: number; created_at: number; tags: string[][]; content: string },
  keypair: PersonaKeypair
): NostrEvent {
  const skBytes = hexToBytes(keypair.hex.sk);
  return finalizeEvent(template, skBytes) as NostrEvent;
}
