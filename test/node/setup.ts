import { JSDOM } from "jsdom";
import { afterEach } from "node:test";
import { mockFn } from "./api";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  MutationObserver: dom.window.MutationObserver,
  File: dom.window.File,
  Blob: dom.window.Blob,
  EventTarget: dom.window.EventTarget,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  StorageEvent: dom.window.StorageEvent,
})) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

Object.defineProperty(window, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: mockFn((query: unknown) => ({
    matches: false,
    media: String(query),
    onchange: null,
    addListener: mockFn(),
    removeListener: mockFn(),
    addEventListener: mockFn(),
    removeEventListener: mockFn(),
    dispatchEvent: mockFn(),
  })),
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: mockFn(),
});

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

Object.defineProperty(window, "localStorage", {
  writable: true,
  value: makeStorage(new Map()),
});
Object.defineProperty(window, "sessionStorage", {
  writable: true,
  value: makeStorage(new Map()),
});
Object.assign(globalThis, {
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
});
Object.assign(globalThis, {
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(Date.now()), 16),
  cancelAnimationFrame: (handle: number) => window.clearTimeout(handle),
});

if (!("attachEvent" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "attachEvent", {
    configurable: true,
    value: () => undefined,
  });
}
if (!("detachEvent" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "detachEvent", {
    configurable: true,
    value: () => undefined,
  });
}

globalThis.IntersectionObserver = mockFn(() => ({
  observe: mockFn(),
  unobserve: mockFn(),
  disconnect: mockFn(),
  root: null,
  rootMargin: "",
  thresholds: [],
  takeRecords: mockFn(() => []),
})) as unknown as typeof IntersectionObserver;

globalThis.ResizeObserver = mockFn(() => ({
  observe: mockFn(),
  unobserve: mockFn(),
  disconnect: mockFn(),
})) as unknown as typeof ResizeObserver;

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
