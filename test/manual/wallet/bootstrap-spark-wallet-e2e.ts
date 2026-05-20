/**
 * Bootstrap a fresh Zuka wallet end-to-end.
 *
 * Walks every goal of the headless wallet branch:
 *
 *   1. Generate (or reuse) an operator Nostr nsec.
 *   2. Mint a fresh BIP-39 mnemonic + persona keypair, encrypt them into a
 *      kind-30078-shaped `PhoenixEnvelope`, and round-trip the envelope
 *      through `nostr-tools/nip44` — proving the seed lives next to
 *      `personaNsec` inside the encrypted persona payload.
 *   3. Connect the wallet via the Breez Spark SDK; print balance and the
 *      Lightning Address (register one with `--register-address`).
 *   4. Receive: generate a BOLT11 invoice and poll for inbound payment.
 *   5. Run a single `runAutoTopupOnce` pass against ppq.ai to validate the
 *      default-on auto-topup wiring end-to-end.
 *
 * After a successful run, `test/manual/wallet/test-auto-topup-and-inference.ts`
 * can pick up the persisted persona + wallet without minting fresh state.
 *
 * Run:
 *   npx tsx test/manual/wallet/bootstrap-spark-wallet-e2e.ts
 *
 * Loads `.env` automatically; just put your `VITE_BREEZ_API_KEY` there.
 *
 * Persisted state (gitignored, mode 0600):
 *   test/manual/wallet/.operator.json   — operator nsec used to (de)crypt the envelope
 *   test/manual/wallet/.persona.json    — encrypted PhoenixEnvelope (kind-30078 ciphertext)
 *
 * Flags:
 *   --reset                   Wipe persona + operator on startup
 *   --skip-receive            Don't wait for an inbound BOLT11 payment
 *   --topup-target <usd>      Override auto-topup target (default 5)
 *   --topup-threshold <usd>   Override threshold (default 5 — top up to $5
 *                             whenever balance falls below $5)
 *   --register-address        Register a Lightning Address if none exists
 */

import "../_shared/loadEnv";

import { promises as fs } from "node:fs";

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";

import { runAutoTopupOnce } from "../../src/lib/wallet/autoTopup";
import {
  connectWallet,
  disconnectWallet,
  generateMnemonic,
  loadWalletInfo,
  receiveBolt11,
  registerLightningAddress,
  type WalletHandle,
} from "../../src/lib/wallet/client";
import type { AutoTopupConfig } from "../../src/lib/wallet/types";
import type { Persona, PersonaWallet } from "../../src/lib/persona";
import {
  createAccount as createPpqAccount,
  getBalance as getPpqBalance,
} from "../../src/lib/ppq/client";

import {
  OPERATOR_PATH,
  PERSONA_PATH,
  ask,
  askYesNo,
  encryptAndSavePersona,
  fmtMoney,
  fmtSats,
  header,
  loadOperator,
  loadPersonaOrFail,
  loadPpqAccount,
  loadStoredPersona,
  makeReadline,
  saveOperator,
  savePpqAccount,
  sleep,
  type OperatorData,
  type PpqAccountFile,
} from "./_shared";

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
  // Default policy: if ppq balance drops below $5, top it back up to $5.
  topupTarget: Number(flagValue("topup-target") ?? "5"),
  topupThreshold: Number(flagValue("topup-threshold") ?? "5"),
};

const rl = makeReadline();

/* ---------- bootstrap steps ---------- */

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
  const data: OperatorData = {
    nsec: nip19.nsecEncode(sk),
    pubkey: getPublicKey(sk),
  };
  await saveOperator(data);
  console.log(`  npub: ${nip19.npubEncode(data.pubkey)}`);
  return data;
}

