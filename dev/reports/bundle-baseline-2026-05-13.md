# Bundle Baseline - 2026-05-13

## Purpose

This report tracks the esbuild metafile baseline after the Vite/Vitest hard cut.
CI enforces strict bundle budgets with `npm run check:bundle-budget:ci`.

## How To Refresh

```bash
npm run build
npm run analyze:bundle
```

`npm run build` writes `.tmp/build/meta.json`. `npm run analyze:bundle` prints the largest output files and bundled inputs from that metafile.

## Current Baseline

After removing app-level Zod parsing, replacing Zod-backed Nostrify/browser
upload paths with local runtime validators, and lazy-loading root toast UI:

- Main bundle: `dist/assets/main-*.js` — 223.6 KiB.
- Largest JS output: `dist/assets/chunk-chunk-*.js` — 304.7 KiB.
- `npm run analyze:bundle` reports no bundled `zod` modules.

## Current Policy

- Keep bundle analysis opt-in for manual investigation.
- CI enforces the main bundle and largest JS output budgets in strict mode.
- CI fails if the esbuild metafile includes `node_modules/zod/`.
- Use the report to identify candidates for lazy-loading, especially Breez, ffmpeg, onboarding-only code, and video-composer paths.
