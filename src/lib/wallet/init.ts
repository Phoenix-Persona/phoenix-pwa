/**
 * One-shot WASM initialization for `@breeztech/breez-sdk-spark`.
 *
 * The SDK ships as a WebAssembly module that must be loaded with
 * `await initBreezSDK()` exactly once before any other SDK call. We expose
 * an idempotent helper so callers (the React app at boot, the integration
 * tests in `test/manual/wallet/`) can call it without bookkeeping.
 *
 * In Node (≥22) the same package supports `await import("@breeztech/breez-sdk-spark")`
 * and the default export is a no-op there — this helper handles that case
 * by treating a missing / non-callable default as a successful no-op.
 */

let initPromise: Promise<void> | null = null;

export async function ensureWalletReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import("@breeztech/breez-sdk-spark");
      const initFn = (mod as { default?: unknown }).default;
      if (typeof initFn === "function") {
        await (initFn as () => Promise<unknown>)();
      }
    })();
  }
  return initPromise;
}

/**
 * For the integration test: re-arm so `ensureWalletReady` runs again the
 * next time it's called. Not used in the running app.
 */
export function resetWalletReadyForTests(): void {
  initPromise = null;
}
