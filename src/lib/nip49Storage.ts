/**
 * NIP-49 at-rest encryption for the user nsec.
 *
 * Phoenix wraps fresh-Phoenix-generated user nsecs with NIP-49
 * (`ncryptsec`) before persisting to localStorage. BYO users
 * (NIP-07/NIP-46/paste) skip this entirely — their key custody is
 * whatever signer they brought.
 *
 * Locked decisions:
 *   - scrypt log_n = 18 (≈400ms on desktop; balanced mobile vs security)
 *   - per-user (not per-persona) — persona nsecs already encrypted-at-rest
 *     inside the kind 30078 backup
 *   - once per session unlock — see UnlockGate
 *   - separate passphrase for "download backup" export (also NIP-49)
 *
 * Threat model boundary:
 *   ✓ defends against passive disk reads, malware that scrapes
 *     localStorage, browser extensions with disk access, shared-device
 *     reuse, and OS-level forensic recovery between sessions.
 *   ✗ does NOT defend against XSS — an attacker who can run JS in
 *     the origin can keylog the passphrase prompt and decrypt the
 *     ncryptsec. CSP is the primary defense (see AGENTS.md
 *     "Nostr Security Model"); this module is defense in depth.
 */

import { encrypt as nip49Encrypt, decrypt as nip49Decrypt } from "nostr-tools/nip49";

import { secureStorage } from "./secureStorage";

/** Where the encrypted user nsec is parked. */
const STORAGE_KEY = "zuka:user:ncryptsec";

/**
 * Per-tab session flag — set when the user has unlocked or completed
 * a fresh signup in this tab. The active signer may stay in memory for
 * this tab, but persisted Nostrify login state is still cleared so a
 * refresh/new tab triggers the unlock prompt.
 *
 * Used by `main.tsx` to decide whether to clear Nostrify's persisted
 * nsec login on page load — see the pre-render hook there.
 */
const SESSION_UNLOCK_KEY = "zuka:session-unlocked";

/** Where Nostrify persists its login array. We touch this from
 *  `main.tsx` to force-clear stale sessions on a new tab. */
export const NOSTR_LOGIN_STORAGE_KEY = "nostr:login";

/** scrypt difficulty — Derek's locked default. */
export const DEFAULT_LOG_N = 18;

/**
 * Encrypt a raw user nsec (32 bytes) to an `ncryptsec1...` string.
 *
 * `logN` controls scrypt difficulty: 18 ≈ 400ms desktop, 16 ≈ 100ms,
 * 20 ≈ 2s. Tests pass a low value (e.g. 8) for speed.
 *
 * `ksb` (key security byte) defaults to 0x02 ("client doesn't track")
 * since Phoenix shows the user the nsec during the download-backup
 * flow, which would arguably violate 0x01's "never exported" claim.
 */
export function encryptNsec(
  nsecBytes: Uint8Array,
  passphrase: string,
  logN: number = DEFAULT_LOG_N
): string {
  if (nsecBytes.length !== 32) {
    throw new Error("nsec must be 32 bytes");
  }
  if (!passphrase) {
    throw new Error("passphrase required");
  }
  return nip49Encrypt(nsecBytes, passphrase, logN, 0x02);
}

/**
 * Decrypt an `ncryptsec1...` back to the 32-byte nsec.
 *
 * Throws on wrong passphrase (the underlying xchacha20-poly1305 AEAD
 * tag fails to verify). Callers should catch and present an
 * "incorrect passphrase" message rather than the raw error.
 */
export function decryptNcryptsec(
  ncryptsec: string,
  passphrase: string
): Uint8Array {
  if (!ncryptsec.startsWith("ncryptsec1")) {
    throw new Error("not an ncryptsec1 string");
  }
  if (!passphrase) {
    throw new Error("passphrase required");
  }
  return nip49Decrypt(ncryptsec, passphrase);
}

// ─────────── storage helpers ───────────
//
// On Capacitor (native) the ncryptsec lives in iOS Keychain / Android
// KeyStore via `secureStorage`. On web it falls back to localStorage.
// `secureStorage` migrates legacy localStorage values to the OS keystore
// automatically on first read, so existing users transparently upgrade
// the first time the native app reads the key.
//
// API consumers (UnlockGate, AuthDialog, Settings, main.tsx) want
// synchronous reads. We back the sync read API with an in-memory cache
// hydrated once at boot from the (async) secureStorage. Writes update
// the cache synchronously and fire-and-forget the underlying write.
//
//   undefined = not hydrated yet → fall back to sync localStorage read
//   null      = hydrated, no value parked
//   string    = hydrated, current ncryptsec
let cachedNcryptsec: string | null | undefined = undefined;

