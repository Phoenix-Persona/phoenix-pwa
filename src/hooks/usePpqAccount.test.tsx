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
    isLoading: false,
    refetch: vi.fn(),
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
    currentUser: {
      user: { pubkey: "operator-pubkey" } as { pubkey: string } | undefined,
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

vi.mock("./useCurrentUser", () => ({
  useCurrentUser: () => mocks.currentUser,
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
    mocks.currentUser.user = { pubkey: "operator-pubkey" };
    mocks.operator.envelope = undefined;
    mocks.operator.event = undefined;
    mocks.operator.isLoading = false;
    mocks.operator.ensureWithPpq.mockReset().mockResolvedValue(undefined);
    mocks.operator.refetch.mockReset().mockResolvedValue({ data: null });
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

  it("clears local PPQ storage without deleting the operator envelope account", async () => {
    const operatorAccount = {
      api_key: "api-operator",
      credit_id: "credit-operator",
    };
    mocks.operator.envelope = { ppq: operatorAccount };

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await waitFor(() => expect(result.current.account).toEqual(operatorAccount));

    act(() => {
      result.current.signOut();
    });

    await waitFor(() => expect(result.current.account).toEqual(operatorAccount));
    expect(mocks.clear).toHaveBeenCalled();
  });

  it("does not attach a cached account to a different operator", async () => {
    const cached = { api_key: "api-cached", credit_id: "credit-cached" };
    const fresh = { api_key: "api-new", credit_id: "credit-new" };
    mocks.setStored(cached);
    mocks.operator.event = { id: "operator-event" };
    mocks.createAccount.mockResolvedValue(fresh);

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await waitFor(() => expect(result.current.account).toBeNull());

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(fresh);
    });

    expect(mocks.operator.ensureWithPpq).toHaveBeenCalledWith(fresh);
    expect(mocks.operator.ensureWithPpq).not.toHaveBeenCalledWith(cached);
  });

  it("waits for the operator envelope before minting a PPQ account", async () => {
    const operatorAccount = {
      api_key: "api-operator",
      credit_id: "credit-operator",
    };
    mocks.operator.isLoading = true;
    mocks.operator.refetch.mockResolvedValue({
      data: { envelope: { ppq: operatorAccount } },
    });

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(operatorAccount);
    });

    expect(mocks.createAccount).not.toHaveBeenCalled();
  });
});
