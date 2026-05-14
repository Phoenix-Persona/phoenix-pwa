# Bundle Baseline - 2026-05-13

## Purpose

This report tracks the esbuild metafile baseline after the Vite/Vitest hard cut.
CI now enforces the configured bundle budgets with `npm run check:bundle-budget`.

## How To Refresh

```bash
npm run build
npm run analyze:bundle
```

`npm run build` writes `.tmp/build/meta.json`. `npm run analyze:bundle` prints the largest output files and bundled inputs from that metafile.

## Current Baseline

After removing app-level Zod parsing and replacing Zod-backed Nostrify/browser
upload paths with local runtime validators:

- Main bundle: `dist/assets/main-*.js` — 225.6 KiB.
- Largest JS output: `dist/assets/chunk-chunk-*.js` — 386.6 KiB.
- `npm run analyze:bundle` reports no bundled `zod` modules.

## Current Policy

- Keep bundle analysis opt-in for manual investigation.
- CI enforces the main bundle and largest JS output budgets.
- Use the report to identify candidates for lazy-loading, especially Breez, ffmpeg, onboarding-only code, and video-composer paths.
