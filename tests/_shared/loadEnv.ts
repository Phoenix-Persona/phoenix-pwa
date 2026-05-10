/**
 * Load env vars into `process.env` for Node integration test scripts.
 *
 * Two sources, in priority order (first one set wins for any given key):
 *
 *   1. `<repo>/.env`  — root-level dotfile, standard Node convention.
 *      Use this for personal / per-developer credentials (e.g. a
 *      ppq.ai api_key from a "free credits" team grant, or a
 *      `VITE_BREEZ_API_KEY` for the Spark wallet tests).
 *   2. `<repo>/dev/.env`  — project default, also layered into the
 *      browser via Vite's `define` injection. Use this for shared /
 *      project-level config.
 *
 * dotenv's default behavior is "first load wins" (no override), so a
 * key set in root `.env` is preserved when `dev/.env` is loaded after.
 *
 * `tsx tests/<dir>/<script>.ts` runs in plain Node where Vite isn't in
 * the loop, so this module is what bridges env-vs-`import.meta.env` for
 * the tests. Importing it at the top of a test script makes
 * `process.env` carry the same keys the browser bundle sees, so
 * primitives can read them via `readEnv()` without duplicate fallbacks.
 *
 * Idempotent — safe to import from multiple test files.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const ENV_PATHS = [
  path.join(REPO_ROOT, ".env"),       // user-level overrides
  path.join(REPO_ROOT, "dev", ".env"), // project defaults
];

for (const envPath of ENV_PATHS) {
  const result = dotenvConfig({ path: envPath, quiet: true });
  if (
    result.error &&
    (result.error as NodeJS.ErrnoException).code !== "ENOENT"
  ) {
    console.warn(`[tests] Failed to load ${envPath}:`, result.error.message);
  }
}
