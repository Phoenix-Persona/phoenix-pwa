import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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

import { usePersonaComposer } from "@/hooks/usePersonaComposer";
import { useWallet } from "@/hooks/useWallet";
import type { WalletHandle } from "@/lib/wallet/types";

import {
  loginFor,
  operatorEnvelopeEvent,
  personaEnvelopeEvent,
  testKeys,
} from "./fixtures/nostr";
import {
  createServicesHarness,
  type ServicesHarness,
} from "./harness/renderWithServices";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const walletMocks = hoisted(() => ({
  generateMnemonic: mockFn(async () => MNEMONIC),
  connectWallet: mockFn(async () => ({ id: "persona-wallet" }) as unknown as WalletHandle),
  disconnectWallet: mockFn(async () => undefined),
  loadWalletInfo: mockFn(async () => ({
    balanceSats: 25_000,
    lightningAddress: "persona@breez.tips",
    lnurlPay: "lnurl1persona",
    raw: {},
  })),
  listRecentPayments: mockFn(async () => []),
  receiveBolt11: mockFn(async () => ({
    paymentRequest: "lnbc1receive",
    feeSats: 0,
    raw: {},
  })),
  sendBolt11: mockFn(async () => ({
    raw: { id: "paid-topup" },
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

describe("AI usage integration", () => {
  let harness: ServicesHarness | undefined;

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await harness?.cleanup();
    harness = undefined;
  });

  it("styles text through PPQ and publishes the result as the persona", async () => {
    const operator = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
      ppq: { api_key: "api-voice", credit_id: "credit-voice" },
    });
    const persona = await personaEnvelopeEvent({
      operator: testKeys.operator,
      persona: testKeys.persona,
      name: "Amina Voice",
    });
    harness = await createServicesHarness({
      events: [operator.event, persona.event],
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
      withHttp: true,
    });
    if (!harness.http) throw new Error("HTTP harness was not started.");
    harness.http.on("POST", "/credits/balance", () => ({
      json: { balance_usd: 10 },
    }));
    harness.http.on("POST", "/chat/completions", (req) => ({
      json: {
        id: "chatcmpl-voice",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Styled in persona voice.",
            },
            finish_reason: "stop",
          },
        ],
        request: JSON.parse(req.bodyText),
      },
    }));

    const composer = renderHook(
      () =>
        usePersonaComposer({
          persona: persona.envelope.persona,
          stylingModel: "local-style-model",
          wallet: {
            refreshInfo: mockFn(),
            refreshPpqBalance: mockFn(),
          },
      }),
      { wrapper: harness.wrapper },
    );
    await waitFor(() => expect(composer.result.current).toBeTruthy());

    let styled: string | null = null;
    await act(async () => {
      styled = await composer.result.current.styleInVoice("plain operator draft");
    });
    expect(styled).toBe("Styled in persona voice.");
    expect(harness.http.requests[1]?.headers.authorization).toBe("Bearer api-voice");
    expect(JSON.parse(harness.http.requests[1]!.bodyText)).toEqual(
      expect.objectContaining({
        model: "local-style-model",
        messages: [
          {
            role: "system",
            content: persona.envelope.persona.system_prompt,
          },
          { role: "user", content: "plain operator draft" },
        ],
      }),
    );

    await act(async () => {
      await composer.result.current.publishTextOnly({
        text: styled!,
        sourcesInput: "https://example.test/source",
      });
    });

    const posts = harness.relay.getEvents({
      authors: [testKeys.persona.pubkey],
      kinds: [1],
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.content).toBe("Styled in persona voice.");
    expect(posts[0]?.tags).toContainEqual(["r", "https://example.test/source"]);
  });

  it("surfaces PPQ payment-required errors without publishing persona content", async () => {
    const operator = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
      ppq: { api_key: "api-empty", credit_id: "credit-empty" },
    });
    const persona = await personaEnvelopeEvent({
      operator: testKeys.operator,
      persona: testKeys.persona,
    });
    harness = await createServicesHarness({
      events: [operator.event, persona.event],
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
      withHttp: true,
    });
    if (!harness.http) throw new Error("HTTP harness was not started.");
    harness.http.on("POST", "/credits/balance", () => ({
      json: { balance_usd: 0 },
    }));
    harness.http.on("POST", "/chat/completions", () => ({
      status: 402,
      json: {
        error: {
          type: "payment_required",
          message: "insufficient balance",
        },
      },
    }));

    const composer = renderHook(
      () =>
        usePersonaComposer({
          persona: persona.envelope.persona,
          stylingModel: "local-style-model",
      }),
      { wrapper: harness.wrapper },
    );
    await waitFor(() => expect(composer.result.current).toBeTruthy());

    await act(async () => {
      await expect(
        composer.result.current.styleInVoice("plain operator draft"),
      ).rejects.toMatchObject({
        name: "PpqError",
        status: 402,
      });
    });
    expect(
      harness.relay.getEvents({
        authors: [testKeys.persona.pubkey],
        kinds: [1],
      }),
    ).toHaveLength(0);
  });

  it("manually tops up PPQ credits from the connected persona wallet", async () => {
    const operator = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
      ppq: { api_key: "api-topup", credit_id: "credit-topup" },
    });
    harness = await createServicesHarness({
      events: [operator.event],
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
      withHttp: true,
    });
    if (!harness.http) throw new Error("HTTP harness was not started.");
    harness.http.on("POST", "/credits/balance", () => ({
      json: { balance_usd: 1 },
    }));
    harness.http.on("GET", "/queries/history?page=1&page_count=20&all_keys=true", () => ({
      json: { data: [] },
    }));
    harness.http.on("POST", "/topup/create/btc-lightning", (req) => ({
      json: {
        invoice_id: "invoice-ai",
        expires_at: 1_800_000_000,
        amount: 12,
        currency: "USD",
        lightning_invoice: "lnbc1aitopup",
        crypto_amount_due: "0.000001",
        request: JSON.parse(req.bodyText),
      },
    }));
    harness.http.on("GET", "/topup/status/invoice-ai", () => ({
      json: {
        invoice_id: "invoice-ai",
        status: "Settled",
        amount: 12,
        currency: "USD",
      },
    }));

    const wallet = renderHook(
      () =>
        useWallet({
          walletId: `persona:${testKeys.persona.pubkey}`,
          mnemonic: MNEMONIC,
          autoTopup: {
            enabled: false,
            thresholdUsd: 5,
            topupAmountUsd: 12,
            fundingSource: "persona",
          },
      }),
      { wrapper: harness.wrapper },
    );
    await waitFor(() => expect(wallet.result.current).toBeTruthy());

    await waitFor(() => expect(wallet.result.current.handle).toBeDefined());
    await waitFor(() =>
      expect(wallet.result.current.ppqAccount?.api_key).toBe("api-topup"),
    );

    await act(async () => {
      await expect(wallet.result.current.manualTopup(12, "persona")).resolves.toEqual(
        {
          toppedUpUsd: 12,
          invoiceId: "invoice-ai",
          paymentRequest: "lnbc1aitopup",
          status: "Settled",
        },
      );
    });

    expect(walletMocks.sendBolt11).toHaveBeenCalledWith(
      expect.anything(),
      { paymentRequest: "lnbc1aitopup" },
    );
    expect(JSON.parse(harness.http.requests[2]!.bodyText)).toEqual({
      amount: 12,
      currency: "USD",
    });
  });
});

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}
