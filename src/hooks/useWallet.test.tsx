import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import { useWallet } from "./useWallet";

vi.mock("@/lib/wallet/client", () => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  listRecentPayments: vi.fn(),
  loadWalletInfo: vi.fn(),
  receiveBolt11: vi.fn(),
  sendBolt11: vi.fn(),
}));

vi.mock("./usePpqAccount", () => ({
  usePpqAccount: () => ({
    account: null,
    balance: undefined,
    isBalanceLoading: false,
    refreshBalance: vi.fn(),
  }),
}));

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useWallet", () => {
  it("accepts a non-secret walletId separate from the mnemonic", () => {
    const { result } = renderHook(
      () =>
        useWallet({
          walletId: "persona:abc",
          mnemonic:
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        }),
      { wrapper },
    );

    expect(result.current).toBeDefined();
  });
});
