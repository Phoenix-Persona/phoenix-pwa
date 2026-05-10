import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCreatePersona } from "./useCreatePersona";

const mocks = vi.hoisted(() => {
  const nostrEvent = vi.fn();
  const signEvent = vi.fn(async (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => ({
    ...template,
    id: "backup-event-id",
    pubkey: "operator-pubkey",
    sig: "operator-sig",
  }) as NostrEvent);

  return {
    nostrEvent,
    signEvent,
    generatePersonaKeypair: vi.fn(),
    signWithPersona: vi.fn(),
    generateMnemonic: vi.fn(),
    connectWallet: vi.fn(),
    disconnectWallet: vi.fn(),
    registerLightningAddressWithRetry: vi.fn(),
    encryptPhoenixEnvelope: vi.fn(),
  };
});

vi.mock("@nostrify/react", () => ({
  useNostr: () => ({ nostr: { event: mocks.nostrEvent } }),
}));

vi.mock("./useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: "operator-pubkey",
      signer: {
        signEvent: mocks.signEvent,
        nip44: {
          encrypt: vi.fn(),
          decrypt: vi.fn(),
        },
      },
    },
  }),
}));

vi.mock("@/lib/personaKey", () => ({
  generatePersonaKeypair: mocks.generatePersonaKeypair,
  signWithPersona: mocks.signWithPersona,
}));

vi.mock("@/lib/personaCrypto", () => ({
  encryptPhoenixEnvelope: mocks.encryptPhoenixEnvelope,
}));

vi.mock("@/lib/wallet/client", () => ({
  connectWallet: mocks.connectWallet,
  disconnectWallet: mocks.disconnectWallet,
  generateMnemonic: mocks.generateMnemonic,
}));

vi.mock("@/lib/wallet/lightningAddress", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/wallet/lightningAddress")>();
  return {
    ...actual,
    registerLightningAddressWithRetry:
      mocks.registerLightningAddressWithRetry,
  };
});

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCreatePersona", () => {
  beforeEach(() => {
    mocks.nostrEvent.mockReset().mockResolvedValue(undefined);
    mocks.signEvent.mockClear();
    mocks.generatePersonaKeypair.mockReset().mockReturnValue({
      nsec: "nsec1persona",
      npub: "npub1persona",
      hex: {
        pk: "a".repeat(64),
        sk: "b".repeat(64),
      },
    });
    mocks.signWithPersona.mockReset().mockReturnValue({
      id: "profile-event-id",
      pubkey: "a".repeat(64),
      kind: 0,
      created_at: 123,
      tags: [],
      content: "{}",
      sig: "persona-sig",
    } as NostrEvent);
    mocks.generateMnemonic.mockReset().mockResolvedValue(
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    );
    mocks.connectWallet.mockReset().mockResolvedValue({ id: "wallet" });
    mocks.disconnectWallet.mockReset().mockResolvedValue(undefined);
    mocks.registerLightningAddressWithRetry.mockReset().mockResolvedValue({
      username: "voice",
      lightningAddress: "voice@spark.money",
      lnurl: "lnurl1",
    });
    mocks.encryptPhoenixEnvelope.mockReset().mockResolvedValue("ciphertext");
  });

  it("publishes encrypted backup and public kind 0 profile", async () => {
    const { result } = renderHook(() => useCreatePersona(), { wrapper });

    await act(async () => {
      const created = await result.current.mutateAsync({
        name: "Voice",
        username: "voice",
        bio: "Bio",
        systemPrompt: "System",
        tags: ["rwanda"],
        languages: ["en"],
        voiceId: "alloy",
        pictureUrl: "https://example.com/pic.png",
      });

      expect(created.npub).toBe("npub1persona");
      expect(created.envelope.persona.dTag).toBeTruthy();
      expect(created.envelope.wallet?.lightning_address).toBe(
        "voice@spark.money",
      );
    });

    expect(mocks.nostrEvent).toHaveBeenCalledTimes(2);
    expect(mocks.signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 30078,
        content: "ciphertext",
      }),
    );
  });

  it("continues persona creation when Lightning Address registration fails", async () => {
    mocks.registerLightningAddressWithRetry.mockRejectedValue(
      new Error("address taken"),
    );
    const { result } = renderHook(() => useCreatePersona(), { wrapper });

    await act(async () => {
      const created = await result.current.mutateAsync({
        name: "Voice",
        username: "voice",
        bio: "Bio",
        systemPrompt: "System",
        tags: [],
        languages: ["en"],
        voiceId: "alloy",
      });

      expect(created.envelope.wallet?.lightning_address).toBeUndefined();
      expect(created.warning).toBe("address taken");
    });

    expect(mocks.nostrEvent).toHaveBeenCalledTimes(2);
  });
});