/** Best-effort access — returns a stub when storage is unavailable. */
function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Hydrate the in-memory ncryptsec cache from secureStorage.
 *
 * Call this ONCE at boot (from `main.tsx`) before any sync read. On
 * native, reads from iOS Keychain / Android KeyStore. On web, reads
 * from localStorage. If a legacy localStorage value exists on native,
 * `secureStorage.getItem` migrates it to the OS keystore as a side
 * effect of this call.
 */
export async function hydrateUserNcryptsec(): Promise<void> {
  try {
    const v = await secureStorage.getItem(STORAGE_KEY);
    cachedNcryptsec = v && v.startsWith("ncryptsec1") ? v : null;
  } catch {
    cachedNcryptsec = null;
  }
}

/** Persist the user's ncryptsec. Overwrites any existing value. */
export function storeUserNcryptsec(ncryptsec: string): void {
  cachedNcryptsec = ncryptsec;
  // Fire-and-forget. On web this is a sync localStorage write under
  // the hood; on native it's a fast Keychain write. Failures are
  // logged but don't block UI.
  void secureStorage.setItem(STORAGE_KEY, ncryptsec).catch((err) => {
    console.error("[nip49Storage] failed to persist ncryptsec:", err);
  });
}

/** Read the stored ncryptsec, or null if none. */
export function loadUserNcryptsec(): string | null {
  // Hydration not run yet (tests, hot reload, edge boot order) — fall
  // back to a sync localStorage read so tests don't need to opt in.
  if (cachedNcryptsec === undefined) {
    const storage = safeStorage();
    if (!storage) return null;
    const v = storage.getItem(STORAGE_KEY);
    return v && v.startsWith("ncryptsec1") ? v : null;
  }
  return cachedNcryptsec;
}

/** Clear the stored ncryptsec. Used on logout / "forget device". */
export function clearUserNcryptsec(): void {
  cachedNcryptsec = null;
  void secureStorage.removeItem(STORAGE_KEY).catch((err) => {
    console.error("[nip49Storage] failed to clear ncryptsec:", err);
  });
}

/** Whether the user has a Phoenix-managed ncryptsec stored on this device. */
export function hasUserNcryptsec(): boolean {
  return loadUserNcryptsec() !== null;
}

// ─────────── per-tab session flag ───────────

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Mark this live tab as "unlocked" — the user has either entered the
 * passphrase via `<UnlockGate>` or just completed a fresh signup.
 */
export function markSessionUnlocked(): void {
  const storage = safeSessionStorage();
  if (!storage) return;
  storage.setItem(SESSION_UNLOCK_KEY, "1");
}

/** Whether this tab has unlocked / completed signup. */
export function isSessionUnlocked(): boolean {
  const storage = safeSessionStorage();
  if (!storage) return false;
  return storage.getItem(SESSION_UNLOCK_KEY) === "1";
}

/**
 * Clear the per-tab session flag. Called by Settings → "Lock now"
 * (which forces re-prompt on next signer use within this tab) and
 * by "Forget device" (which clears everything).
 */
export function clearSessionUnlocked(): void {
  const storage = safeSessionStorage();
  if (!storage) return;
  storage.removeItem(SESSION_UNLOCK_KEY);
}

export function clearPersistedNostrLogin(): void {
  try {
    window.localStorage.removeItem(NOSTR_LOGIN_STORAGE_KEY);
  } catch {
    /* best effort */
  }
}

/**
 * Pre-render hook called from `main.tsx` BEFORE React boots.
 *
 * If the user has an at-rest ncryptsec on this device, clear
 * Nostrify's persisted login from localStorage. Without this,
 * Nostrify hydrates the prior session's nsec on every page load and
 * the unlock gate never fires.
 *
 * The function is idempotent: if no ncryptsec is parked, it does
 * nothing; otherwise repeated clears are harmless.
 *
 * Safe to call multiple times (e.g. via React 18 strict-mode double-
 * mount semantics) — both reads and the conditional write are
 * cheap.
 */
export function clearStaleNostrLoginIfLocked(): void {
  if (typeof window === "undefined") return;
  if (!hasUserNcryptsec()) return;
  clearPersistedNostrLogin();
}
