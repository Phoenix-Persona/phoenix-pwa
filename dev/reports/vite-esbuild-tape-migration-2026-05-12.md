# Vite to esbuild and tape Migration Report

> **Status: Historical.** The app now uses esbuild, `node:test`, and Biome.
> Vite, Vitest, Vite plugins, and ESLint-era artifacts referenced below
> describe the pre-migration state.

Date: 2026-05-12

## Executive Summary

Vite is replaceable in this project. It is not merely bundling TypeScript, though: it currently owns the React build, Tailwind 4 CSS processing, PWA/service-worker generation, WASM handling, Node polyfills for Breez Spark, environment injection, dev-server headers, path aliases, and the Vitest configuration.

The clean migration is a two-track hard cut:

1. Replace Vite's app build/dev-server responsibilities with small explicit scripts around esbuild and Tailwind.
2. Treat Vitest to tape as a separate migration, because the existing test suite is deeply tied to Vitest APIs.

Recommendation: migrate the app build from Vite to esbuild first while keeping Vitest temporarily. Then migrate tests to tape only after the app build is stable, starting with pure unit tests and moving React/module-mocking tests last.

## Current Vite Surface

Direct Vite-family packages in `package.json`:

- `vite`
- `@vitejs/plugin-react`
- `@tailwindcss/vite`
- `vite-plugin-pwa`
- `vite-plugin-wasm`
- `vite-plugin-node-polyfills`
- `vitest`

Vite-dependent scripts:

- `dev`: starts the Vite dev server.
- `build`: runs `vite build`, then copies `dist/index.html` to `dist/404.html`.
- `test:unit`: runs `vitest`.
- `test:integration`: runs `vitest`.
- `test:all` / `test:ci`: depend on both Vitest and `vite build`.
- `cap:*`: depend on `npm run build`.

Important Vite config behavior in `vite.config.ts`:

- React transform via `@vitejs/plugin-react`.
- Tailwind 4 CSS transform via `@tailwindcss/vite`.
- PWA manifest and service worker generation via `vite-plugin-pwa`.
- WASM handling via `vite-plugin-wasm`.
- Browser Node polyfills via `vite-plugin-node-polyfills`.
- `@` and `@/test` aliases.
- `__PHOENIX_ENV__` injection from root `.env`, `dev/.env`, and process env.
- Production guard that refuses client-exposed dev secrets.
- Dev-server COOP/COEP headers required by Breez Spark's WASM threading.
- `build.target = "esnext"` for top-level await in `src/main.tsx`.
- Exclusion of `@breeztech/breez-sdk-spark` from Vite pre-bundling.

## esbuild Migration Assessment

Replacing the app build is feasible. The migration should introduce explicit build scripts instead of recreating a Vite-like plugin graph.

Required replacements:

- Add a direct `esbuild` dev dependency.
- Add a build script, for example `scripts/build.mjs`, that bundles `src/main.tsx`, supports code splitting, preserves `target: "esnext"`, applies `@` aliases, and writes hashed JS/CSS assets under `dist/assets`.
- Add an HTML build step that reads root `index.html`, rewrites `/src/main.tsx` to the esbuild output, and writes `dist/index.html` plus `dist/404.html`.
- Add a static-copy step for `public/**` into `dist/**`.
- Replace `@tailwindcss/vite` with an explicit Tailwind 4 CSS build path. The current `tailwindcss` package has no CLI binary, so this likely means adding `@tailwindcss/cli` or using Tailwind's programmatic compiler.
- Keep the existing `src/index.css` imports as the Tailwind input: `tailwindcss`, `tailwindcss-safe-area`, `tw-animate-css`, and fontsource CSS.
- Replace VitePWA with an explicit PWA step. The project already has `public/manifest.webmanifest`, but it is stale (`Phoenix` naming), while VitePWA currently emits the Zuka manifest. The static manifest must be updated, and service-worker generation needs either a small hand-written SW or a Workbox build step.
- Replace `vite-plugin-node-polyfills` with targeted polyfills. The app already sets `globalThis.Buffer` in `src/lib/polyfills.ts`; the remaining need should be verified against Breez Spark and browser builds before adding broad polyfill packages.
- Preserve the current production env guard and `__PHOENIX_ENV__` behavior outside Vite. This should live in a small shared Node module used by build scripts.
- Replace Vite's dev server with a small Node dev server using esbuild's context/watch API plus static serving and SPA fallback. It must send:
  - `Cross-Origin-Embedder-Policy: credentialless`
  - `Cross-Origin-Opener-Policy: same-origin`

Primary risks:

