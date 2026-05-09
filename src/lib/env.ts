/**
 * Read an environment variable in a way that works from both:
 *
 *   - the Vite-built browser bundle, where `import.meta.env.VITE_*` is
 *     replaced at build time, and
 *   - Node integration tests (`tsx tests/.../run.ts`), where Vite isn't
 *     in the loop and the value lives on `process.env`.
 *
 * Use this everywhere a library reads a `VITE_*` value so primitives stay
 * runnable from headless test scripts without duplicating fallbacks.
 */

export function readEnv(name: string): string | undefined {
  const viteEnv = (import.meta as ImportMeta).env as
    | Record<string, string | undefined>
    | undefined;
  const fromVite = viteEnv?.[name];
  if (typeof fromVite === "string" && fromVite.length > 0) return fromVite;

  if (typeof process !== "undefined" && process.env) {
    const fromNode = process.env[name];
    if (typeof fromNode === "string" && fromNode.length > 0) return fromNode;
  }
  return undefined;
}
