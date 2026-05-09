import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';
import { ensureWalletReady } from './lib/wallet/init';

// JSON.stringify can't natively handle BigInts. The Breez Spark SDK exposes
// payment amounts and fees as BigInt, and we serialize SDK responses for
// debug logs / persistence. Make BigInt JSON-friendly globally so callers
// don't have to remember.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

// Boot the Breez Spark WASM module before React renders. The SDK requires a
// one-shot async init before any other call; doing it here means every
// downstream call site (hooks, integration tests, agent) can assume the
// wallet runtime is ready and call SDK functions synchronously.
//
// If init fails (offline, blocked WASM, missing API key) we still render the
// app — the wallet hooks surface a connect-time error rather than wedging
// the whole UI. Keeps Phoenix usable for read-only browsing of personas.
async function boot() {
  try {
    await ensureWalletReady();
  } catch (err) {
    console.error("[wallet] Spark SDK init failed at boot:", err);
  }
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

boot();
