/**
 * Shared helpers for the `tests/wallet/*.ts` integration scripts.
 *
 * These scripts run in plain Node and exercise live infrastructure (Breez
 * Spark + ppq.ai). The shared module owns:
 *
 *   - File paths for the persisted operator key, encrypted persona
 *     envelope, and reused ppq.ai account.
 *   - The Nip44Signer adapter built from a Nostr nsec (so the scripts can
 *     round-trip the kind 30078 envelope without a browser signer).
 *   - Loaders / writers for each persisted file (mode 0600, gitignored).
 *   - `loadPersonaOrFail()` for scripts that expect `bootstrap` to have
 *     already minted a persona.
 *   - Console formatters used by both scripts.
 *
 * No SDK calls happen in here — those stay in the per-script entry points.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

import { nip19, nip44 } from "nostr-tools";

import {
  encryptPhoenixEnvelope,
  tryDecryptPhoenixEnvelope,
  type Nip44Signer,
} from "../../src/lib/personaCrypto";
import type { PersonaConfig, PhoenixEnvelope } from "../../src/lib/persona";

/* ---------- Paths ---------- */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const OPERATOR_PATH = path.join(SCRIPT_DIR, ".operator.json");
export const PERSONA_PATH = path.join(SCRIPT_DIR, ".persona.json");
export const PPQ_ACCOUNT_PATH = path.join(
  SCRIPT_DIR,
  "..",
  "ai-services",
  ".account.json",
);

/* ---------- Operator ---------- */

export interface OperatorData {
  nsec: string;
  pubkey: string;
}

export async function loadOperator(): Promise<OperatorData | null> {
  try {
    const raw = await fs.readFile(OPERATOR_PATH, "utf8");
    const parsed = JSON.parse(raw) as OperatorData;
    if (parsed?.nsec && parsed?.pubkey) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function saveOperator(data: OperatorData): Promise<void> {
  await fs.writeFile(OPERATOR_PATH, JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

/**
 * Build a Nip44Signer from the operator's nsec, using `nostr-tools/nip44`
 * directly. Same shape as the browser signer would expose, so
 * `encryptPhoenixEnvelope` / `tryDecryptPhoenixEnvelope` work unchanged.
 */
export function buildSigner(operatorNsec: string): Nip44Signer {
  const decoded = nip19.decode(operatorNsec);
  if (decoded.type !== "nsec") throw new Error("operator nsec invalid");
  const privKey = decoded.data;
  return {
    nip44: {
      encrypt: async (peerPubkey, plaintext) => {
        const conv = nip44.getConversationKey(privKey, peerPubkey);
        return nip44.encrypt(plaintext, conv);
      },
      decrypt: async (peerPubkey, ciphertext) => {
        const conv = nip44.getConversationKey(privKey, peerPubkey);
        return nip44.decrypt(ciphertext, conv);
      },
    },
  };
}

/* ---------- Persona envelope (encrypted) ---------- */

export interface StoredPersona {
  /** Operator-encrypted PhoenixEnvelope (kind 30078 content). */
  ciphertext: string;
}

export async function loadStoredPersona(): Promise<StoredPersona | null> {
  try {
    const raw = await fs.readFile(PERSONA_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoredPersona;
    if (parsed?.ciphertext) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function saveStoredPersona(data: StoredPersona): Promise<void> {
  await fs.writeFile(PERSONA_PATH, JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

export async function encryptAndSavePersona(
  args: { personaPubkey: string; config: PersonaConfig },
  operator: OperatorData,
): Promise<void> {
  const signer = buildSigner(operator.nsec);
  const ciphertext = await encryptPhoenixEnvelope(args, operator.pubkey, signer);
  await saveStoredPersona({ ciphertext });
}

/**
 * Decrypt the persisted persona envelope; throws if missing or malformed.
 * Use from scripts that depend on `bootstrap-spark-wallet-e2e.ts` having
 * already run.
 */
export async function loadPersonaOrFail(
  operator: OperatorData,
): Promise<PhoenixEnvelope> {
  const stored = await loadStoredPersona();
  if (!stored) {
    throw new Error(
      "No persona envelope on disk. Run `npx tsx tests/wallet/bootstrap-spark-wallet-e2e.ts` first.",
    );
  }
  const signer = buildSigner(operator.nsec);
  const envelope = await tryDecryptPhoenixEnvelope(
    stored.ciphertext,
    operator.pubkey,
    signer,
  );
  if (!envelope) {
    throw new Error(
      "Persona envelope failed to decrypt. Operator key may have changed — re-run bootstrap-spark-wallet-e2e with --reset.",
    );
  }
  return envelope;
}

/* ---------- ppq.ai account (shared with tests/ai-services) ---------- */

export interface PpqAccountFile {
  credit_id: string;
  api_key: string;
}

export async function loadPpqAccount(): Promise<PpqAccountFile | null> {
  try {
    const raw = await fs.readFile(PPQ_ACCOUNT_PATH, "utf8");
    const parsed = JSON.parse(raw) as PpqAccountFile;
    if (parsed?.api_key && parsed?.credit_id) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function savePpqAccount(account: PpqAccountFile): Promise<void> {
  await fs.mkdir(path.dirname(PPQ_ACCOUNT_PATH), { recursive: true });
  await fs.writeFile(PPQ_ACCOUNT_PATH, JSON.stringify(account, null, 2), {
    mode: 0o600,
  });
}

/* ---------- Console + prompt helpers ---------- */

export function makeReadline() {
  return readline.createInterface({ input, output });
}

export type Rl = ReturnType<typeof makeReadline>;

export async function ask(rl: Rl, prompt: string, def?: string): Promise<string> {
  const decorated = def ? `${prompt} [${def}] ` : `${prompt} `;
  const ans = (await rl.question(decorated)).trim();
  return ans.length ? ans : (def ?? "");
}

export async function askYesNo(
  rl: Rl,
  prompt: string,
  def: "y" | "n" = "y",
): Promise<boolean> {
  const ans = (await ask(rl, `${prompt} (y/n)`, def)).toLowerCase();
  return ans === "y" || ans === "yes";
}

export function fmtSats(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "?";
  return `${n.toLocaleString("en-US")} sats`;
}

export function fmtMoney(usd: number | undefined | null): string {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "$?";
  return `$${usd.toFixed(4)}`;
}

export function header(title: string): void {
  console.log(`\n────── ${title} ──────`);
}

export const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));
