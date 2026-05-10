import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';
import { ensureWalletReady } from './lib/wallet/init';
import { clearStaleNostrLoginIfLocked, hydrateUserNcryptsec } from './lib/nip49Storage';
import { bootstrapNative } from './lib/nativeBootstrap';

// Capacitor native bootstrap — must run BEFORE React mounts so the
// system bar style is themed at first paint and the iOS keyboard
// accessory bar is suppressed before any <input> can focus. On web,
// this is a silent no-op (returns early via Capacitor.isNativePlatform).
bootstrapNative();

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
  // Hydrate the at-rest ncryptsec cache from secureStorage (iOS Keychain
  // / Android KeyStore on native; localStorage on web). This must finish
  // BEFORE `clearStaleNostrLoginIfLocked()` since that uses
  // `hasUserNcryptsec()` synchronously, AND before React renders so the
  // unlock gate sees the right state on first paint.
  //
  // Side effect: on first native launch with a legacy localStorage value,
  // `secureStorage` migrates it to the OS keystore as part of this read.
  await hydrateUserNcryptsec();

  // Run BEFORE React renders. If a Phoenix-managed ncryptsec is parked,
  // clear Nostrify's persisted login so the unlock gate fires on first
  // paint instead of being shadowed by a stale session.
  //
  // Necessary because NostrLoginProvider stores the plaintext nsec to
  // localStorage (`nostr:login`) on every state change and rehydrates
  // from it on next page load. Without this clear, the user is never
  // re-prompted across page loads — the very thing the at-rest layer is
  // supposed to enforce.
  clearStaleNostrLoginIfLocked();

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
