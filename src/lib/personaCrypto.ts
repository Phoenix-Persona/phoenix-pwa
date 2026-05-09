/**
 * NIP-44 encryption helpers for Phoenix persona configs.
 *
 * The operator self-encrypts: the recipient pubkey is the operator's own
 * pubkey, so only the operator's signer can decrypt.
 *
 * Works with any Nostrify signer (NIP-07 extension, NIP-46 bunker, NSec).
 */

import type { PersonaConfig } from "./persona";

export interface Nip44Signer {
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
}

/**
 * Encrypt a PersonaConfig with the operator's signer (to themselves).
 */
export async function encryptPersonaConfig(
  config: PersonaConfig,
  operatorPubkey: string,
  signer: Nip44Signer
): Promise<string> {
  const plaintext = JSON.stringify(config);
  return await signer.nip44.encrypt(operatorPubkey, plaintext);
}

/**
 * Decrypt a persona event's content into a PersonaConfig.
 * `ciphertext` is the event.content produced by encryptPersonaConfig.
 * `operatorPubkey` is the event.pubkey (the operator who authored the event).
 */
export async function decryptPersonaConfig(
  ciphertext: string,
  operatorPubkey: string,
  signer: Nip44Signer
): Promise<PersonaConfig> {
  const plaintext = await signer.nip44.decrypt(operatorPubkey, ciphertext);
  const parsed = JSON.parse(plaintext) as PersonaConfig;
  // Light validation
  if (!parsed.name || !parsed.region || !parsed.personaNsec) {
    throw new Error("Decrypted persona payload is malformed");
  }
  return parsed;
}
