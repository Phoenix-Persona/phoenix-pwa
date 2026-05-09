/**
 * NIP-44 encryption helpers for Phoenix persona payloads.
 *
 * The user self-encrypts: the recipient pubkey is the user's own
 * pubkey, so only the user's signer can decrypt.
 *
 * The plaintext is the Phoenix envelope (app discriminator + persona
 * config + wallet + model prefs + settings). The discriminator lives
 * inside the ciphertext so the encrypted event tag layout doesn't
 * reveal Phoenix usage.
 */

import {
  PHOENIX_PAYLOAD_APP,
  PHOENIX_PAYLOAD_VERSION,
  parsePhoenixEnvelope,
  type Persona,
  type PersonaModelPrefs,
  type PersonaSettings,
  type PersonaWallet,
  type PhoenixEnvelope,
} from "./persona";

export interface Nip44Signer {
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
}

/**
 * Encrypt a Phoenix envelope (user → user self-encryption).
 */
export async function encryptPhoenixEnvelope(
  args: {
    persona: Persona;
    wallet?: PersonaWallet;
    model_prefs?: PersonaModelPrefs;
    settings?: PersonaSettings;
  },
  userPubkey: string,
  signer: Nip44Signer
): Promise<string> {
  const envelope: PhoenixEnvelope = {
    app: PHOENIX_PAYLOAD_APP,
    version: PHOENIX_PAYLOAD_VERSION,
    persona: {
      ...args.persona,
      pubkey: args.persona.pubkey.toLowerCase(),
    },
    wallet: args.wallet,
    model_prefs: args.model_prefs,
    settings: args.settings,
  };
  return await signer.nip44.encrypt(userPubkey, JSON.stringify(envelope));
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
  userPubkey: string,
  signer: Nip44Signer
): Promise<PhoenixEnvelope | null> {
  let plaintext: string;
  try {
    plaintext = await signer.nip44.decrypt(userPubkey, ciphertext);
  } catch {
    return null;
  }
  return parsePhoenixEnvelope(plaintext);
}
