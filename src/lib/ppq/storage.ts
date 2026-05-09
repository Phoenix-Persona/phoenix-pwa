/**
 * Local persistence for the ppq.ai account credentials.
 *
 * v1: plain `localStorage` under the key `phoenix:ppq:account`. The blast
 * radius of a leaked api_key is bounded — the operator can revoke + rotate
 * via `/keys` — but it is still secret and an XSS would expose it. The
 * abstraction below is intentionally minimal so a future implementation can
 * encrypt the credentials NIP-44-to-self via the operator's signer (mirroring
 * the persona-config pattern in `lib/persona*.ts`) without touching callers.
 *
 * Designed to be safely callable in non-browser contexts (SSR/tests):
 * `localStorage` is feature-detected and a no-op stub is used otherwise.
 */

import type { PpqAccount } from "./types";

export const PPQ_ACCOUNT_STORAGE_KEY = "phoenix:ppq:account";

/**
 * Pluggable storage interface — swap implementations without touching hooks.
 */
export interface PpqAccountStore {
  load(): PpqAccount | null;
  save(account: PpqAccount): void;
  clear(): void;
}

interface RawWebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getLocalStorage(): RawWebStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPpqAccount(value: unknown): value is PpqAccount {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.api_key === "string" && typeof v.credit_id === "string";
}

export function createLocalStorageAccountStore(
  storageKey: string = PPQ_ACCOUNT_STORAGE_KEY,
): PpqAccountStore {
  const storage = getLocalStorage();

  return {
    load() {
      if (!storage) return null;
      const raw = storage.getItem(storageKey);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        return isPpqAccount(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(account) {
      if (!storage) return;
      storage.setItem(storageKey, JSON.stringify(account));
    },
    clear() {
      if (!storage) return;
      storage.removeItem(storageKey);
    },
  };
}

/** Process-wide default store — what the hooks use unless overridden. */
export const ppqAccountStore: PpqAccountStore = createLocalStorageAccountStore();
