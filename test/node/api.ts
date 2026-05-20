import {
  after,
  afterEach,
  before,
  beforeEach,
  describe as nodeDescribe,
  it as nodeIt,
  test as nodeTest,
} from "node:test";
import { expect as rawExpect } from "expect";
import * as matchers from "@testing-library/jest-dom/matchers";

type MockCall = unknown[];
type MockImpl = (...args: never[]) => unknown;
type DefaultMockImpl = (...args: unknown[]) => never;
type MockedFunction<T extends MockImpl = DefaultMockImpl> = T & {
  _isMockFunction: true;
  getMockName: () => string;
  mock: { calls: MockCall[] };
  mockClear: () => MockedFunction<T>;
  mockReset: () => MockedFunction<T>;
  mockRestore: () => MockedFunction<T>;
  mockImplementation: <U extends MockImpl>(impl: U) => MockedFunction<U>;
  mockImplementationOnce: <U extends MockImpl>(impl: U) => MockedFunction<U>;
  mockReturnValue: (value: unknown) => MockedFunction<T>;
  mockReturnValueOnce: (value: unknown) => MockedFunction<T>;
  mockResolvedValue: (value: unknown) => MockedFunction<T>;
  mockResolvedValueOnce: (value: unknown) => MockedFunction<T>;
  mockRejectedValue: (value: unknown) => MockedFunction<MockImpl>;
  mockRejectedValueOnce: (value: unknown) => MockedFunction<MockImpl>;
};

type ImportOriginal = <T = unknown>() => Promise<T>;
type MockFactory = (importOriginal: ImportOriginal) => unknown | Promise<unknown>;
type MockRegistry = Map<string, MockFactory>;
type MatcherResult = void;
type TestRunner = typeof nodeTest;
type SuiteRunner = typeof nodeDescribe;
type MatcherChain = {
  readonly not: MatcherChain;
  readonly resolves: MatcherChain;
  readonly rejects: MatcherChain;
  toBe: (...args: unknown[]) => MatcherResult;
  toEqual: (...args: unknown[]) => MatcherResult;
  toStrictEqual: (...args: unknown[]) => MatcherResult;
  toHaveLength: (...args: unknown[]) => MatcherResult;
  toContain: (...args: unknown[]) => MatcherResult;
  toContainEqual: (...args: unknown[]) => MatcherResult;
  toBeTruthy: (...args: unknown[]) => MatcherResult;
  toBeFalsy: (...args: unknown[]) => MatcherResult;
  toBeDefined: (...args: unknown[]) => MatcherResult;
  toBeUndefined: (...args: unknown[]) => MatcherResult;
  toBeNull: (...args: unknown[]) => MatcherResult;
  toThrow: (...args: unknown[]) => MatcherResult;
  toMatch: (...args: unknown[]) => MatcherResult;
  toHaveBeenCalled: (...args: unknown[]) => MatcherResult;
  toHaveBeenCalledWith: (...args: unknown[]) => MatcherResult;
  toHaveBeenCalledTimes: (...args: unknown[]) => MatcherResult;
  toHaveBeenCalledOnce: (...args: unknown[]) => MatcherResult;
  toBeInTheDocument: (...args: unknown[]) => MatcherResult;
  toHaveValue: (...args: unknown[]) => MatcherResult;
  toHaveAttribute: (...args: unknown[]) => MatcherResult;
  toHaveClass: (...args: unknown[]) => MatcherResult;
  toBeInstanceOf: (...args: unknown[]) => MatcherResult;
  toBeLessThan: (...args: unknown[]) => MatcherResult;
  toBeGreaterThan: (...args: unknown[]) => MatcherResult;
  toBeGreaterThanOrEqual: (...args: unknown[]) => MatcherResult;
  toMatchObject: (...args: unknown[]) => MatcherResult;
};
type ExpectFn = {
  (actual: unknown): MatcherChain;
  any: (value: unknown) => unknown;
  anything: () => unknown;
  arrayContaining: (value: readonly unknown[]) => unknown;
  objectContaining: (value: Record<string, unknown>) => unknown;
  stringContaining: (value: string) => unknown;
  stringMatching: (value: string | RegExp) => unknown;
  extend: (value: Record<string, unknown>) => void;
};

declare global {
  var __zukaMockRegistry: MockRegistry | undefined;
  var __zukaMockCache: Map<string, unknown> | undefined;
}

rawExpect.extend(matchers);
rawExpect.extend({
  toHaveBeenCalledOnce(received: unknown) {
    const calls = (received as { mock?: { calls?: unknown[] } }).mock?.calls;
    const pass = Array.isArray(calls) && calls.length === 1;
    return {
      pass,
      message: () =>
        `expected mock to have been called once, received ${Array.isArray(calls) ? calls.length : "non-mock"}`,
    };
  },
});

const expect = rawExpect as unknown as ExpectFn;

globalThis.__zukaMockRegistry ??= new Map();
globalThis.__zukaMockCache ??= new Map();

function withSequentialOptions<T extends (...args: never[]) => unknown>(runner: T): T {
  return ((name: string, optionsOrFn?: unknown, fn?: unknown) => {
    if (typeof optionsOrFn === "function" || optionsOrFn === undefined) {
      return Reflect.apply(
        runner,
        undefined,
        fn === undefined
          ? [name, { concurrency: false }, optionsOrFn]
          : [name, { concurrency: false }, optionsOrFn, fn],
      );
    }
    if (optionsOrFn && typeof optionsOrFn === "object") {
      return Reflect.apply(runner, undefined, [
        name,
        { ...(optionsOrFn as Record<string, unknown>), concurrency: false },
        fn,
      ]);
    }
    return Reflect.apply(runner, undefined, [name, optionsOrFn, fn]);
  }) as unknown as T;
}

