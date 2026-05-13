# Bundle Baseline - 2026-05-13

## Purpose

This report establishes the first esbuild metafile baseline after the Vite/Vitest hard cut. It is informational only; no CI budget is enforced in this pass.

## How To Refresh

```bash
npm run build
npm run analyze:bundle
```

`npm run build` writes `.tmp/build/meta.json`. `npm run analyze:bundle` prints the largest output files and bundled inputs from that metafile.

## Current Policy

- Keep bundle analysis opt-in for now.
- Do not fail CI on size until we have a few data points.
- Use the report to identify candidates for lazy-loading, especially Breez, ffmpeg, onboarding-only code, and video-composer paths.
