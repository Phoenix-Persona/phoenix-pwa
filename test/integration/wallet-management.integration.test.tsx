import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useNostrLogin } from "@nostrify/react/login";
import {
  afterEach,
  beforeEach,
  clearAllMocks,
  describe,
  expect,
  hoisted,
  it,
  mockFn,
  mockModule,
} from "@/test/api";

import { OperatorWalletInit } from "@/components/OperatorWalletInit";
import { useOperatorEnvelope } from "@/hooks/useOperatorEnvelope";
import { useOperatorWallet } from "@/hooks/useOperatorWallet";
import type { WalletHandle } from "@/lib/wallet/types";

import {
  loginFor,
  operatorEnvelopeEvent,
  testKeys,
} from "./fixtures/nostr";
import { createRelayHarness, type RelayHarness } from "./harness/renderWithRelay";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ALT_MNEMONIC =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";

const walletMocks = hoisted(() => ({
  generateMnemonic: mockFn(async () => MNEMONIC),
  connectWallet: mockFn(async ({ mnemonic }: { mnemonic: string }) =>
    ({ id: `wallet-handle:${mnemonic}` }) as unknown as WalletHandle
  ),
  disconnectWallet: mockFn(async () => undefined),
  loadWalletInfo: mockFn(async () => ({
    balanceSats: 12_345,
    balanceUsd: 7.89,
    lightningAddress: undefined,
    lnurl: undefined,
  })),
  listRecentPayments: mockFn(async () => [
    {
      id: "payment-1",
      type: "receive",
      amountSats: 250,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      status: "settled",
      description: "fixture receive",
    },
  ]),
  receiveBolt11: mockFn(async () => ({
    paymentRequest: "lnbc1receive",
    amountSats: 100,
  })),
  sendBolt11: mockFn(async () => ({
    id: "sent-1",
    paymentHash: "hash-1",
    amountSats: 100,
    feeSats: 1,
  })),
}));

mockModule("@/lib/wallet/client", () => ({
  generateMnemonic: walletMocks.generateMnemonic,
  connectWallet: walletMocks.connectWallet,
  disconnectWallet: walletMocks.disconnectWallet,
  loadWalletInfo: walletMocks.loadWalletInfo,
  listRecentPayments: walletMocks.listRecentPayments,
  receiveBolt11: walletMocks.receiveBolt11,
  sendBolt11: walletMocks.sendBolt11,
}));

