# Current Stack

Zuka uses explicit tooling instead of a framework build pipeline:

- `scripts/build.mjs` bundles browser JS with esbuild, builds Tailwind CSS through the Tailwind CLI, copies static assets from `public/`, and writes `dist/index.html` plus `dist/404.html`.
- `scripts/dev.mjs` runs the local esbuild dev server and Tailwind CSS watcher.
- Biome handles linting through `npm run lint:ci`.
- `node:test` runs unit and integration tests through `test/scripts/test-node.mjs`.
- Playwright powers browser smoke checks for both dev and production builds.
- Root `scripts/` is reserved for app build/dev/shared-env code; validation scripts live in `test/scripts/`.

## Validation

Use `npm run test:ci` as the complete validation command. It runs typecheck,
Biome/source policy, unit tests, integration tests, production build
verification, strict bundle budgets, and PWA smokes.

The PWA checks are split by purpose:

- `npm run smoke:dist` validates production static files, headers, CSP,
  manifest icons, service worker, hashed JS/CSS references, and SPA fallback.
- `npm run smoke:browser:prod` loads the production `dist/` build in Chromium.
- `npm run smoke:browser` loads the watched dev server in Chromium.

GitHub Actions must install Chromium with `npx playwright install --with-deps
chromium` before `npm run test:ci`.

## Bundle Policy

`npm run check:bundle-budget:ci` is strict. It fails when:

- The main bundle exceeds `BUNDLE_MAIN_MAX_BYTES` or the default 550 KiB.
- The largest JS output exceeds `BUNDLE_LARGEST_JS_MAX_BYTES` or the default
  750 KiB.
- The esbuild metafile includes `node_modules/zod/`.

Zod is useful for runtime validation, but the browser bundle policy is to keep
Zod out of production chunks unless a future change explicitly accepts and
documents the bundle cost.
