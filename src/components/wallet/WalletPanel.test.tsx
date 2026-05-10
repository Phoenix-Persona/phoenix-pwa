import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalletPanel } from "./WalletPanel";
import type { UseWalletResult } from "@/hooks/useWallet";

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/ui/qrcode", () => ({
  QRCodeCanvas: ({ value }: { value: string }) => (
    <div data-testid="qr-code">{value}</div>
  ),
}));

function makePayment(
  paymentType: "send" | "receive",
  amount: bigint,
  id: string = paymentType,
): NonNullable<UseWalletResult["payments"]>[number] {
  return {
    id,
    paymentType,
    status: "complete",
    amount,
    fees: 0n,
    timestamp: 1_700_000_000,
    method: { type: "bolt11Invoice" },
  } as unknown as NonNullable<UseWalletResult["payments"]>[number];
}

function makeWallet(
  overrides: Partial<UseWalletResult> = {},
): UseWalletResult {
  return {
    handle: {} as UseWalletResult["handle"],
    isConnecting: false,
    connectError: undefined,
    info: {
      balanceSats: 12_345,
      lightningAddress: "voice@breez.tips",
      lnurlPay: "lnurl1example",
      raw: {},
    } as UseWalletResult["info"],
    isInfoLoading: false,
    infoError: undefined,
    refreshInfo: vi.fn(),
    payments: [
      makePayment("receive", 4_000n, "receive-1"),
      makePayment("send", 1_500n, "send-1"),
    ],
    refreshPayments: vi.fn(),
    receive: vi.fn(),
    isReceiving: false,
    receiveError: undefined,
    send: vi.fn(),
    isSending: false,
    sendError: undefined,
    ppqAccount: {
      credit_id: "credit_active_123",
      api_key: "ppq_live_secret_key",
    },
    ppqBalanceUsd: 4.25,
    isPpqBalanceLoading: false,
    refreshPpqBalance: vi.fn(),
    autoTopup: {
      enabled: true,
      thresholdUsd: 5,
      targetUsd: 10,
    },
    setAutoTopup: vi.fn(),
    autoTopupRun: {
      isRunning: false,
      lastResult: {
        toppedUpUsd: 5.75,
        invoiceId: "invoice_123",
        paymentRequest: "lnbc1topup",
        status: "Settled",
      },
    },
    triggerAutoTopup: vi.fn(),
    ...overrides,
  };
}

function renderWallet(wallet = makeWallet()) {
  render(
    <MemoryRouter>
      <WalletPanel wallet={wallet} editPersonaHref="/edit" />
    </MemoryRouter>,
  );
}

function activateTab(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
  fireEvent.keyDown(tab, { key: "Enter", code: "Enter" });
}

describe("WalletPanel", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  it("separates Lightning and PPQ details into tabs", () => {
    renderWallet();

    expect(screen.getByRole("tab", { name: /lightning/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /ai credits/i })).toBeInTheDocument();
    expect(screen.getByText("12,345 sats")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /receive/i })).toBeInTheDocument();
    expect(screen.queryByText("AI credits (PPQ)")).not.toBeInTheDocument();

    activateTab(/ai credits/i);

    expect(screen.getByText("AI credits (PPQ)")).toBeInTheDocument();
    expect(screen.getByText("$4.25")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /receive/i })).not.toBeInTheDocument();
  });

  it("keeps the PPQ charge id and API key hidden until revealed", () => {
    renderWallet();

    activateTab(/ai credits/i);

    expect(screen.getByText("PPQ charge id")).toBeInTheDocument();
    expect(screen.getByText("API key")).toBeInTheDocument();
    expect(screen.queryByText("credit_active_123")).not.toBeInTheDocument();
    expect(screen.queryByText("ppq_live_secret_key")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show ppq charge id/i }));
    fireEvent.click(screen.getByRole("button", { name: /show ppq api key/i }));

    expect(screen.getByText("credit_active_123")).toBeInTheDocument();
    expect(screen.getByText("ppq_live_secret_key")).toBeInTheDocument();
  });
});
