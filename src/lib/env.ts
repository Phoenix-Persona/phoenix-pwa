/**
 * Read an environment variable in a way that works from:
 *
 *   - the Vite-built browser bundle, where vite.config.ts injects a
 *     `__PHOENIX_ENV__` global containing the merged keys from
 *     `<root>/.env` and `<root>/dev/.env`. We use a global rather than
 *     leaning on `import.meta.env` because Vite's `define`-based env
 *     injection only does literal replacement, and our calls do dynamic
 *     `import.meta.env[name]` access which doesn't get substituted.
 *   - Node integration tests under `tests/`, where Vite isn't in the
 *     loop and the value lives on `process.env` (populated by
 *     `tests/_shared/loadEnv.ts` from both .env locations).
 *
 * Resolution order: __PHOENIX_ENV__ → import.meta.env (defensive
 * secondary, in case some downstream tool sets it directly) → process.env.
 *
 * Use this everywhere a library reads a `VITE_*` value so primitives stay
 * runnable from headless test scripts without duplicating fallbacks.
 */

declare const __PHOENIX_ENV__: Record<string, string> | undefined;

export function readEnv(name: string): string | undefined {
  // 1. __PHOENIX_ENV__ injected by vite.config.ts (loads BOTH `.env`
  //    locations and merges, root-wins).
  try {
    if (
      typeof __PHOENIX_ENV__ !== "undefined" &&
      __PHOENIX_ENV__ &&
      typeof __PHOENIX_ENV__[name] === "string" &&
      __PHOENIX_ENV__[name].length > 0
    ) {
      return __PHOENIX_ENV__[name];
    }
  } catch {
    // ReferenceError outside Vite's bundle context — fall through.
  }

  // 2. Vite's automatic `import.meta.env` (env-dir-loaded keys).
  try {
    const viteEnv = (import.meta as ImportMeta).env as
      | Record<string, string | undefined>
      | undefined;
    const fromVite = viteEnv?.[name];
    if (typeof fromVite === "string" && fromVite.length > 0) return fromVite;
  } catch {
    /* not in a Vite bundle — fall through */
  }

  // 3. Node fallback for the test scripts.
  if (typeof process !== "undefined" && process.env) {
    const fromNode = process.env[name];
    if (typeof fromNode === "string" && fromNode.length > 0) return fromNode;
  }
  return undefined;
}

export function isProductionRuntime(): boolean {
  const configuredRuntime = readEnv("VITE_ZUKA_RUNTIME")?.toLowerCase();
  if (configuredRuntime === "production") return true;
  if (configuredRuntime === "development" || configuredRuntime === "test") {
    return false;
  }

  try {
    const viteEnv = (import.meta as ImportMeta).env as
      | {
          PROD?: boolean;
          MODE?: string;
        }
      | undefined;
    if (viteEnv?.PROD === true) return true;
    if (viteEnv?.MODE === "production") return true;
  } catch {
    /* not in a Vite bundle — fall through */
  }

  return process.env.NODE_ENV === "production";
}

export function readDevEnv(name: string): string | undefined {
  return isProductionRuntime() ? undefined : readEnv(name);
}