async function ensurePersona(
  operator: OperatorData,
): Promise<{ mnemonic: string; personaPubkey: string }> {
  if (await loadStoredPersona()) {
    const envelope = await loadPersonaOrFail(operator);
    if (!envelope.wallet?.seed) {
      throw new Error(
        "Persona envelope has no wallet seed. Re-run with --reset.",
      );
    }
    console.log("Decrypted persona envelope from disk.");
    console.log(`  persona npub: ${nip19.npubEncode(envelope.persona.pubkey)}`);
    console.log(
      `  mnemonic words: ${envelope.wallet.seed.split(/\s+/).length} (hidden)`,
    );
    return {
      mnemonic: envelope.wallet.seed,
      personaPubkey: envelope.persona.pubkey,
    };
  }

  console.log("No persona envelope yet — minting a fresh one.");
  const personaSk = generateSecretKey();
  const personaPubkey = getPublicKey(personaSk);
  const personaNsec = nip19.nsecEncode(personaSk);
  const mnemonic = await generateMnemonic();

  const persona: Persona = {
    pubkey: personaPubkey,
    nsec: personaNsec,
    name: "Headless Wallet Test",
    system_prompt: "test",
    voice_id: "thalia",
    languages: ["en"],
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    region: "TEST",
    cause: "test",
    bio: "test",
    tone: "test",
    sources: [],
  };

  const wallet: PersonaWallet = {
    kind: "spark",
    seed: mnemonic,
    auto_topup: {
      enabled: true,
      threshold_usd: flags.topupThreshold,
      target_usd: flags.topupTarget,
    },
  };

  await encryptAndSavePersona({ persona, wallet }, operator);
  console.log("Persisted encrypted PhoenixEnvelope to .persona.json");
  console.log(`  persona npub: ${nip19.npubEncode(personaPubkey)}`);
  console.log(`  mnemonic words: ${mnemonic.split(/\s+/).length} (hidden)`);
  return { mnemonic, personaPubkey };
}

interface WalletState {
  handle: WalletHandle;
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
  console.log(`  lightningAddr:   ${info.lightningAddress ?? "(none yet)"}`);

  if (!info.lightningAddress && flags.registerAddress) {
    const username = `phoenix-${personaPubkey.slice(0, 12)}`;
    console.log(`  Registering Lightning Address: ${username}@…`);
    try {
      await registerLightningAddress(
        handle,
        username,
        "Zuka headless wallet test",
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
  if (!(await askYesNo(rl, "Generate a BOLT11 invoice to fund the wallet?"))) {
    return;
  }
  const amountStr = await ask(rl, "Receive amount (sats)?", "5000");
  const amountSats = Number(amountStr);
  if (!Number.isFinite(amountSats) || amountSats <= 0) {
    console.warn("Invalid amount, skipping.");
    return;
  }

  const description = await ask(rl, "Memo?", "Zuka wallet test");
  const inv = await receiveBolt11(state.handle, { amountSats, description });
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

async function ensurePpqAccount(): Promise<PpqAccountFile> {
  const existing = await loadPpqAccount();
  if (existing) {
    console.log("Reusing ppq.ai account from test/manual/ai-services/.account.json");
    return existing;
  }
  console.log("Creating fresh ppq.ai account…");
  const fresh = await createPpqAccount();
  await savePpqAccount(fresh);
  return fresh;
}

async function autoTopupStep(state: WalletState): Promise<void> {
  if (!(await askYesNo(rl, "Run a default-on auto-topup pass against ppq.ai?"))) {
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
      `  ppq balance already ≥ ${fmtMoney(cfg.thresholdUsd)} — runAutoTopupOnce will return null.`,
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
  console.log(
    `  topped up ${fmtMoney(result.toppedUpUsd)} via invoice ${result.invoiceId}`,
  );
  console.log(`  status:          ${result.status}`);

  const after = await getPpqBalance(ppq.credit_id);
  console.log(`  ppq balance now: ${fmtMoney(after.balance_usd)}`);

  const walletInfo = await loadWalletInfo(state.handle);
  console.log(`  spark balance:   ${fmtSats(walletInfo.balanceSats)}`);
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  console.log("Zuka wallet bootstrap (full smoke walk)");
  if (!process.env.VITE_BREEZ_API_KEY) {
    console.warn(
      "VITE_BREEZ_API_KEY not found — add it to .env or export it in the shell.",
    );
  }

  let handle: WalletHandle | undefined;
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
