import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// vite-plugin-node-polyfills (added for the Breez Spark SDK) interferes with
// jsdom's localStorage in test mode — `window.localStorage.setItem` shows up
// as undefined. Provide a working in-memory mock so persistence tests can run.
if (typeof window !== 'undefined') {
  const localStore = new Map<string, string>();
  const sessionStore = new Map<string, string>();
  const makeStorage = (store: Map<string, string>): Storage => ({
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    value: makeStorage(localStore),
  });
  Object.defineProperty(window, 'sessionStorage', {
    writable: true,
    value: makeStorage(sessionStore),
  });
}

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: null,
    rootMargin: '',
    thresholds: [],
    takeRecords: vi.fn(() => []),
  };
}) as unknown as typeof IntersectionObserver;

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation((_callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