describe("wallet management integration", () => {
  let harness: RelayHarness | undefined;

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await harness?.cleanup();
    harness = undefined;
  });

  it("auto-mints an operator wallet envelope on first login", async () => {
    harness = await createRelayHarness({
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
    });

    render(
      <>
        <OperatorWalletInit />
        <OperatorEnvelopeProbe />
      </>,
      { wrapper: harness.wrapper },
    );

    await waitFor(() =>
      expect(screen.getByTestId("operator-seed").textContent).toBe(
        MNEMONIC,
      ),
    );

    const operatorEvents = harness.relay.getEvents({
      authors: [testKeys.operator.pubkey],
      kinds: [30078],
    });
    expect(operatorEvents).toHaveLength(1);
    expect(walletMocks.generateMnemonic).toHaveBeenCalledOnce();
  });

  it("reuses an existing operator wallet envelope without minting a replacement", async () => {
    const existing = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
    });
    harness = await createRelayHarness({
      events: [existing.event],
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
    });

    render(
      <>
        <OperatorWalletInit />
        <OperatorEnvelopeProbe />
      </>,
      { wrapper: harness.wrapper },
    );

    await waitFor(() =>
      expect(screen.getByTestId("operator-seed").textContent).toBe(
        MNEMONIC,
      ),
    );
    expect(walletMocks.generateMnemonic).not.toHaveBeenCalled();
    expect(
      harness.relay.getEvents({
        authors: [testKeys.operator.pubkey],
        kinds: [30078],
      }),
    ).toHaveLength(1);
  });

  it("connects the operator wallet and performs receive/send operations through Spark boundary mocks", async () => {
    const existing = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
    });
    harness = await createRelayHarness({
      events: [existing.event],
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
    });

    const { result } = renderHook(() => useOperatorWallet(), {
      wrapper: harness.wrapper,
    });

    await waitFor(() => expect(result.current.wallet.handle).toBeDefined());
    await waitFor(() =>
      expect(result.current.wallet.info?.balanceSats).toBe(12_345),
    );
    await waitFor(() =>
      expect(result.current.wallet.payments?.[0]?.id).toBe("payment-1"),
    );

    await act(async () => {
      await expect(result.current.wallet.receive({ amountSats: 100 })).resolves.toEqual(
        expect.objectContaining({ paymentRequest: "lnbc1receive" }),
      );
      await expect(
        result.current.wallet.send({ paymentRequest: "lnbc1receive" }),
      ).resolves.toEqual(expect.objectContaining({ paymentHash: "hash-1" }));
    });

    expect(walletMocks.connectWallet).toHaveBeenCalledWith({
      mnemonic: MNEMONIC,
    });
    expect(walletMocks.receiveBolt11).toHaveBeenCalledOnce();
    expect(walletMocks.sendBolt11).toHaveBeenCalledOnce();
  });

  it("switches operator wallet state without exposing the previous operator seed or handle", async () => {
    const first = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
    });
    const second = await operatorEnvelopeEvent({
      operator: testKeys.operatorAlt,
      wallet: { kind: "spark", seed: ALT_MNEMONIC },
    });
    harness = await createRelayHarness({
      events: [first.event, second.event],
      logins: [loginFor(testKeys.operator), loginFor(testKeys.operatorAlt)],
      queryClient: testQueryClient(),
    });

    render(<OperatorWalletSwitchProbe />, { wrapper: harness.wrapper });

    await waitFor(() =>
      expect(screen.getByTestId("operator-seed").textContent).toBe(MNEMONIC),
    );
    await waitFor(() =>
      expect(screen.getByTestId("wallet-handle").textContent).toBe(
        `wallet-handle:${MNEMONIC}`,
      ),
    );

    act(() => {
      screen.getByRole("button", { name: "Switch operator" }).click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("operator-seed").textContent).toBe(ALT_MNEMONIC),
    );
    await waitFor(() =>
      expect(screen.getByTestId("wallet-handle").textContent).toBe(
        `wallet-handle:${ALT_MNEMONIC}`,
      ),
    );
    expect(screen.getByTestId("wallet-handle").textContent).not.toBe(
      `wallet-handle:${MNEMONIC}`,
    );
    expect(walletMocks.disconnectWallet).toHaveBeenCalled();
  });

  it("does not persist an operator envelope or retry-loop when auto-mint fails", async () => {
    walletMocks.generateMnemonic.mockRejectedValueOnce(
      new Error("mnemonic generation failed"),
    );
    harness = await createRelayHarness({
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
    });

    render(
      <>
        <OperatorWalletInit />
        <OperatorEnvelopeProbe />
      </>,
      { wrapper: harness.wrapper },
    );

    await waitFor(() =>
      expect(walletMocks.generateMnemonic).toHaveBeenCalledOnce(),
    );
    expect(screen.getByTestId("operator-seed").textContent).toBe("none");
    expect(
      harness.relay.getEvents({
        authors: [testKeys.operator.pubkey],
        kinds: [30078],
      }),
    ).toHaveLength(0);
  });

  it("surfaces Spark connect failures without attaching a wallet handle", async () => {
    walletMocks.connectWallet.mockRejectedValueOnce(
      new Error("Spark connect failed"),
    );
    const existing = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
    });
    harness = await createRelayHarness({
      events: [existing.event],
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
    });

    const { result } = renderHook(() => useOperatorWallet(), {
      wrapper: harness.wrapper,
    });

    await waitFor(() =>
      expect(result.current.wallet.connectError?.message).toBe(
        "Spark connect failed",
      ),
    );
    expect(result.current.wallet.handle).toBeUndefined();
  });
});

function OperatorEnvelopeProbe() {
  const operator = useOperatorEnvelope();
  return (
    <output data-testid="operator-seed">
      {operator.envelope?.wallet?.seed ?? "none"}
    </output>
  );
}

function OperatorWalletSwitchProbe() {
  const { setLogin } = useNostrLogin();
  const operatorWallet = useOperatorWallet();
  const handle = operatorWallet.wallet.handle as { id?: string } | undefined;
  return (
    <>
      <button
        type="button"
        onClick={() => setLogin(loginFor(testKeys.operatorAlt).id)}
      >
        Switch operator
      </button>
      <output data-testid="operator-seed">{operatorWallet.seed ?? "none"}</output>
      <output data-testid="wallet-handle">{handle?.id ?? "none"}</output>
    </>
  );
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}
