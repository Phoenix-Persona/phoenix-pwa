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
  getQueryHistory: vi.fn(),
  runAutoTopupOnce: vi.fn(),
  runManualTopupOnce: vi.fn(),
  refreshOperatorInfo: vi.fn(),
  refreshOperatorPayments: vi.fn(),
  refreshBalance: vi.fn(),
  ppq: {
    account: null as { api_key: string; credit_id: string } | null,
    balance: undefined as { balance_usd: number } | undefined,
    isBalanceLoading: false,
  },
}));

vi.mock("@/lib/ppq/client", () => ({
  getQueryHistory: mocks.getQueryHistory,
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
  runManualTopupOnce: mocks.runManualTopupOnce,
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
    mocks.getQueryHistory.mockReset().mockResolvedValue({ data: [] });
    mocks.runAutoTopupOnce.mockReset().mockResolvedValue({
      toppedUpUsd: 4,
      invoiceId: "invoice_123",
      paymentRequest: "lnbc1topup",
      status: "Settled",
    });
    mocks.runManualTopupOnce.mockReset().mockResolvedValue({
      toppedUpUsd: 12,
      invoiceId: "invoice_manual",
      paymentRequest: "lnbc1manual",
      status: "Settled",
    });
    mocks.refreshOperatorInfo.mockReset();
    mocks.refreshOperatorPayments.mockReset();
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

  it("manual PPQ top-up pays the requested USD amount and refreshes balances", async () => {
    mocks.ppq.account = {
      api_key: "ppq_api_key",
      credit_id: "credit_123",
    };
    mocks.ppq.balance = { balance_usd: 8 };
    const { result } = renderHook(
      () =>
        useWallet({
          walletId: "persona:abc",
          mnemonic:
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.handle).toBeDefined());
    await result.current.manualTopup(12);

    expect(mocks.runManualTopupOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet: { id: "wallet" },
        ppqApiKey: "ppq_api_key",
        amountUsd: 12,
      }),
    );
    expect(mocks.refreshBalance).toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.listRecentPayments.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it("funds PPQ auto-topups from the operator wallet when selected", async () => {
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
          autoTopup: {
            enabled: true,
            thresholdUsd: 5,
            topupAmountUsd: 12,
            fundingSource: "operator",
          },
          operatorFundingWallet: {
            handle: { id: "operator-wallet" } as never,
            walletId: "operator:abc",
            label: "Operator",
            refreshInfo: mocks.refreshOperatorInfo,
            refreshPayments: mocks.refreshOperatorPayments,
          },
        }),
      { wrapper },
    );

    await waitFor(() =>
      expect(mocks.runAutoTopupOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          wallet: { id: "operator-wallet" },
          config: expect.objectContaining({ fundingSource: "operator" }),
        }),
      ),
    );
    await waitFor(() => expect(mocks.refreshOperatorInfo).toHaveBeenCalled());
    expect(mocks.refreshOperatorPayments).toHaveBeenCalled();
  });

  it("manual PPQ top-up can use an explicit operator funding source", async () => {
    mocks.ppq.account = {
      api_key: "ppq_api_key",
      credit_id: "credit_123",
    };
    mocks.ppq.balance = { balance_usd: 8 };
    const { result } = renderHook(
      () =>
        useWallet({
          walletId: "persona:abc",
          mnemonic:
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
          operatorFundingWallet: {
            handle: { id: "operator-wallet" } as never,
            walletId: "operator:abc",
            label: "Operator",
            refreshInfo: mocks.refreshOperatorInfo,
            refreshPayments: mocks.refreshOperatorPayments,
          },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.handle).toBeDefined());
    await result.current.manualTopup(12, "operator");

    expect(mocks.runManualTopupOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet: { id: "operator-wallet" },
        amountUsd: 12,
      }),
    );
  });
});
