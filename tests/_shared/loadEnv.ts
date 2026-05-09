/**
 * Load `dev/.env` into `process.env` for Node integration test scripts.
 *
 * Vite already auto-loads it (via `envDir: "dev"` in vite.config.ts), but
 * `tsx tests/<dir>/<script>.ts` runs in plain Node where Vite isn't in the loop.
 * Importing this module at the top of a test script makes `process.env`
 * carry the same keys the browser bundle sees, so primitives can read
 * `VITE_BREEZ_API_KEY` etc. via `readEnv()` without a duplicate fallback.
 *
 * Idempotent — safe to import from multiple test files.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../dev/.env");

const result = dotenvConfig({ path: envPath, quiet: true });

if (result.error && (result.error as NodeJS.ErrnoException).code !== "ENOENT") {
  console.warn(`[tests] Failed to load ${envPath}:`, result.error.message);
}
