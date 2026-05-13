import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, mockFn, mockModule } from "@/test/api";

import { WalletPanel } from "./WalletPanel";
import { WalletDialog } from "./WalletDialog";
import type { UseWalletResult } from "@/hooks/useWallet";

mockModule("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mockFn() }),
}));

mockModule("@/components/ui/qrcode", () => ({
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
    refreshInfo: mockFn(),
    payments: [
      makePayment("receive", 4_000n, "receive-1"),
      makePayment("send", 1_500n, "send-1"),
    ],
    refreshPayments: mockFn(),
    receive: mockFn(),
    isReceiving: false,
    receiveError: undefined,
    send: mockFn(),
    isSending: false,
    sendError: undefined,
    ppqAccount: {
      credit_id: "credit_active_123",
      api_key: "ppq_live_secret_key",
    },
    rotatePpqAccount: mockFn().mockResolvedValue({
      credit_id: "credit_rotated_456",
      api_key: "ppq_live_rotated_key",
    }),
    isPpqRotating: false,
    ppqRotateError: undefined,
    ppqBalanceUsd: 4.25,
    isPpqBalanceLoading: false,
    refreshPpqBalance: mockFn(),
    autoTopup: {
      enabled: true,
      thresholdUsd: 5,
      topupAmountUsd: 10,
      fundingSource: "persona",
    },
    setAutoTopup: mockFn(),
    autoTopupRun: {
      isRunning: false,
      lastResult: {
        toppedUpUsd: 5.75,
        invoiceId: "invoice_123",
        paymentRequest: "lnbc1topup",
        status: "Settled",
      },
    },
    triggerAutoTopup: mockFn(),
    fundingSources: [
      { source: "operator", label: "Operator", isAvailable: true },
      { source: "persona", label: "Persona", isAvailable: true },
    ],
    manualTopup: mockFn().mockResolvedValue({
      toppedUpUsd: 15,
      invoiceId: "invoice_manual",
      paymentRequest: "lnbc1manual",
      status: "Settled",
    }),
    isManualTopupRunning: false,
    manualTopupError: undefined,
    manualTopupResult: undefined,
    ppqQueryHistory: [
      {
        timestamp: "2026-05-10T12:00:00.000Z",
        model: "claude-sonnet-4.5",
        input_count: 100,
        output_count: 50,
        price_in_usd: 0.0123,
        query_type: "chat",
        query_source: "api",
        api_key_id: "key_123",
      },
    ],
    isPpqQueryHistoryLoading: false,
    ppqQueryHistoryError: undefined,
    refreshPpqQueryHistory: mockFn(),
    ...overrides,
  };
}

function renderWallet(
  wallet = makeWallet(),
  props: Partial<ComponentProps<typeof WalletPanel>> = {},
) {
  render(
    <MemoryRouter>
      <WalletPanel wallet={wallet} editPersonaHref="/edit" {...props} />
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
        writeText: mockFn(),
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

  it("saves edited auto top-up threshold and amount", async () => {
    const wallet = makeWallet();
    const onAutoTopupSave = mockFn().mockResolvedValue(undefined);
    renderWallet(wallet, { onAutoTopupSave });

    activateTab(/ai credits/i);
    fireEvent.change(screen.getByLabelText(/auto below/i), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText(/^buy$/i), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(wallet.setAutoTopup).toHaveBeenCalledWith({
        enabled: true,
        thresholdUsd: 7,
        topupAmountUsd: 15,
        fundingSource: "persona",
      }),
    );
    expect(onAutoTopupSave).toHaveBeenCalledWith({
      enabled: true,
      thresholdUsd: 7,
      topupAmountUsd: 15,
      fundingSource: "persona",
    });
  });

  it("saves the selected PPQ funding source", async () => {
    const wallet = makeWallet();
    const onAutoTopupSave = mockFn().mockResolvedValue(undefined);
    renderWallet(wallet, { onAutoTopupSave });

    activateTab(/ai credits/i);
    fireEvent.click(screen.getByRole("button", { name: /fund from operator/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(wallet.setAutoTopup).toHaveBeenCalledWith(
        expect.objectContaining({ fundingSource: "operator" }),
      ),
    );
    expect(onAutoTopupSave).toHaveBeenCalledWith(
      expect.objectContaining({ fundingSource: "operator" }),
    );
  });

  it("renders compact PPQ top-up controls", () => {
    renderWallet();

    activateTab(/ai credits/i);

    expect(screen.getByLabelText(/auto below/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^buy$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /fund from persona/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/buy ppq credits from this persona's lightning wallet/i),
    ).not.toBeInTheDocument();
  });

  it("manually tops up PPQ credits with a specific USD amount", async () => {
    const wallet = makeWallet();
    renderWallet(wallet);

    activateTab(/ai credits/i);
    fireEvent.change(screen.getByLabelText(/manual top-up/i), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: /top up now/i }));

    await waitFor(() =>
      expect(wallet.manualTopup).toHaveBeenCalledWith(20, "persona"),
    );
  });

  it("manually tops up PPQ credits from the selected operator source", async () => {
    const wallet = makeWallet();
    renderWallet(wallet);

    activateTab(/ai credits/i);
    fireEvent.click(screen.getByRole("button", { name: /fund from operator/i }));
    fireEvent.change(screen.getByLabelText(/manual top-up/i), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: /top up now/i }));

    await waitFor(() =>
      expect(wallet.manualTopup).toHaveBeenCalledWith(20, "operator"),
    );
  });

  it("shows PPQ usage activity instead of Lightning activity on the PPQ tab", () => {
    renderWallet();

    activateTab(/ai credits/i);

    expect(screen.getByText("Recent PPQ usage")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4.5")).toBeInTheDocument();
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    expect(screen.queryByText(/1,500 sats/i)).not.toBeInTheDocument();
  });

  it("hides Lightning Address details for the operator wallet", () => {
    renderWallet(makeWallet(), { walletScope: "operator" });

    expect(screen.getByText("12,345 sats")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /receive/i })).toBeInTheDocument();
    expect(screen.queryByText("Lightning Address")).not.toBeInTheDocument();
    expect(screen.queryByText("voice@breez.tips")).not.toBeInTheDocument();
    expect(screen.queryByTestId("qr-code")).not.toBeInTheDocument();
  });

  it("shows operator envelope diagnostics only for the operator wallet", () => {
    const { unmount } = render(
      <MemoryRouter>
        <WalletPanel
          wallet={makeWallet()}
          walletScope="operator"
          operatorDiagnostics={{
            hasEnvelopeEvent: true,
            hasWalletBackup: true,
            hasPpqBackup: true,
          }}
        />
      </MemoryRouter>,
    );

    activateTab(/ai credits/i);

    expect(screen.getByText("Operator backup status")).toBeInTheDocument();
    expect(screen.getByText("Backup event found")).toBeInTheDocument();
    expect(screen.getByText("Wallet seed backed up")).toBeInTheDocument();
    expect(screen.getByText("AI credentials backed up")).toBeInTheDocument();

    unmount();
    renderWallet(makeWallet(), { walletScope: "persona" });
    expect(screen.queryByText("Operator backup status")).not.toBeInTheDocument();
  });

  it("rotates PPQ credentials from the operator wallet", async () => {
    const wallet = makeWallet();
    renderWallet(wallet, { walletScope: "operator" });

    activateTab(/ai credits/i);
    fireEvent.click(screen.getByRole("button", { name: /rotate ppq credentials/i }));

    await waitFor(() => expect(wallet.rotatePpqAccount).toHaveBeenCalledOnce());
  });
});

describe("WalletDialog", () => {
  it("uses operator-specific description copy for the operator wallet", () => {
    render(
      <MemoryRouter>
        <WalletDialog
          wallet={makeWallet()}
          walletScope="operator"
          open
          onOpenChange={mockFn()}
          personaName="Operator"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Operator's wallet")).toBeInTheDocument();
    expect(screen.getByText(/operator Spark Lightning wallet/i)).toBeInTheDocument();
    expect(screen.queryByText(/donations land here/i)).not.toBeInTheDocument();
  });

  it("bounds wallet content to a scrollable dialog body", () => {
    render(
      <MemoryRouter>
        <WalletDialog
          wallet={makeWallet()}
          open
          onOpenChange={mockFn()}
          personaName="Voice"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("max-h-[min(90vh,760px)]");
    expect(screen.getByTestId("wallet-dialog-body")).toHaveClass(
      "overflow-y-auto",
    );
  });
});
