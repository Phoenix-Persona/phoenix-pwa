/**
 * Helpers for registering a Spark Lightning Address with collision handling.
 *
 * The default Breez LNURL host (`breez.tips`) is a globally shared
 * namespace — first-come-first-served across every Spark wallet on the
 * planet. We slugify the user's chosen username, probe availability, and
 * fall back to `<base>-<4chars>` on collision so persona creation never
 * fails just because someone else already grabbed `maria`.
 *
 * The SDK's `checkLightningAddressAvailable` is a server-side probe (no
 * registration); `registerLightningAddress` is the actual claim. Both
 * are scoped to the connected wallet's Spark identity.
 */

/**
 * Default Spark hosted LN address domain. The SDK reports
 * `<username>@breez.tips` from `getLightningAddress()`. We surface the
 * same string in form previews so what the user sees matches what
 * Spark actually issues.
 *
 * Single source of truth — UI labels import this rather than hardcoding.
 */
export const SPARK_LN_DOMAIN = "breez.tips";

import type { WalletHandle } from "@/lib/wallet/types";

/** Lowercase, ASCII-only, hyphen-joined slug suitable for an LN address username. */
export function slugifyForUsername(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    // Strip combining diacritics so "Imani Hakizimana" → "imani hakizimana".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** Validate a candidate username matches the LN-address character set. */
export function isValidLightningUsername(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,29}$/.test(s);
}

/**
 * Public LUD-16 endpoint that powers `<user>@breez.tips`. Hitting it
 * lets us probe availability without connecting an SDK instance — a
 * 200 means the slot is taken (the JSON LNURL-pay descriptor is
 * served), a 404 means it's free. Anything else is a transient
 * network error.
 */
const SPARK_LUD16_HOST = `https://${SPARK_LN_DOMAIN}`;

export type AvailabilityStatus = "available" | "taken" | "error";

export class LightningUsernameTakenError extends Error {
  constructor(public readonly username: string) {
    super(`Username \`${username}\` is taken — pick another.`);
    this.name = "LightningUsernameTakenError";
  }
}

/**
 * Probe a username via the LUD-16 well-known endpoint. Cheap and
 * SDK-free — used for live UX feedback in the username form input.
 * The actual mint flow uses the SDK's authoritative
 * `checkLightningAddressAvailable` + register call.
 */
export async function probeLightningUsernameAvailability(
  username: string,
  signal?: AbortSignal,
): Promise<AvailabilityStatus> {
  if (!isValidLightningUsername(username)) return "error";
  try {
    const res = await fetch(
      `${SPARK_LUD16_HOST}/.well-known/lnurlp/${encodeURIComponent(username)}`,
      { method: "GET", signal },
    );
    if (res.status === 404) return "available";
    if (res.ok) return "taken";
    return "error";
  } catch {
    return "error";
  }
}

export interface RegisterLightningAddressOptions {
  /** Username to register. Falls back to `fallbackBase` if empty/invalid. */
  baseUsername: string;
  /** Free-form description embedded in the LNURL metadata. */
  description?: string;
  /** Fallback base username if `baseUsername` is empty/invalid. Defaults to "user". */
  fallbackBase?: string;
}

export interface ResolvedLightningAddress {
  /** Final username we successfully registered. */
  username: string;
  /** Full address, e.g. `imani-7k2p@breez.tips`. */
  lightningAddress: string;
  /** Static LNURL-pay bech32 string, if the SDK populated it. */
  lnurl?: string;
}

/**
 * Probe for availability and register the exact requested Lightning Address.
 * Throws when the requested username is taken or registration collides.
 */
export async function registerLightningAddressWithRetry(
  handle: WalletHandle,
  opts: RegisterLightningAddressOptions,
): Promise<ResolvedLightningAddress> {
  const fallbackBase = opts.fallbackBase ?? "user";
  const slugged = slugifyForUsername(opts.baseUsername);
  const candidate = isValidLightningUsername(slugged) ? slugged : fallbackBase;

  let available: boolean;
  try {
    available = await handle.checkLightningAddressAvailable({
      username: candidate,
    });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Could not check Lightning Address availability: ${err.message}`
        : "Could not check Lightning Address availability.",
      { cause: err },
    );
  }

  if (!available) {
    throw new LightningUsernameTakenError(candidate);
  }

  try {
    const info = await handle.registerLightningAddress({
      username: candidate,
      ...(opts.description !== undefined ? { description: opts.description } : {}),
    });
    return {
      username: info.username,
      lightningAddress: info.lightningAddress,
      // The SDK's LnurlInfo carries both the URL and a bech32 LNURL string.
      // We keep the bech32 form — that's what wallets accept on paste.
      lnurl: info.lnurl?.bech32,
    };
  } catch {
    throw new LightningUsernameTakenError(candidate);
  }
}