- Breez Spark WASM output and worker behavior must be verified in browser, not just by TypeScript/build.
- PWA behavior can regress silently if the service worker or manifest changes are incomplete.
- CSS output can change if Tailwind's Vite integration and CLI/programmatic compiler differ.
- `import.meta.env` fallbacks in `src/lib/env.ts` must remain harmless when Vite is gone.

## tape Migration Assessment

Replacing Vitest with tape is significantly larger than replacing Vite with esbuild.

Current test facts:

- 59 test files under `src` and `test`.
- The suite uses `vitest` imports throughout.
- Many tests depend on `vi.fn`, `vi.mock`, `vi.spyOn`, `vi.stubEnv`, and Vitest lifecycle helpers.
- React tests rely on jsdom, React Testing Library, global setup, and mocked browser APIs.
- Integration tests use local HTTP/relay harnesses and are less tied to module mocks, but still use Vitest lifecycle APIs.

tape does not provide direct equivalents for the hardest Vitest features:

- No built-in ESM module mocking like `vi.mock`.
- No built-in fake timers/mocks/spies like `vi.fn` and `vi.spyOn`.
- No `vi.stubEnv`.
- No built-in jsdom environment management.
- No TypeScript runner by itself.

Feasible tape approach:

- Add `tape` as the assertion/runner layer.
- Add a TypeScript execution strategy: either precompile tests with esbuild into a temp directory or run tests through an esbuild-powered loader.
- Keep `jsdom` and `@testing-library/react` for React component tests.
- Add a small `test/tape/setup.ts` for browser globals currently in `test/vitest/setup.ts`.
- Add lightweight helpers for environment stubbing, cleanup, and local/session storage.
- Replace `vi.fn`/`vi.spyOn` with explicit hand-written stubs where simple, and a small mock helper where repeated.
- Refactor tests that depend on `vi.mock` toward dependency injection or explicit test seams. Avoid adding a large ESM-mocking library unless the goal shifts from dependency reduction to quick compatibility.

Recommended migration order:

1. Convert pure utility tests first (`src/lib/*` tests without React and without `vi.mock`).
2. Convert integration harness tests that do not use module mocking.
3. Convert hook/component tests after introducing explicit dependency seams.
4. Remove Vitest only when no test imports from `vitest` remain.

Primary risks:

- A direct mechanical conversion from Vitest to tape will be noisy and fragile because module mocking is the dominant hidden dependency.
- Replacing `vi.mock` with another mocking package may preserve the complexity under a different name.
- The fastest path to tape may require more app-code refactoring than the build migration.

## Proposed Migration Plan

Phase 0: Preserve current state.

- Keep the reverted `vite-plugin-node-polyfills@^0.26.0` dependency for now.
- Do not commit the `npm audit fix --force` downgrade to `0.2.0`.
- Track the remaining audit issue as a low-severity transitive issue caused by `vite-plugin-node-polyfills -> node-stdlib-browser -> crypto-browserify -> elliptic`.

Phase 1: esbuild production build.

- Add `esbuild` and a small build script.
- Replace `npm run build` with explicit steps: clean `dist`, copy `public`, build CSS, bundle JS, rewrite HTML, copy `404.html`.
- Preserve `__PHOENIX_ENV__`, production secret blocking, aliases, top-level await, public asset paths, and Capacitor-compatible output.
- Validate with `npm run build`, `npm test`, and `npm run cap:sync`.

Phase 2: esbuild dev server.

- Add a small dev server using esbuild watch/context.
- Serve static files and generated assets with SPA fallback.
- Apply the Breez-required COOP/COEP headers.
- Replace `npm run dev`.

Phase 3: PWA replacement.

- Update `public/manifest.webmanifest` to the current Zuka metadata.
- Add either a small hand-written service worker or a Workbox build step.
- Verify installability, offline shell behavior, and generated `dist/sw.js` / `dist/registerSW.js` behavior.

Phase 4: remove Vite build packages.

- Remove `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-plugin-pwa`, `vite-plugin-wasm`, and `vite-plugin-node-polyfills` only after app build/dev/PWA parity is verified.
- Keep `vitest` until the test migration is complete.

Phase 5: tape migration.

- Add tape and the test execution strategy.
- Convert pure unit tests first.
- Convert integration tests second.
- Refactor React/component/hook tests with module mocks last.
- Remove Vitest only after the final `vitest` import is gone.

## Recommendation

Proceed with the esbuild migration, but do not combine it with the tape migration in the first implementation pass.

The Vite build stack is a reasonable cleanup target because the app can own its build steps directly. The tape migration is possible, but it should be treated as test architecture work, not build-tool cleanup. The project will get the most immediate dependency and audit benefit by replacing Vite's build/plugin stack first, then evaluating whether the cost of moving every test off Vitest is justified.
