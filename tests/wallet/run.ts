/**
 * Manual end-to-end smoke test for the Phoenix wallet primitives.
 *
 * Walks every goal of the headless wallet branch:
 *   1. Generate (or reuse) a BIP-39 mnemonic for a Spark wallet.
 *   2. Round-trip the mnemonic through the SAME NIP-44 encrypted envelope
 *      we use for kind 30078 — proving the seed lives next to `personaNsec`
 *      inside the encrypted persona payload.
 *   3. Connect the wallet via the Breez Spark SDK; print balance + LN address.
 *   4. Receive: generate a BOLT11 invoice and wait for the user to pay it.
 *   5. Send: ensure a ppq.ai account, then run `runAutoTopupOnce` to top
 *      up the ppq credit balance to $5 — paying the resulting BOLT11 from
 *      the Spark wallet. Validates the default-on auto-topup policy.
 *
 * Run:
 *   VITE_BREEZ_API_KEY=... npx tsx tests/wallet/run.ts
 *
 * Persisted state (gitignored, mode 0600):
 *   tests/wallet/.persona.json   — encrypted PhoenixEnvelope (operator self-encrypted)
 *   tests/wallet/.operator.json  — operator nsec used to (de)crypt the envelope
 *
 * Flags:
 *   --reset                  Wipe persona + operator on startup
 *   --skip-receive           Don't wait for an inbound BOLT11 payment
 *   --topup-target <usd>     Override auto-topup target (default 5)
 *   --topup-threshold <usd>  Override threshold (default 1)
 *   --register-address       Register a Lightning Address if none exists
 */

// Load dev/.env into process.env BEFORE any module that reads env vars.
import "../_shared/loadEnv";

import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

