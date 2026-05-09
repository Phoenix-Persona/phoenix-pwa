/**
 * NIP-44 encryption helpers for Phoenix persona payloads.
 *
 * The operator self-encrypts: the recipient pubkey is the operator's own
 * pubkey, so only the operator's signer can decrypt.
 *
 * The plaintext is the Phoenix envelope (app discriminator + persona
 * pubkey + persona config). The discriminator lives inside the ciphertext
 * so the encrypted event tag layout doesn't reveal Phoenix usage.
 */

import {
  PHOENIX_PAYLOAD_APP,
  PHOENIX_PAYLOAD_VERSION,
  parsePhoenixEnvelope,
  type PersonaConfig,
  type PhoenixEnvelope,
} from "./persona";

export interface Nip44Signer {
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
}

/**
 * Encrypt a Phoenix envelope (operator → operator self-encryption).
 */
export async function encryptPhoenixEnvelope(
  args: {
    personaPubkey: string;
    config: PersonaConfig;
  },
  operatorPubkey: string,
  signer: Nip44Signer
): Promise<string> {
  const envelope: PhoenixEnvelope = {
    app: PHOENIX_PAYLOAD_APP,
    version: PHOENIX_PAYLOAD_VERSION,
    personaPubkey: args.personaPubkey.toLowerCase(),
    config: args.config,
  };
  return await signer.nip44.encrypt(operatorPubkey, JSON.stringify(envelope));
}

/**
 * Try to decrypt an event's content as a Phoenix envelope. Returns null
 * if the ciphertext can't be decrypted (different recipient) OR if the
 * decrypted content isn't a Phoenix payload (some other app).
 *
 * Throws ONLY for unexpected errors. NIP-44 decryption failures resolve
 * to null so the scan-and-decrypt loop can move on.
 */
export async function tryDecryptPhoenixEnvelope(
  ciphertext: string,
  operatorPubkey: string,
  signer: Nip44Signer
): Promise<PhoenixEnvelope | null> {
  let plaintext: string;
  try {
    plaintext = await signer.nip44.decrypt(operatorPubkey, ciphertext);
  } catch {
    return null;
  }
  return parsePhoenixEnvelope(plaintext);
}
