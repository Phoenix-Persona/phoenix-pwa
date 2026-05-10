import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PpqAccount } from "@/lib/ppq/types";
import { usePpqAccount } from "./usePpqAccount";

const mocks = vi.hoisted(() => {
  let stored: PpqAccount | null = null;
  const operator = {
    envelope: undefined as { ppq?: PpqAccount } | undefined,
    event: undefined as unknown,
    ensureWithPpq: vi.fn(),
  };

  return {
    createAccount: vi.fn(),
    getBalance: vi.fn(),
    readEnv: vi.fn(),
    operator,
    load: vi.fn(() => stored),
    save: vi.fn((account: PpqAccount) => {
      stored = account;
    }),
    clear: vi.fn(() => {
      stored = null;
    }),
    setStored(account: PpqAccount | null) {
      stored = account;
    },
  };
});

vi.mock("@/lib/ppq/client", () => ({
  createAccount: mocks.createAccount,
  getBalance: mocks.getBalance,
}));

vi.mock("@/lib/ppq/storage", () => ({
  ppqAccountStore: {
    load: mocks.load,
    save: mocks.save,
    clear: mocks.clear,
  },
}));

vi.mock("@/lib/env", () => ({
  readEnv: mocks.readEnv,
}));

vi.mock("./useOperatorEnvelope", () => ({
  useOperatorEnvelope: () => mocks.operator,
}));

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("usePpqAccount", () => {
  beforeEach(() => {
    mocks.setStored(null);
    mocks.operator.envelope = undefined;
    mocks.operator.event = undefined;
    mocks.operator.ensureWithPpq.mockReset().mockResolvedValue(undefined);
    mocks.createAccount.mockReset();
    mocks.getBalance.mockReset().mockResolvedValue({ balance_usd: 0, raw: {} });
    mocks.readEnv.mockReset().mockReturnValue(undefined);
    mocks.load.mockClear();
    mocks.save.mockClear();
    mocks.clear.mockClear();
  });

  it("returns a freshly created account immediately after ensureAccount resolves", async () => {
    const fresh = { api_key: "api-new", credit_id: "credit-new" };
    mocks.createAccount.mockResolvedValue(fresh);

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(fresh);
    });

    await waitFor(() => expect(result.current.account).toEqual(fresh));
    expect(mocks.save).toHaveBeenCalledWith(fresh);
  });

  it("clears the local account from query state when signOut is called", async () => {
    const cached = { api_key: "api-cached", credit_id: "credit-cached" };
    mocks.setStored(cached);

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await waitFor(() => expect(result.current.account).toEqual(cached));

    act(() => {
      result.current.signOut();
    });

    await waitFor(() => expect(result.current.account).toBeNull());
    expect(mocks.clear).toHaveBeenCalled();
  });

  it("lifts a cached account into the operator envelope without blocking reads", async () => {
    const cached = { api_key: "api-cached", credit_id: "credit-cached" };
    mocks.setStored(cached);
    mocks.operator.event = { id: "operator-event" };

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await waitFor(() => expect(result.current.account).toEqual(cached));

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(cached);
    });

    expect(mocks.operator.ensureWithPpq).toHaveBeenCalledWith(cached);
  });
});
