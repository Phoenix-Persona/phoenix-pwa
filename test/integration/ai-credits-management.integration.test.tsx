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

import { useOperatorEnvelope } from "@/hooks/useOperatorEnvelope";
import { usePpqAccount } from "@/hooks/usePpqAccount";
import { queryKeys } from "@/lib/queryKeys";

import {
  loginFor,
  operatorEnvelopeEvent,
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
}));

mockModule("@/lib/wallet/client", () => ({
  generateMnemonic: walletMocks.generateMnemonic,
}));

describe("AI credits management integration", () => {
  let harness: ServicesHarness | undefined;

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await harness?.cleanup();
    harness = undefined;
  });

  it("creates PPQ credentials, stores them in the operator envelope, and reads credit balance", async () => {
    const queryClient = testQueryClient();
    harness = await createServicesHarness({
      logins: [loginFor(testKeys.operator)],
      queryClient,
      withHttp: true,
    });
    if (!harness.http) throw new Error("HTTP harness was not started.");
    harness.http.on("POST", "/accounts/create", () => ({
      json: { api_key: "api-created", credit_id: "credit-created" },
    }));
    harness.http.on("POST", "/credits/balance", (req) => ({
      json: {
        balance_usd: 4.25,
        request: JSON.parse(req.bodyText),
      },
    }));

    const ppqHook = renderHook(() => usePpqAccount(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(ppqHook.result.current).toBeTruthy());

    await act(async () => {
      await expect(ppqHook.result.current.ensureAccount()).resolves.toEqual({
        api_key: "api-created",
        credit_id: "credit-created",
      });
    });

    await waitFor(() =>
      expect(ppqHook.result.current.balance?.balance_usd).toBe(4.25),
    );
    expect(harness.http.requests[0]?.path).toBe("/accounts/create");
    expect(JSON.parse(harness.http.requests[1]!.bodyText)).toEqual({
      credit_id: "credit-created",
    });

    const operatorHook = renderHook(() => useOperatorEnvelope(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() =>
      expect(operatorHook.result.current.envelope?.ppq?.api_key).toBe(
        "api-created",
      ),
    );
    expect(operatorHook.result.current.envelope?.wallet?.seed).toBe(
      MNEMONIC,
    );
    expect(
      harness.relay.getEvents({
        authors: [testKeys.operator.pubkey],
        kinds: [30078],
      }),
    ).toHaveLength(1);
  });

  it("rotates PPQ credentials and clears old credit query state", async () => {
    const queryClient = testQueryClient();
    const existing = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      wallet: { kind: "spark", seed: MNEMONIC },
      ppq: { api_key: "api-old", credit_id: "credit-old" },
    });
    queryClient.setQueryData(queryKeys.ppq.balance("credit-old"), {
      balance_usd: 99,
      raw: {},
    });
    harness = await createServicesHarness({
      events: [existing.event],
      logins: [loginFor(testKeys.operator)],
      queryClient,
      withHttp: true,
    });
    if (!harness.http) throw new Error("HTTP harness was not started.");
    harness.http.on("POST", "/credits/balance", () => ({
      json: { balance_usd: 1 },
    }));
    harness.http.on("POST", "/accounts/create", () => ({
      json: { api_key: "api-rotated", credit_id: "credit-rotated" },
    }));

    const ppqHook = renderHook(() => usePpqAccount(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() =>
      expect(ppqHook.result.current.account?.api_key).toBe("api-old"),
    );

    await act(async () => {
      await expect(ppqHook.result.current.rotateAccount()).resolves.toEqual({
        api_key: "api-rotated",
        credit_id: "credit-rotated",
      });
    });

    await waitFor(() =>
      expect(ppqHook.result.current.account?.api_key).toBe("api-rotated"),
    );
    expect(queryClient.getQueryData(queryKeys.ppq.balance("credit-old"))).toBeUndefined();

    const operatorHook = renderHook(() => useOperatorEnvelope(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() =>
      expect(operatorHook.result.current.envelope?.ppq?.api_key).toBe(
        "api-rotated",
      ),
    );
    expect(operatorHook.result.current.envelope?.wallet?.seed).toBe(
      MNEMONIC,
    );
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
