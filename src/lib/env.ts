/**
 * Read an environment variable from the esbuild-injected Phoenix env map or
 * from Node's process env when running integration scripts.
 *
 * Use this everywhere a library reads a `VITE_*` value so primitives stay
 * runnable from headless test scripts without duplicating fallbacks.
 */

declare const __PHOENIX_ENV__: Record<string, string> | undefined;

export function readEnv(name: string): string | undefined {
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
    // ReferenceError outside the browser bundle context — fall through.
  }

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

  return process.env.NODE_ENV === "production";
}

export function readDevEnv(name: string): string | undefined {
  return isProductionRuntime() ? undefined : readEnv(name);
}
