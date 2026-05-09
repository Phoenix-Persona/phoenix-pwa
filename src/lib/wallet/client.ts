/**
 * Headless Phoenix wallet — pure async functions over the Breez Spark SDK.
 *
 * No React, no module-level state. Every function receives the wallet
 * handle (or the args needed to mint one) explicitly so the same calls
 * work from the React hook layer, from the Node integration test, and
 * from a future agent / cron worker.
 *
 * The SDK's type names are passed through verbatim where they're stable
 * (`BreezSdk`, `GetInfoResponse`, `Payment`); Phoenix-flavoured wrappers
 * live in `./types.ts` and hide the two-step `prepare → send` pattern.
 */

import {
  connect,
  defaultConfig,
  type Config,
  type LightningAddressInfo,
  type Network,
} from "@breeztech/breez-sdk-spark";

import { readEnv } from "@/lib/env";
import { ensureWalletReady } from "./init";
import {
  WalletError,
  type Payment,
  type ReceiveBolt11Args,
  type ReceiveBolt11Result,
  type SdkEvent,
  type SendBolt11Args,
  type SendResult,
  type WalletConnectOptions,
  type WalletHandle,
  type WalletInfo,
} from "./types";

/** IndexedDB / filesystem key the SDK uses for its persistent state. */
const DEFAULT_STORAGE_DIR = "phoenix-wallet";

/* ---------- Helpers ---------- */

function readEnvApiKey(): string | undefined {
  return readEnv("VITE_BREEZ_API_KEY");
}

function buildConfig(
  network: Network,
  apiKey: string,
): Config {
  const config = defaultConfig(network);
  config.apiKey = apiKey;
  return config;
}

/**
 * The Breez Spark `LnurlInfo.lnurl` field is the static LNURL-pay string.
 * Returns undefined if the SDK didn't populate it (e.g. no Lightning
 * Address registered yet).
 */
function extractLnurlPay(info: LightningAddressInfo | undefined): string | undefined {
  const lnurl = info?.lnurl as unknown;
  if (lnurl && typeof lnurl === "object") {
    const value = (lnurl as Record<string, unknown>).lnurl;
    if (typeof value === "string" && value.toLowerCase().startsWith("lnurl")) {
      return value;
    }
  }
  return undefined;
}

/* ---------- Connect / disconnect ---------- */

/**
 * Boot the SDK and connect to the user's wallet via mnemonic. Idempotent
 * with respect to the WASM init step; safe to call multiple times.
 */
export async function connectWallet(
  opts: WalletConnectOptions,
): Promise<WalletHandle> {
  await ensureWalletReady();

  const apiKey = opts.apiKey ?? readEnvApiKey();
  if (!apiKey) {
    throw new WalletError(
      "Missing Breez API key. Set VITE_BREEZ_API_KEY or pass `apiKey` to connectWallet().",
    );
  }
  const config = buildConfig(opts.network ?? "mainnet", apiKey);

  // The SDK's `Seed` type is a tagged union; the mnemonic variant is what
  // we always use — Phoenix never receives raw entropy.
  const seed = {
    type: "mnemonic" as const,
    mnemonic: opts.mnemonic,
    passphrase: opts.passphrase,
  };

  try {
    return await connect({ config, seed, storageDir: DEFAULT_STORAGE_DIR });
  } catch (err) {
    throw new WalletError("Spark SDK connect() failed", err);
  }
}

/** Close the SDK session. */
export async function disconnectWallet(handle: WalletHandle): Promise<void> {
  await handle.disconnect();
}

/* ---------- Wallet info / balance ---------- */

/**
 * Snapshot the wallet — balance, identity pubkey, and (if registered) the
 * persona's Lightning Address + static LNURL-pay string.
 *
 * The Lightning Address lookup is best-effort: if the SDK has none assigned
 * yet, `lightningAddress` and `lnurlPay` come back undefined. Use
 * `registerLightningAddress()` to mint one at persona creation time.
 */
export async function loadWalletInfo(
  handle: WalletHandle,
): Promise<WalletInfo> {
  const [raw, addressInfo] = await Promise.all([
    handle.getInfo({}),
    handle.getLightningAddress().catch(() => undefined),
  ]);
  return {
    balanceSats: raw.balanceSats,
    lightningAddress: addressInfo?.lightningAddress,
    lnurlPay: extractLnurlPay(addressInfo),
    raw,
  };
}

/**
 * Register a Lightning Address for this wallet — `<username>@<spark-domain>`.
 * Idempotent at the SDK level: if the wallet already has one, the SDK
 * returns the existing address rather than minting a duplicate.
 *
 * Call once at persona creation; the result is cached inside the encrypted
 * persona payload so subsequent boots can render the address without a
 * round-trip.
 */
