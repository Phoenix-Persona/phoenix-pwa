import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/queryKeys";
import { LightningUsernameTakenError } from "@/lib/wallet/lightningAddress";
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

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function resetQueryClient() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("useCreatePersona", () => {
  beforeEach(() => {
    resetQueryClient();
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
      lightningAddress: "voice@breez.tips",
      lnurl: "lnurl1",
    });
    mocks.encryptPhoenixEnvelope.mockReset().mockResolvedValue("ciphertext");
  });

  it("publishes encrypted backup and public kind 0 profile", async () => {
    const { result } = renderHook(() => useCreatePersona(), { wrapper });

    await act(async () => {
      const created = await result.current.mutateAsync({
        name: "Voice",
        username: "public-voice",
        lightningUsername: "donate-voice",
        bio: "Bio",
        systemPrompt: "System",
        pictureUrl: "https://example.com/pic.png",
      });

      expect(created.npub).toBe("npub1persona");
      expect(created.envelope.persona.dTag).toBeTruthy();
      expect(created.envelope.persona.username).toBe("public-voice");
      expect(created.envelope.wallet?.lightning_address).toBe(
        "voice@breez.tips",
      );
    });

    expect(mocks.nostrEvent).toHaveBeenCalledTimes(2);
    expect(mocks.signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 30078,
        content: "ciphertext",
      }),
    );
    expect(mocks.registerLightningAddressWithRetry).toHaveBeenCalledWith(
      { id: "wallet" },
      expect.objectContaining({
        baseUsername: "donate-voice",
      }),
    );
    expect(
      queryClient.getQueryData(queryKeys.persona.detail("npub1persona", "operator-pubkey")),
    ).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({ id: "backup-event-id" }),
        envelope: expect.objectContaining({
          persona: expect.objectContaining({ pubkey: "a".repeat(64) }),
        }),
      }),
    );
    expect(
      queryClient.getQueryData(queryKeys.persona.publicProfile("a".repeat(64))),
    ).toEqual({
      bio: "Bio",
      pictureUrl: "https://example.com/pic.png",
    });
  });

  it("continues persona creation when Lightning Address registration has a transient failure", async () => {
    mocks.registerLightningAddressWithRetry.mockRejectedValue(
      new Error("network unavailable"),
    );
    const { result } = renderHook(() => useCreatePersona(), { wrapper });

    await act(async () => {
      const created = await result.current.mutateAsync({
        name: "Voice",
        username: "public-voice",
        lightningUsername: "donate-voice",
        bio: "Bio",
        systemPrompt: "System",
      });

      expect(created.envelope.wallet?.lightning_address).toBeUndefined();
      expect(created.envelope.persona.username).toBe("public-voice");
      expect(created.warning).toBe("network unavailable");
    });

    expect(mocks.nostrEvent).toHaveBeenCalledTimes(2);
  });

  it("fails persona creation when the requested Lightning Address is taken", async () => {
    mocks.registerLightningAddressWithRetry.mockRejectedValue(
      new LightningUsernameTakenError("donate-voice"),
    );
    const { result } = renderHook(() => useCreatePersona(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          name: "Voice",
          username: "public-voice",
          lightningUsername: "donate-voice",
          bio: "Bio",
          systemPrompt: "System",
        });
      }),
    ).rejects.toThrow("donate-voice@breez.tips is already taken");

    expect(mocks.nostrEvent).not.toHaveBeenCalled();
  });
});
