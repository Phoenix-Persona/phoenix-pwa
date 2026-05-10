import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWallet } from "./useWallet";

const mocks = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  listRecentPayments: vi.fn(),
  loadWalletInfo: vi.fn(),
  receiveBolt11: vi.fn(),
  sendBolt11: vi.fn(),
  runAutoTopupOnce: vi.fn(),
  refreshBalance: vi.fn(),
  ppq: {
    account: null as { api_key: string; credit_id: string } | null,
    balance: undefined as { balance_usd: number } | undefined,
    isBalanceLoading: false,
  },
}));

vi.mock("@/lib/wallet/client", () => ({
  connectWallet: mocks.connectWallet,
  disconnectWallet: mocks.disconnectWallet,
  listRecentPayments: mocks.listRecentPayments,
  loadWalletInfo: mocks.loadWalletInfo,
  receiveBolt11: mocks.receiveBolt11,
  sendBolt11: mocks.sendBolt11,
}));

vi.mock("@/lib/wallet/autoTopup", () => ({
  runAutoTopupOnce: mocks.runAutoTopupOnce,
}));

vi.mock("./usePpqAccount", () => ({
  usePpqAccount: () => ({
    account: mocks.ppq.account,
    balance: mocks.ppq.balance,
    isBalanceLoading: mocks.ppq.isBalanceLoading,
    refreshBalance: mocks.refreshBalance,
  }),
}));

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useWallet", () => {
  beforeEach(() => {
    mocks.connectWallet.mockReset().mockResolvedValue({ id: "wallet" });
    mocks.disconnectWallet.mockReset().mockResolvedValue(undefined);
    mocks.listRecentPayments.mockReset().mockResolvedValue([]);
    mocks.loadWalletInfo.mockReset().mockResolvedValue({
      balanceSats: 10_000,
      raw: {},
    });
    mocks.receiveBolt11.mockReset();
    mocks.sendBolt11.mockReset();
    mocks.runAutoTopupOnce.mockReset().mockResolvedValue({
      toppedUpUsd: 4,
      invoiceId: "invoice_123",
      paymentRequest: "lnbc1topup",
      status: "Settled",
    });
    mocks.refreshBalance.mockReset();
    mocks.ppq.account = null;
    mocks.ppq.balance = undefined;
    mocks.ppq.isBalanceLoading = false;
  });

  it("accepts a non-secret walletId separate from the mnemonic", async () => {
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
    await waitFor(() => expect(result.current.handle).toBeDefined());
  });

  it("refreshes payment history after PPQ auto-topup settles", async () => {
    mocks.ppq.account = {
      api_key: "ppq_api_key",
      credit_id: "credit_123",
    };
    mocks.ppq.balance = { balance_usd: 1 };

    renderHook(
      () =>
        useWallet({
          walletId: "persona:abc",
          mnemonic:
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        }),
      { wrapper },
    );

    await waitFor(() => expect(mocks.runAutoTopupOnce).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.listRecentPayments.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });
});
