import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
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

import Onboard from "@/pages/Onboard";
import type { PersonaKeypair } from "@/lib/personaKey";
import type { NostrEvent } from "@nostrify/nostrify";

import { loginFor, testKeys } from "./fixtures/nostr";
import {
  createServicesHarness,
  type ServicesHarness,
} from "./harness/renderWithServices";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const mocks = hoisted(() => ({
  generatePersonaKeypair: mockFn(() => ({
    nsec: testKeys.persona.nsec,
    npub: testKeys.persona.npub,
    hex: {
      sk: testKeys.persona.skHex,
      pk: testKeys.persona.pubkey,
    },
  }) satisfies PersonaKeypair),
  generateMnemonic: mockFn(async () => MNEMONIC),
  connectWallet: mockFn(async () => ({})),
  disconnectWallet: mockFn(async () => undefined),
  loadWalletInfo: mockFn(async () => ({
    balanceSats: 0,
    raw: {},
  })),
  listRecentPayments: mockFn(async () => []),
  receiveBolt11: mockFn(async () => ({
    paymentRequest: "lnbc1onboard",
    feeSats: 0,
    raw: {},
  })),
  sendBolt11: mockFn(async () => ({
    raw: {},
  })),
  registerLightningAddressWithRetry: mockFn(async () => ({
    username: "route-voice",
    lightningAddress: "route-voice@breez.tips",
    lnurl: "lnurl1routevoice",
  })),
}));

mockModule("@/lib/personaKey", () => ({
  generatePersonaKeypair: mocks.generatePersonaKeypair,
  signWithPersona: (
    template: { kind: number; created_at: number; tags: string[][]; content: string },
    keypair: PersonaKeypair,
  ) => finalizeEvent(template, hexToBytes(keypair.hex.sk)) as NostrEvent,
  decodePersonaNsec: (nsec: string): PersonaKeypair => {
    const decoded = nip19.decode(nsec);
    if (decoded.type !== "nsec") {
      throw new Error("Provided value is not an nsec");
    }
    const sk = bytesToHex(decoded.data);
    const pk = getPublicKey(decoded.data);
    return {
      nsec,
      npub: nip19.npubEncode(pk),
      hex: { sk, pk },
    };
  },
}));

mockModule("@/lib/wallet/client", () => ({
  generateMnemonic: mocks.generateMnemonic,
  connectWallet: mocks.connectWallet,
  disconnectWallet: mocks.disconnectWallet,
  loadWalletInfo: mocks.loadWalletInfo,
  listRecentPayments: mocks.listRecentPayments,
  receiveBolt11: mocks.receiveBolt11,
  sendBolt11: mocks.sendBolt11,
}));

mockModule("@/lib/wallet/lightningAddress", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/wallet/lightningAddress")>();
  return {
    ...actual,
    registerLightningAddressWithRetry:
      mocks.registerLightningAddressWithRetry,
  };
});

mockModule("@/hooks/useUsernameAvailability", () => ({
  useUsernameAvailability: () => ({ status: "idle" }),
}));

describe("onboarding route integration", () => {
  let harness: ServicesHarness | undefined;

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await harness?.cleanup();
    harness = undefined;
  });

  it("creates a persona through the real onboarding page and publishes backup/profile events", async () => {
    harness = await createServicesHarness({
      logins: [loginFor(testKeys.operator)],
      queryClient: testQueryClient(),
      initialRoute: "/onboard",
    });

    render(<Onboard />, { wrapper: harness.wrapper });

    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: "Route Voice" },
    });
    fireEvent.change(screen.getByLabelText(/bio \(public/i), {
      target: { value: "Route-level bio" },
    });
    fireEvent.change(screen.getByLabelText(/system prompt/i), {
      target: { value: "Route-level private system prompt." },
    });
    fireEvent.click(screen.getByRole("button", { name: /next: profile picture/i }));

    await screen.findByRole("button", { name: /create persona/i });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create persona/i }));
    });

    await waitFor(() =>
      expect(
        harness!.relay.getEvents({
          authors: [testKeys.operator.pubkey],
          kinds: [30078],
        }),
      ).toHaveLength(1),
    );

    const profiles = harness.relay.getEvents({
      authors: [testKeys.persona.pubkey],
      kinds: [0],
    });
    expect(profiles).toHaveLength(1);
    expect(JSON.parse(profiles[0]!.content)).toEqual(
      expect.objectContaining({
        name: "route-voice",
        display_name: "Route Voice",
        about: "Route-level bio",
        lud16: "route-voice@breez.tips",
      }),
    );
    expect(mocks.generatePersonaKeypair).toHaveBeenCalledOnce();
    expect(mocks.generateMnemonic).toHaveBeenCalledOnce();
    expect(mocks.registerLightningAddressWithRetry).toHaveBeenCalledOnce();
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