import {
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { nip19, nip44 } from "nostr-tools";

import { runAutoTopupOnce } from "../../src/lib/wallet/autoTopup";
import {
  connectWallet,
  disconnectWallet,
  generateMnemonic,
  loadWalletInfo,
  receiveBolt11,
  registerLightningAddress,
} from "../../src/lib/wallet/client";
import type { AutoTopupConfig } from "../../src/lib/wallet/types";
import {
  encryptPhoenixEnvelope,
  tryDecryptPhoenixEnvelope,
  type Nip44Signer,
} from "../../src/lib/personaCrypto";
import type { PersonaConfig } from "../../src/lib/persona";
import {
  createAccount as createPpqAccount,
  getBalance as getPpqBalance,
} from "../../src/lib/ppq/client";

/* ---------- arg parsing ---------- */

const argv = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

const flags = {
  reset: argv.includes("--reset"),
  skipReceive: argv.includes("--skip-receive"),
  registerAddress: argv.includes("--register-address"),
  topupTarget: Number(flagValue("topup-target") ?? "5"),
  topupThreshold: Number(flagValue("topup-threshold") ?? "1"),
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPERATOR_PATH = path.join(SCRIPT_DIR, ".operator.json");
const PERSONA_PATH = path.join(SCRIPT_DIR, ".persona.json");
const PPQ_PATH = path.join(SCRIPT_DIR, "..", "ai-services", ".account.json");

const rl = readline.createInterface({ input, output });

async function ask(prompt: string, def?: string): Promise<string> {
  const decorated = def ? `${prompt} [${def}] ` : `${prompt} `;
  const ans = (await rl.question(decorated)).trim();
  return ans.length ? ans : (def ?? "");
}

async function askYesNo(prompt: string, def: "y" | "n" = "y"): Promise<boolean> {
  const ans = (await ask(`${prompt} (y/n)`, def)).toLowerCase();
  return ans === "y" || ans === "yes";
}

function fmtSats(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "?";
  return `${n.toLocaleString("en-US")} sats`;
}

function fmtMoney(usd: number | undefined | null): string {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "$?";
  return `$${usd.toFixed(4)}`;
}

function header(title: string): void {
  console.log(`\n────── ${title} ──────`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- operator + signer ---------- */

interface OperatorData {
  nsec: string;
  pubkey: string;
}

async function loadOperator(): Promise<OperatorData | null> {
  try {
    const raw = await fs.readFile(OPERATOR_PATH, "utf8");
    const parsed = JSON.parse(raw) as OperatorData;
    if (parsed?.nsec && parsed?.pubkey) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function saveOperator(data: OperatorData): Promise<void> {
  await fs.writeFile(OPERATOR_PATH, JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

/**
 * Build a Phoenix-compatible Nip44Signer using the operator's nsec.
 * Mirrors what a real signer (NIP-07 / NIP-46) would expose, against
 * `nostr-tools/nip44` so we can exercise the full envelope round-trip
 * in Node.
 */
function buildSigner(operatorNsec: string): Nip44Signer {
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

/* ---------- persona envelope (encrypted) ---------- */

interface StoredPersona {
  /** Operator-encrypted PhoenixEnvelope (kind 30078 content). */
  ciphertext: string;
}

async function loadStoredPersona(): Promise<StoredPersona | null> {
  try {
    const raw = await fs.readFile(PERSONA_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoredPersona;
    if (parsed?.ciphertext) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function saveStoredPersona(data: StoredPersona): Promise<void> {
  await fs.writeFile(PERSONA_PATH, JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

/* ---------- bootstrap ---------- */

async function ensureOperator(): Promise<OperatorData> {
  if (flags.reset) {
    await fs.rm(OPERATOR_PATH, { force: true });
    await fs.rm(PERSONA_PATH, { force: true });
    console.log("Reset: cleared persisted operator + persona.");
  }

  const existing = await loadOperator();
  if (existing) {
    console.log("Reusing persisted operator key.");
    console.log(`  npub: ${nip19.npubEncode(existing.pubkey)}`);
    return existing;
  }

  console.log("No operator key yet — generating one for the test.");
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);
  const pubkey = getPublicKey(sk);
  const data: OperatorData = { nsec, pubkey };
  await saveOperator(data);
  console.log(`  npub: ${nip19.npubEncode(pubkey)}`);
  return data;
}

/**
 * Ensure a persona envelope exists with a wallet mnemonic embedded. If
 * one is on disk, decrypt it (proving the round-trip works) and return
 * the wallet seed. Otherwise mint a new persona + mnemonic, encrypt, and
 * persist.
 *
 * This is the literal test for goal #3: the wallet seed lives inside
 * the same NIP-44 envelope as `personaNsec`.
 */
async function ensurePersona(
  operator: OperatorData,
): Promise<{ mnemonic: string; personaPubkey: string }> {
  const signer = buildSigner(operator.nsec);

  const existing = await loadStoredPersona();
  if (existing) {
    const envelope = await tryDecryptPhoenixEnvelope(
      existing.ciphertext,
      operator.pubkey,
      signer,
    );
    if (!envelope) {
      throw new Error(
        "Persona envelope on disk failed to decrypt or validate — delete .persona.json and re-run.",
      );
    }
    if (!envelope.config.wallet?.mnemonic) {
      throw new Error(
        "Persona envelope has no wallet mnemonic. Re-run with --reset.",
      );
    }
    console.log("Decrypted persona envelope from disk.");
    console.log(`  persona npub: ${nip19.npubEncode(envelope.personaPubkey)}`);
    console.log(
      `  mnemonic words: ${envelope.config.wallet.mnemonic.split(/\s+/).length} (hidden)`,
    );
    return {
      mnemonic: envelope.config.wallet.mnemonic,
      personaPubkey: envelope.personaPubkey,
    };
  }

  console.log("No persona envelope yet — minting a fresh one.");
  const personaSk = generateSecretKey();
  const personaPubkey = getPublicKey(personaSk);
  const personaNsec = nip19.nsecEncode(personaSk);
  const mnemonic = await generateMnemonic();

  const config: PersonaConfig = {
    name: "Headless Wallet Test",
    region: "TEST",
    cause: "test",
    languages: ["en"],
    tone: "test",
    frequencySec: 0,
    sources: [],
    focus: [],
    model: "anthropic/claude-sonnet-4.5",
    systemPrompt: "test",
    personality: "test",
    bio: "test",
    personaNsec,
    wallet: {
      kind: "spark",
      mnemonic,
      autoTopup: {
        enabled: true,
        thresholdUsd: flags.topupThreshold,
        targetUsd: flags.topupTarget,
      },
    },
  };

  const ciphertext = await encryptPhoenixEnvelope(
    { personaPubkey, config },
    operator.pubkey,
    signer,
  );
  await saveStoredPersona({ ciphertext });

  console.log("Persisted encrypted PhoenixEnvelope to .persona.json");
  console.log(`  persona npub: ${nip19.npubEncode(personaPubkey)}`);
  console.log(`  mnemonic words: ${mnemonic.split(/\s+/).length} (hidden)`);
  return { mnemonic, personaPubkey };
}

/* ---------- ppq.ai account ---------- */

interface PpqAccountFile {
  credit_id: string;
  api_key: string;
}

async function loadPpqAccount(): Promise<PpqAccountFile | null> {
  try {
    const raw = await fs.readFile(PPQ_PATH, "utf8");
    const parsed = JSON.parse(raw) as PpqAccountFile;
    if (parsed?.api_key && parsed?.credit_id) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function savePpqAccount(account: PpqAccountFile): Promise<void> {
  await fs.mkdir(path.dirname(PPQ_PATH), { recursive: true });
  await fs.writeFile(PPQ_PATH, JSON.stringify(account, null, 2), {
    mode: 0o600,
  });
}

async function ensurePpqAccount(): Promise<PpqAccountFile> {
  const existing = await loadPpqAccount();
  if (existing) {
    console.log("Reusing ppq.ai account from tests/ai-services/.account.json");
    return existing;
  }
  console.log("Creating fresh ppq.ai account…");
  const fresh = await createPpqAccount();
  await savePpqAccount(fresh);
  return fresh;
}

/* ---------- wallet steps ---------- */

interface WalletState {
  handle: Awaited<ReturnType<typeof connectWallet>>;
  balanceSats: number;
  lightningAddress?: string;
}

async function connectAndPrintInfo(
  mnemonic: string,
  personaPubkey: string,
): Promise<WalletState> {
  console.log("Connecting Spark wallet (this can take a few seconds)…");
  const handle = await connectWallet({ mnemonic });
  let info = await loadWalletInfo(handle);
  console.log(`  identity:        ${info.raw.identityPubkey}`);
  console.log(`  balance:         ${fmtSats(info.balanceSats)}`);
  console.log(
    `  lightningAddr:   ${info.lightningAddress ?? "(none yet)"}`,
  );

  if (!info.lightningAddress && flags.registerAddress) {
    const username = `phoenix-${personaPubkey.slice(0, 12)}`;
    console.log(`  Registering Lightning Address: ${username}@…`);
    try {
      await registerLightningAddress(
        handle,
        username,
        "Phoenix headless wallet test",
      );
      info = await loadWalletInfo(handle);
      console.log(`  registered →     ${info.lightningAddress ?? "(failed)"}`);
    } catch (err) {
      console.warn(
        `  registerLightningAddress failed: ${(err as Error).message}`,
      );
    }
  }

  return {
    handle,
    balanceSats: info.balanceSats,
    lightningAddress: info.lightningAddress,
  };
}

async function receiveStep(state: WalletState): Promise<void> {
  if (flags.skipReceive) {
    console.log("Skipping receive (--skip-receive).");
    return;
  }
  if (!(await askYesNo("Generate a BOLT11 invoice to fund the wallet?"))) {
    return;
  }
  const amountStr = await ask("Receive amount (sats)?", "5000");
  const amountSats = Number(amountStr);
  if (!Number.isFinite(amountSats) || amountSats <= 0) {
    console.warn("Invalid amount, skipping.");
    return;
  }

  const description = await ask("Memo?", "Phoenix wallet test");
  const inv = await receiveBolt11(state.handle, {
    amountSats,
    description,
  });
  console.log("\nPay this BOLT11 with any Lightning wallet:\n");
  console.log(inv.paymentRequest);
  console.log("");
  console.log(`(receive fee: ${fmtSats(inv.feeSats)})`);
  console.log("Polling balance every 4s. Ctrl+C to abort.\n");

  const startBalance = state.balanceSats;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(4_000);
    const info = await loadWalletInfo(state.handle);
    if (info.balanceSats > startBalance) {
      const delta = info.balanceSats - startBalance;
      console.log(
        `  balance moved: ${fmtSats(startBalance)} → ${fmtSats(info.balanceSats)} (+${fmtSats(delta)})`,
      );
      state.balanceSats = info.balanceSats;
      return;
    }
  }
  console.warn("Polling timed out (10min). Continuing anyway.");
}

async function autoTopupStep(state: WalletState): Promise<void> {
  if (!(await askYesNo("Run a default-on auto-topup pass against ppq.ai?"))) {
    return;
  }
  const ppq = await ensurePpqAccount();
  const balance = await getPpqBalance(ppq.credit_id);
  console.log(`  ppq balance:     ${fmtMoney(balance.balance_usd)}`);

  const cfg: AutoTopupConfig = {
    enabled: true,
    thresholdUsd: flags.topupThreshold,
    targetUsd: flags.topupTarget,
  };
  console.log(
    `  policy:          enabled=${cfg.enabled} threshold=${fmtMoney(cfg.thresholdUsd)} target=${fmtMoney(cfg.targetUsd)}`,
  );

  if (
    typeof balance.balance_usd === "number" &&
    balance.balance_usd >= cfg.thresholdUsd
  ) {
    console.log(
      `  ppq balance is already ≥ ${fmtMoney(cfg.thresholdUsd)} — runAutoTopupOnce will return null.`,
    );
  }

  const result = await runAutoTopupOnce({
    wallet: state.handle,
    ppqApiKey: ppq.api_key,
    ppqBalanceUsd: balance.balance_usd,
    config: cfg,
  });

  if (!result) {
    console.log("  no action taken (balance ≥ threshold or disabled).");
    return;
  }
  console.log(`  topped up ${fmtMoney(result.toppedUpUsd)} via invoice ${result.invoiceId}`);
  console.log(`  status:          ${result.status}`);

  const after = await getPpqBalance(ppq.credit_id);
  console.log(`  ppq balance now: ${fmtMoney(after.balance_usd)}`);

  const walletInfo = await loadWalletInfo(state.handle);
  console.log(`  spark balance:   ${fmtSats(walletInfo.balanceSats)}`);
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  console.log("Phoenix wallet integration smoke test");
  if (!process.env.VITE_BREEZ_API_KEY) {
    // The shared loader pulls dev/.env into process.env before this point;
    // if the value is still missing the file is absent or doesn't contain
    // the key.
    console.warn(
      "VITE_BREEZ_API_KEY not found — add it to dev/.env or export it in the shell.",
    );
  }

  let handle: Awaited<ReturnType<typeof connectWallet>> | undefined;
  try {
    header("1. Operator key");
    const operator = await ensureOperator();

    header("2. Encrypted persona envelope (kind 30078 round-trip)");
    const { mnemonic, personaPubkey } = await ensurePersona(operator);

    header("3. Connect Spark wallet");
    const state = await connectAndPrintInfo(mnemonic, personaPubkey);
    handle = state.handle;

    header("4. Receive (manual pay)");
    await receiveStep(state);

    header("5. Default-on auto-topup → ppq.ai");
    await autoTopupStep(state);

    header("Done");
  } finally {
    rl.close();
    if (handle) {
      try {
        await disconnectWallet(handle);
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exitCode = 1;
});
