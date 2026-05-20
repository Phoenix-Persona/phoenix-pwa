import type { NLoginStorage } from "@nostrify/react/login";

export function createMemoryNostrLoginStorage(): NLoginStorage {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
  };
}

export const appNostrLoginStorage = createMemoryNostrLoginStorage();
