import path from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import wasm from "vite-plugin-wasm";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    // The Breez Spark SDK ships as WASM with threading; the dev server needs
    // these cross-origin headers so SharedArrayBuffer is available to it.
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
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
              cacheName: "phoenix-shell",
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: "Phoenix — Uncensorable Voices",
        short_name: "Phoenix",
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