export async function registerLightningAddress(
  handle: WalletHandle,
  username: string,
  description?: string,
): Promise<LightningAddressInfo> {
  return handle.registerLightningAddress({
    username,
    ...(description !== undefined ? { description } : {}),
  });
}

/* ---------- Receive ---------- */

export async function receiveBolt11(
  handle: WalletHandle,
  args: ReceiveBolt11Args = {},
): Promise<ReceiveBolt11Result> {
  // The SDK's request typing has churned across releases; use a permissive
  // object literal that covers the documented shape.
  const req = {
    paymentMethod: {
      type: "bolt11Invoice",
      description: args.description ?? "",
      ...(args.amountSats !== undefined ? { amountSats: args.amountSats } : {}),
      ...(args.expirySecs !== undefined ? { expirySecs: args.expirySecs } : {}),
    },
  } as Parameters<WalletHandle["receivePayment"]>[0];

  const res = await handle.receivePayment(req);
  return {
    paymentRequest: res.paymentRequest,
    // SDK returns fee as bigint; convert for ergonomic JS use.
    feeSats: Number(res.fee),
    raw: res,
  };
}

/* ---------- Send ---------- */

export async function sendBolt11(
  handle: WalletHandle,
  args: SendBolt11Args,
): Promise<SendResult> {
  const prepareReq = {
    paymentRequest: args.paymentRequest,
    ...(args.amountSats !== undefined ? { amount: args.amountSats } : {}),
  } as Parameters<WalletHandle["prepareSendPayment"]>[0];

  const prepareResponse = await handle.prepareSendPayment(prepareReq);

  const sendReq = {
    prepareResponse,
    options: {
      type: "bolt11Invoice",
      preferSpark: args.preferSpark ?? false,
      completionTimeoutSecs: args.completionTimeoutSecs ?? 30,
    },
    ...(args.idempotencyKey !== undefined
      ? { idempotencyKey: args.idempotencyKey }
      : {}),
  } as Parameters<WalletHandle["sendPayment"]>[0];

  const raw = await handle.sendPayment(sendReq);
  return { raw };
}

/* ---------- Payments / history ---------- */

export async function listRecentPayments(
  handle: WalletHandle,
  limit = 50,
): Promise<Payment[]> {
  const res = await handle.listPayments({ offset: 0, limit });
  return res.payments;
}

/* ---------- Events ---------- */

/**
 * Subscribe to SDK events. Returns an unsubscribe function. The Spark
 * SDK's `addEventListener` shape varies — we accept any of the common
 * return values: a string id (call `removeEventListener(id)`), an object
 * with an `id`, or a function (already an unsubscribe).
 */
export async function subscribeWalletEvents(
  handle: WalletHandle,
  handler: (event: SdkEvent) => void,
): Promise<() => Promise<void>> {
  const listener = { onEvent: handler };
  const result = await handle.addEventListener(
    listener as Parameters<WalletHandle["addEventListener"]>[0],
  );

  return async () => {
    if (typeof result === "function") {
      (result as () => unknown)();
      return;
    }
    if (typeof result === "string") {
      const remover = (
        handle as unknown as {
          removeEventListener?: (id: string) => Promise<void> | void;
        }
      ).removeEventListener;
      if (typeof remover === "function") await remover.call(handle, result);
      return;
    }
    if (
      result &&
      typeof result === "object" &&
      typeof (result as { id?: unknown }).id === "string"
    ) {
      const remover = (
        handle as unknown as {
          removeEventListener?: (id: string) => Promise<void> | void;
        }
      ).removeEventListener;
      if (typeof remover === "function") {
        await remover.call(handle, (result as { id: string }).id);
      }
    }
  };
}

/* ---------- BIP-39 helpers ---------- */

/**
 * Generate a fresh 12-word BIP-39 mnemonic using `@scure/bip39`. The
 * caller is responsible for persisting it inside the encrypted persona
 * backup.
 */
export async function generateMnemonic(): Promise<string> {
  const { generateMnemonic } = await import("@scure/bip39");
  const { wordlist } = await import("@scure/bip39/wordlists/english.js");
  return generateMnemonic(wordlist, 128);
}

export async function validateMnemonic(mnemonic: string): Promise<boolean> {
  const { validateMnemonic } = await import("@scure/bip39");
  const { wordlist } = await import("@scure/bip39/wordlists/english.js");
  return validateMnemonic(mnemonic, wordlist);
}
