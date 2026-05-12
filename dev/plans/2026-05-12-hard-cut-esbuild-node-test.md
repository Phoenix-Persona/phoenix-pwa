# Hard-Cut esbuild + node:test Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vite/Vitest/Unhead toolchain with explicit esbuild build scripts and Node's built-in test runner.

**Architecture:** Build and dev behavior moves into small repo-owned Node scripts under `scripts/`. Tests are compiled with esbuild into a temporary directory and executed with `node --test`, using a project-local jsdom setup and explicit fakes instead of Vitest module mocking.

**Tech Stack:** esbuild, @tailwindcss/cli, node:test, node:assert/strict, jsdom, React Testing Library, TypeScript, ESLint.

---

## Task 1: Build Infrastructure

**Files:**
- Create: `scripts/env.mjs`
- Create: `scripts/build.mjs`
- Create: `scripts/dev.mjs`
- Modify: `package.json`

- [ ] Add direct dev dependencies: `esbuild` and `@tailwindcss/cli`.
- [ ] Implement `scripts/env.mjs` with the current Vite env behavior: load root `.env`, then `dev/.env`, then process env; keep only `VITE_` keys; root overrides dev; process overrides both.
- [ ] Preserve the production secret guard for `VITE_APP_USER_NSEC`, `VITE_PPQ_API_KEY`, `VITE_PPQ_CREDIT_ID`, and `VITE_WALLET_SEED`.
- [ ] Implement `scripts/build.mjs`: clean `dist`, copy `public`, compile Tailwind CSS, bundle `src/main.tsx` with esbuild, rewrite root `index.html`, and write `dist/404.html`.
- [ ] Implement `scripts/dev.mjs`: run esbuild in watch mode, run Tailwind in watch mode, serve `dist` and `public` with SPA fallback and Breez-required COOP/COEP headers.
- [ ] Update `npm run build` and `npm run dev` to use these scripts.
- [ ] Verify `npm run build` creates `dist/index.html`, `dist/404.html`, a JS asset, a CSS asset, icons, manifest, and ffmpeg assets.

## Task 2: Runtime Vite/Unhead Removal

**Files:**
- Create: `src/hooks/usePageMeta.ts`
- Modify: `src/App.tsx`
- Modify: `src/lib/env.ts`
- Modify: pages/dev harnesses that import `useSeoMeta`

- [ ] Replace Unhead providers in `src/App.tsx` with plain app providers.
- [ ] Add `usePageMeta()` that updates `document.title` and supported static meta tags through React effects.
- [ ] Replace every `useSeoMeta` call with `usePageMeta`.
- [ ] Remove Vite-specific `import.meta.env` fallback logic from `src/lib/env.ts`; keep `__PHOENIX_ENV__` and Node `process.env` fallback.
- [ ] Keep `VITE_ZUKA_RUNTIME` production/development behavior intact.
- [ ] Verify the app still type-checks after Unhead removal.

## Task 3: Static PWA Replacement

**Files:**
- Create: `src/lib/registerServiceWorker.ts`
- Create or update: `public/sw.js`
- Modify: `public/manifest.webmanifest`
- Modify: `src/main.tsx`

- [ ] Update the static manifest from Phoenix naming to current Zuka metadata.
- [ ] Add a small service worker that precaches the app shell and applies same-origin GET stale-while-revalidate caching.
- [ ] Register the service worker from startup in production-capable browser environments.
- [ ] Do not add Workbox or a new PWA plugin unless static service worker verification fails.
- [ ] Verify `dist/sw.js`, `dist/manifest.webmanifest`, and service-worker registration are present after `npm run build`.

## Task 4: node:test Harness

**Files:**
- Create: `test/node/setup.ts`
- Create: `test/node/TestApp.tsx`
- Create: `test/node/mock.ts`
- Create: `scripts/test-node.mjs`
- Modify: `tsconfig.json`
- Modify: `package.json`

- [ ] Add jsdom setup for `window`, `document`, `navigator`, local/session storage, matchMedia, scrollTo, IntersectionObserver, ResizeObserver, and React act environment.
- [ ] Move `TestApp` from `test/vitest/TestApp.tsx` to `test/node/TestApp.tsx` and remove Unhead usage.
- [ ] Add tiny test helpers for function calls, environment stubbing, and cleanup.
- [ ] Implement `scripts/test-node.mjs`: compile selected test files with esbuild into `.tmp/node-test`, preserve aliases, run `node --test`, and support unit/integration modes.
- [ ] Update `test:unit`, `test:integration`, `test:all`, and `test:ci` to use `scripts/test-node.mjs`.

## Task 5: Convert Tests

**Files:**
- Modify all `*.test.ts`, `*.test.tsx`, and `*.integration.test.*` files.

- [ ] Replace `import { ... } from "vitest"` with `node:test`, `node:assert/strict`, and local helpers.
- [ ] Convert pure utility tests first.
- [ ] Convert local relay and HTTP integration tests next.
- [ ] Convert React/component/hook tests last.
- [ ] Replace `vi.fn` and `vi.spyOn` with local helper fakes or `node:test` mock APIs.
- [ ] Replace `vi.stubEnv` with local env stubs.
- [ ] Remove every `vi.mock` by using explicit dependency seams, test harness fakes, or local wrapper modules.
- [ ] Do not keep a Vitest compatibility shim.

## Task 6: Dependency and CI Cleanup

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`
- Delete: `vite.config.ts`
- Delete: `src/vite-env.d.ts`
- Delete: `test/vitest/**`

- [ ] Remove `vite`, `vitest`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-plugin-pwa`, `vite-plugin-wasm`, `vite-plugin-node-polyfills`, `@unhead/react`, and `unhead`.
- [ ] Keep `jsdom`, React Testing Library, and jest-dom only if still used by node:test React tests.
- [ ] Update CI and deploy comments/scripts to reference esbuild and node:test, not Vite/Vitest.
- [ ] Delete obsolete Vite/Vitest config and setup files.
- [ ] Verify `npm ls vite vitest @vitejs/plugin-react @tailwindcss/vite vite-plugin-pwa vite-plugin-wasm vite-plugin-node-polyfills @unhead/react unhead` exits non-zero because none are installed.

## Final Verification

- [ ] Run `npm run build`.
- [ ] Run `npm run test:unit`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm test`.
- [ ] Run `npm audit`.
- [ ] Run `npm run cap:sync`.
- [ ] Confirm `git status --short` contains only intended changes before the final commit.
