type ImportOriginal = <T = unknown>() => Promise<T>;
type MockFactory = (importOriginal: ImportOriginal) => unknown | Promise<unknown>;

declare global {
  var __zukaMockRegistry: Map<string, MockFactory> | undefined;
  var __zukaMockCache: Map<string, unknown> | undefined;
}

globalThis.__zukaMockRegistry ??= new Map();
globalThis.__zukaMockCache ??= new Map();

export async function loadMockModule(
  specifier: string,
  importOriginal: ImportOriginal,
): Promise<unknown> {
  const registry = globalThis.__zukaMockRegistry;
  const cache = globalThis.__zukaMockCache;
  const factory = registry?.get(specifier);
  if (!factory) {
    throw new Error(`No node:test mock registered for ${specifier}`);
  }
  if (cache?.has(specifier)) return cache.get(specifier);
  const value = await factory(importOriginal);
  cache?.set(specifier, value);
  return value;
}

export function getMockedExport(specifier: string, name: string): unknown {
  const cached = globalThis.__zukaMockCache?.get(specifier);
  if (cached && typeof cached === "object" && name in cached) {
    return (cached as Record<string, unknown>)[name];
  }
  throw new Error(`No node:test mock export ${name} registered for ${specifier}`);
}