const test = withSequentialOptions(nodeTest as unknown as (...args: never[]) => unknown) as TestRunner;
const it = withSequentialOptions(nodeIt as unknown as (...args: never[]) => unknown) as TestRunner;
const describe = withSequentialOptions(
  nodeDescribe as unknown as (...args: never[]) => unknown,
) as SuiteRunner;

const mocks = new Set<MockedFunction<MockImpl>>();
const restoreCallbacks = new Set<() => void>();
const envStubs = new Map<string, string | undefined>();
const globalStubs = new Map<PropertyKey, { existed: boolean; value: unknown }>();

function createMockFunction<T extends MockImpl = DefaultMockImpl>(impl?: T): MockedFunction<T> {
  let currentImpl: MockImpl | undefined = impl;
  const onceImpls: MockImpl[] = [];

  const fn = function mockFn(this: unknown, ...args: unknown[]) {
    fn.mock.calls.push(args);
    const nextImpl = onceImpls.shift() ?? currentImpl;
    return nextImpl?.apply(this, args as never[]);
  } as unknown as MockedFunction<T>;

  fn._isMockFunction = true;
  fn.getMockName = () => "mockFn";
  fn.mock = { calls: [] };
  fn.mockClear = () => {
    fn.mock.calls.length = 0;
    return fn;
  };
  fn.mockReset = () => {
    fn.mockClear();
    currentImpl = undefined;
    onceImpls.length = 0;
    return fn;
  };
  fn.mockRestore = fn.mockReset;
  fn.mockImplementation = <U extends MockImpl>(nextImpl: U) => {
    currentImpl = nextImpl;
    return fn as unknown as MockedFunction<U>;
  };
  fn.mockImplementationOnce = <U extends MockImpl>(nextImpl: U) => {
    onceImpls.push(nextImpl);
    return fn as unknown as MockedFunction<U>;
  };
  fn.mockReturnValue = (value: unknown) => {
    currentImpl = (() => value) as MockImpl;
    return fn;
  };
  fn.mockReturnValueOnce = (value: unknown) => {
    onceImpls.push((() => value) as MockImpl);
    return fn;
  };
  fn.mockResolvedValue = (value: unknown) => {
    currentImpl = (() => Promise.resolve(value)) as MockImpl;
    return fn;
  };
  fn.mockResolvedValueOnce = (value: unknown) => {
    onceImpls.push((() => Promise.resolve(value)) as MockImpl);
    return fn;
  };
  fn.mockRejectedValue = (value: unknown) =>
    fn.mockImplementation((() => Promise.reject(value)) as MockImpl) as MockedFunction<MockImpl>;
  fn.mockRejectedValueOnce = (value: unknown) =>
    fn.mockImplementationOnce((() => Promise.reject(value)) as MockImpl) as MockedFunction<MockImpl>;

  mocks.add(fn as unknown as MockedFunction<MockImpl>);
  return fn;
}

function registerMock(specifier: string, factory: MockFactory) {
  globalThis.__zukaMockRegistry?.set(specifier, factory);
  globalThis.__zukaMockCache?.delete(specifier);
  const importOriginal: ImportOriginal = async () => ({}) as never;
  const value = factory(importOriginal);
  if (value instanceof Promise) {
    value.then((resolved) => {
      globalThis.__zukaMockCache?.set(specifier, resolved);
    });
  } else {
    globalThis.__zukaMockCache?.set(specifier, value);
  }
}

function spyOn<T extends object, K extends keyof T>(target: T, key: K) {
  const original = target[key];
  const mock = createMockFunction(
    typeof original === "function"
      ? (((...args: never[]) =>
          (original as (...innerArgs: never[]) => unknown).apply(target, args)) as MockImpl)
      : undefined,
  );
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value: mock,
  });
  const restore = () => {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value: original,
    });
  };
  mock.mockRestore = () => {
    restore();
    return mock;
  };
  restoreCallbacks.add(restore);
  return mock;
}

function stubEnv(key: string, value: string) {
  if (!envStubs.has(key)) envStubs.set(key, process.env[key]);
  process.env[key] = value;
}

function unstubAllEnvs() {
  for (const [key, value] of envStubs) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  envStubs.clear();
}

function stubGlobal(key: PropertyKey, value: unknown) {
  if (!globalStubs.has(key)) {
    globalStubs.set(key, {
      existed: Object.hasOwn(globalThis, key),
      value: Reflect.get(globalThis, key),
    });
  }
  Reflect.set(globalThis, key, value);
}

function unstubAllGlobals() {
  for (const [key, original] of globalStubs) {
    if (original.existed) Reflect.set(globalThis, key, original.value);
    else Reflect.deleteProperty(globalThis, key);
  }
  globalStubs.clear();
}

const hoisted = <T>(factory: () => T) => factory();
const mocked = <T>(value: T) => value;
const clearAllMocks = () => {
  for (const mock of mocks) mock.mockClear();
};
const resetAllMocks = () => {
  for (const mock of mocks) mock.mockReset();
};
const restoreAllMocks = () => {
  for (const restore of restoreCallbacks) restore();
  restoreCallbacks.clear();
  for (const mock of mocks) mock.mockRestore();
  unstubAllEnvs();
  unstubAllGlobals();
};

export {
  after,
  afterEach,
  before,
  beforeEach,
  clearAllMocks,
  describe,
  expect,
  hoisted,
  it,
  createMockFunction as mockFn,
  registerMock as mockModule,
  mocked,
  resetAllMocks,
  restoreAllMocks,
  spyOn,
  stubEnv,
  stubGlobal,
  test,
  unstubAllEnvs,
  unstubAllGlobals,
};
