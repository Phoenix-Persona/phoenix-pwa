import path from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import wasm from "vite-plugin-wasm";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const REPO_ROOT = path.resolve(__dirname);

/**
 * Merge `VITE_`-prefixed keys from BOTH `<root>/.env` and
 * `<root>/dev/.env`, root-wins. Mirrors the Node test loader at
 * `tests/_shared/loadEnv.ts`, so a `VITE_PPQ_API_KEY` in the project
 * root works for the browser bundle and the integration tests alike.
 *
 * Returned map gets injected via Vite's `define` as a global
 * `__PHOENIX_ENV__` object so `src/lib/env.ts:readEnv()` can do
 * dynamic key access against it. (Vite's `define` only does literal
 * replacement, which is why we can't just remap `import.meta.env.X`
 * — our readEnv uses `import.meta.env[name]` and that doesn't get
 * text-substituted.)
 */
function loadMergedViteEnv(mode: string): Record<string, string> {
  const rootEnv = loadEnv(mode, REPO_ROOT, "");
  const devEnv = loadEnv(mode, path.join(REPO_ROOT, "dev"), "");
  const merged: Record<string, string> = {};
  // Layered, last-wins:
  //   1. dev/.env       (lowest priority — shared developer defaults)
  //   2. <root>/.env    (per-checkout overrides)
  //   3. process.env    (highest — CI / GitHub Actions secrets, exported
  //                      shell vars). Required for production builds where
  //                      `.env` isn't committed and secrets come from the
  //                      build environment instead.
  for (const [k, v] of Object.entries(devEnv)) {
    if (k.startsWith("VITE_")) merged[k] = v;
  }
  for (const [k, v] of Object.entries(rootEnv)) {
    if (k.startsWith("VITE_")) merged[k] = v;
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("VITE_") && typeof v === "string" && v.length > 0) {
      merged[k] = v;
    }
  }
  return merged;
}

const BLOCKED_PRODUCTION_CLIENT_SECRETS = [
  "VITE_APP_USER_NSEC",
  "VITE_PPQ_API_KEY",
  "VITE_PPQ_CREDIT_ID",
  "VITE_WALLET_SEED",
] as const;

function mergedViteEnvForDefine(mode: string): string {
  const env = loadMergedViteEnv(mode);
  if (mode === "production") {
    const present = BLOCKED_PRODUCTION_CLIENT_SECRETS.filter((key) => env[key]);
    if (present.length > 0) {
      throw new Error(
        `Refusing production build with client-exposed secret env vars: ${present.join(", ")}`,
      );
    }
  }
  return JSON.stringify(env);
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // envDir not set → Vite auto-loads root `.env` into `import.meta.env`.
  // dev/.env is layered in via __PHOENIX_ENV__ (see define below) so
  // both locations work without forcing a key-migration on teammates.
  define: {
    __PHOENIX_ENV__: mergedViteEnvForDefine(mode),
  },
  server: {
    host: "::",
    port: 8080,
    // The Breez Spark SDK ships as WASM with threading; the dev server needs
    // these cross-origin headers so SharedArrayBuffer is available to it.
    //
    // `credentialless` (instead of `require-corp`) keeps SharedArrayBuffer
    // working but lets cross-origin images load without the third-party
    // server having to opt in via Cross-Origin-Resource-Policy. We need
    // this because Blossom servers serving persona pictures don't ship
    // CORP headers, and require-corp blocks them outright.
    headers: {
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  build: {
    // Top-level await in `src/main.tsx` (await initBreezSDK()) requires esnext.
    target: "esnext",
  },
  optimizeDeps: {
    // Don't try to pre-bundle the WASM SDK — Vite's pre-bundler can't handle it.
    exclude: ["@breeztech/breez-sdk-spark"],
  },
  plugins: [
    react(),
    wasm(),
    nodePolyfills(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["robots.txt"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff,woff2}"],
        // Cache last-fetched relay events for offline read
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "zuka-shell",
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: "Zuka — Uncensorable Voices",
        short_name: "Zuka",
        description:
          "AI personas on Nostr. Voices that can be amplified but not silenced.",
        theme_color: "#a8431b",
        background_color: "#1a0f08",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/{vite,eslint}.config.*",
      ".agents/**",
    ],
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
    env: {
      DEBUG_PRINT_LIMIT: "0", // Suppress DOM output that exceeds AI context windows
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
