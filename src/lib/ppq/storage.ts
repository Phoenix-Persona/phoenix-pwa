export const PPQ_ACCOUNT_STORAGE_KEY = "phoenix:ppq:account";

export function clearLegacyPpqAccountStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PPQ_ACCOUNT_STORAGE_KEY);
  } catch {
    /* best effort */
  }
}
