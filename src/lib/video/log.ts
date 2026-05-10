/**
 * Verbose logging helpers for the video composer pipeline.
 *
 * Every log line is prefixed with `[video:<scope>]` so DevTools can be
 * filtered with `[video:` to see ONLY pipeline activity, separate
 * from React/Nostrify/Tailwind chatter. Scopes used:
 *
 *   pipeline  — high-level phase transitions in useGenerateVideoPipeline
 *   chain     — per-clip events in runChain (submit / poll / frame / upload)
 *   frame     — canvas-based last-frame extraction internals
 *   stitch    — ffmpeg.wasm load + concat events
 *   upload    — Blossom upload sizes + returned URLs
 *
 * Logging is unconditional in DEV; we lean on console verbosity rather
 * than a feature flag because every entry into this pipeline is an
 * intentional, paid action (Seedance clips cost money) — surfacing
 * what's happening is worth the noise.
 */

const STYLE = "color:#a8431b;font-weight:bold";

export function vlog(scope: string, ...args: unknown[]): void {
  console.log(`%c[video:${scope}]%c`, STYLE, "", ...args);
}

export function vwarn(scope: string, ...args: unknown[]): void {
  console.warn(`[video:${scope}]`, ...args);
}

export function verror(scope: string, ...args: unknown[]): void {
  console.error(`[video:${scope}]`, ...args);
}

/** Format a Blob/File size for log readability. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Format milliseconds compactly. */
export function fmtMs(n: number): string {
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}
