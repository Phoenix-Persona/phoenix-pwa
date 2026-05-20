import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, mockFn, hoisted, mockModule } from "@/test/api";

import type { PpqAccount } from "@/lib/ppq/types";
import { usePpqAccount } from "./usePpqAccount";

const mocks = hoisted(() => {
  const operator = {
    envelope: undefined as { ppq?: PpqAccount } | undefined,
    event: undefined as unknown,
    ensureWithPpq: mockFn(),
    isLoading: false,
    refetch: mockFn(),
  };

  return {
    createAccount: mockFn(),
    getBalance: mockFn(),
    readEnv: mockFn(),
    readDevEnv: mockFn(),
    operator,
    currentUser: {
      user: { pubkey: "operator-pubkey" } as { pubkey: string } | undefined,
    },
  };
});

mockModule("@/lib/ppq/client", () => ({
  createAccount: mocks.createAccount,
  getBalance: mocks.getBalance,
}));

mockModule("@/lib/env", () => ({
  readEnv: mocks.readEnv,
  readDevEnv: mocks.readDevEnv,
}));

mockModule("./useOperatorEnvelope", () => ({
  useOperatorEnvelope: () => mocks.operator,
}));

mockModule("./useCurrentUser", () => ({
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
    window.localStorage.clear();
    mocks.currentUser.user = { pubkey: "operator-pubkey" };
    mocks.operator.envelope = undefined;
    mocks.operator.event = undefined;
    mocks.operator.isLoading = false;
    mocks.operator.ensureWithPpq.mockReset().mockResolvedValue(undefined);
    mocks.operator.refetch.mockReset().mockResolvedValue({ data: null });
    mocks.createAccount.mockReset();
    mocks.getBalance.mockReset().mockResolvedValue({ balance_usd: 0, raw: {} });
    mocks.readEnv.mockReset().mockReturnValue(undefined);
    mocks.readDevEnv.mockReset().mockReturnValue(undefined);
  });

  it("returns a freshly created account immediately after ensureAccount resolves", async () => {
    const fresh = { api_key: "api-new", credit_id: "credit-new" };
    mocks.createAccount.mockResolvedValue(fresh);

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(fresh);
    });

    await waitFor(() => expect(result.current.account).toEqual(fresh));
    expect(mocks.operator.ensureWithPpq).toHaveBeenCalledWith(fresh);
  });

  it("clears in-memory PPQ state without deleting the operator envelope account", async () => {
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
  });

  it("does not attach a legacy cached account to a different operator", async () => {
    const fresh = { api_key: "api-new", credit_id: "credit-new" };
    mocks.operator.event = { id: "operator-event" };
    mocks.createAccount.mockResolvedValue(fresh);
    window.localStorage.setItem(
      "phoenix:ppq:account",
      JSON.stringify({ api_key: "api-cached", credit_id: "credit-cached" }),
    );

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await waitFor(() => expect(result.current.account).toBeNull());

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(fresh);
    });

    expect(mocks.operator.ensureWithPpq).toHaveBeenCalledWith(fresh);
    expect(mocks.operator.ensureWithPpq).not.toHaveBeenCalledWith({
      api_key: "api-cached",
      credit_id: "credit-cached",
    });
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

  it("rotates to a freshly minted PPQ account for the current operator", async () => {
    const oldAccount = {
      api_key: "api-old",
      credit_id: "credit-old",
    };
    const fresh = {
      api_key: "api-new",
      credit_id: "credit-new",
    };
    mocks.operator.envelope = { ppq: oldAccount };
    mocks.createAccount.mockResolvedValue(fresh);

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await waitFor(() => expect(result.current.account).toEqual(oldAccount));

    await act(async () => {
      await expect(result.current.rotateAccount()).resolves.toEqual(fresh);
    });

    expect(mocks.operator.ensureWithPpq).toHaveBeenCalledWith(fresh);
    await waitFor(() => expect(result.current.account).toEqual(fresh));
  });

  it("uses only dev-scoped env credentials and otherwise mints per operator", async () => {
    const fresh = { api_key: "api-new", credit_id: "credit-new" };
    mocks.readEnv.mockImplementation((key: string) => {
      if (key === "VITE_PPQ_API_KEY") return "shared-prod-key";
      if (key === "VITE_PPQ_CREDIT_ID") return "shared-prod-credit";
      return undefined;
    });
    mocks.readDevEnv.mockReturnValue(undefined);
    mocks.createAccount.mockResolvedValue(fresh);

    const { result } = renderHook(() => usePpqAccount(), { wrapper });

    await waitFor(() => expect(result.current.account).toBeNull());

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(fresh);
    });

    expect(mocks.operator.ensureWithPpq).toHaveBeenCalledWith(fresh);
    expect(mocks.createAccount).toHaveBeenCalledOnce();
  });

  it("mints and persists a distinct persona PPQ account without touching the operator envelope", async () => {
    const fresh = { api_key: "api-persona", credit_id: "credit-persona" };
    const persistPersonaPpq = mockFn().mockResolvedValue(undefined);
    mocks.operator.envelope = {
      ppq: { api_key: "api-operator", credit_id: "credit-operator" },
    };
    mocks.createAccount.mockResolvedValue(fresh);

    const { result } = renderHook(
      () =>
        usePpqAccount({
          scope: "persona",
          ownerKey: "persona-pubkey",
          account: undefined,
          isLoading: false,
          persistAccount: persistPersonaPpq,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.account).toBeNull());

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(fresh);
    });

    expect(persistPersonaPpq).toHaveBeenCalledWith(fresh);
    expect(mocks.operator.ensureWithPpq).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.account).toEqual(fresh));
  });

  it("uses existing persona PPQ credentials instead of the operator credentials", async () => {
    const personaAccount = {
      api_key: "api-persona-existing",
      credit_id: "credit-persona-existing",
    };
    mocks.operator.envelope = {
      ppq: { api_key: "api-operator", credit_id: "credit-operator" },
    };

    const { result } = renderHook(
      () =>
        usePpqAccount({
          scope: "persona",
          ownerKey: "persona-pubkey",
          account: personaAccount,
          isLoading: false,
          persistAccount: mockFn().mockResolvedValue(undefined),
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.account).toEqual(personaAccount));

    await act(async () => {
      await expect(result.current.ensureAccount()).resolves.toEqual(personaAccount);
    });

    expect(mocks.createAccount).not.toHaveBeenCalled();
    expect(result.current.account).not.toEqual(mocks.operator.envelope.ppq);
  });
});
