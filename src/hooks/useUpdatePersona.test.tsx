import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { NostrEvent } from "@nostrify/nostrify";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PHOENIX_PAYLOAD_APP,
  PHOENIX_PAYLOAD_VERSION,
  type PhoenixEnvelope,
} from "@/lib/persona";
import { LightningUsernameTakenError } from "@/lib/wallet/lightningAddress";
import { useUpdatePersona } from "./useUpdatePersona";

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
    encryptPhoenixEnvelope: vi.fn(),
    connectWallet: vi.fn(),
    disconnectWallet: vi.fn(),
    registerLightningAddressWithRetry: vi.fn(),
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

vi.mock("@/lib/personaCrypto", () => ({
  encryptPhoenixEnvelope: mocks.encryptPhoenixEnvelope,
}));

vi.mock("@/lib/wallet/client", () => ({
  connectWallet: mocks.connectWallet,
  disconnectWallet: mocks.disconnectWallet,
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

function makeEnvelope(dTag?: string): PhoenixEnvelope {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return {
    app: PHOENIX_PAYLOAD_APP,
    version: PHOENIX_PAYLOAD_VERSION,
    persona: {
      pubkey: pk,
      nsec: nip19.nsecEncode(sk),
      dTag,
      name: "Voice",
      display_name: "Voice",
      username: "voice",
      system_prompt: "System",
      created_at: 1,
    },
    wallet: {
      kind: "spark",
      seed: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      lightning_address: "voice@breez.tips",
    },
  };
}

describe("useUpdatePersona", () => {
  beforeEach(() => {
    mocks.nostrEvent.mockReset().mockResolvedValue(undefined);
    mocks.signEvent.mockClear();
    mocks.encryptPhoenixEnvelope.mockReset().mockResolvedValue("ciphertext");
    mocks.connectWallet.mockReset().mockResolvedValue({ id: "wallet" });
    mocks.disconnectWallet.mockReset().mockResolvedValue(undefined);
    mocks.registerLightningAddressWithRetry.mockReset().mockResolvedValue({
      username: "new-voice",
      lightningAddress: "new-voice@breez.tips",
      lnurl: "lnurl1",
    });
  });

  it("reuses persona.dTag when saving encrypted backup", async () => {
    const envelope = makeEnvelope("stable-dtag");
    const { result } = renderHook(() => useUpdatePersona(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        backupEvent: {
          id: "old",
          pubkey: "operator-pubkey",
          kind: 30078,
          created_at: 1,
          tags: [["d", "event-dtag"]],
          content: "old",
          sig: "sig",
        },
        envelope,
        npub: "npub1persona",
        name: "Voice",
        username: "voice",
        lightningUsername: "voice",
        systemPrompt: "System",
        bio: "",
        originalBio: "",
        bioHydrated: true,
        pictureUrl: "",
        originalPicture: "",
        pictureHydrated: true,
        crossPost: undefined,
      });
    });

    expect(mocks.signEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [["d", "stable-dtag"]] }),
    );
  });

  it("falls back to the backup event d-tag for legacy personas", async () => {
    const envelope = makeEnvelope(undefined);
    const { result } = renderHook(() => useUpdatePersona(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        backupEvent: {
          id: "old",
          pubkey: "operator-pubkey",
          kind: 30078,
          created_at: 1,
          tags: [["d", "event-dtag"]],
          content: "old",
          sig: "sig",
        },
        envelope,
        npub: "npub1persona",
        name: "Voice",
        username: "voice",
        lightningUsername: "voice",
        systemPrompt: "System",
        bio: "",
        originalBio: "",
        bioHydrated: true,
        pictureUrl: "",
        originalPicture: "",
        pictureHydrated: true,
        crossPost: undefined,
      });
    });

    expect(mocks.signEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [["d", "event-dtag"]] }),
    );
  });

  it("publishes kind 0 only when public profile fields changed", async () => {
    const envelope = makeEnvelope("stable-dtag");
    const { result } = renderHook(() => useUpdatePersona(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        backupEvent: {
          id: "old",
          pubkey: "operator-pubkey",
          kind: 30078,
          created_at: 1,
          tags: [["d", "stable-dtag"]],
          content: "old",
          sig: "sig",
        },
        envelope,
        npub: "npub1persona",
        name: "Voice",
        username: "voice",
        lightningUsername: "voice",
        systemPrompt: "System",
        bio: "Updated bio",
        originalBio: "",
        bioHydrated: true,
        pictureUrl: "",
        originalPicture: "",
        pictureHydrated: true,
        crossPost: undefined,
      });
    });

    expect(mocks.nostrEvent).toHaveBeenCalledTimes(2);
    expect(mocks.nostrEvent.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ kind: 0 }),
    );
  });

  it("keeps profile publish failures best-effort after backup save", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.nostrEvent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("profile relay failed"));
    const envelope = makeEnvelope("stable-dtag");
    const { result } = renderHook(() => useUpdatePersona(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          backupEvent: {
            id: "old",
            pubkey: "operator-pubkey",
            kind: 30078,
            created_at: 1,
            tags: [["d", "stable-dtag"]],
            content: "old",
            sig: "sig",
          },
          envelope,
          npub: "npub1persona",
          name: "Voice",
          username: "voice",
          lightningUsername: "voice",
          systemPrompt: "System",
          bio: "Updated bio",
          originalBio: "",
          bioHydrated: true,
          pictureUrl: "",
          originalPicture: "",
          pictureHydrated: true,
          crossPost: undefined,
        });
      }),
    ).resolves.toBeUndefined();

    expect(mocks.nostrEvent).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "Failed to update persona profile:",
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("updates the persona username without registering a Lightning address", async () => {
    const envelope = makeEnvelope("stable-dtag");
    const { result } = renderHook(() => useUpdatePersona(), { wrapper });

    let updatedUsername: string | undefined;
    await act(async () => {
      const updated = await result.current.mutateAsync({
        backupEvent: {
          id: "old",
          pubkey: "operator-pubkey",
          kind: 30078,
          created_at: 1,
          tags: [["d", "stable-dtag"]],
          content: "old",
          sig: "sig",
        },
        envelope,
        npub: "npub1persona",
        name: "Voice",
        username: "public-voice",
        lightningUsername: "voice",
        systemPrompt: "System",
        bio: "",
        originalBio: "",
        bioHydrated: true,
        pictureUrl: "",
        originalPicture: "",
        pictureHydrated: true,
        crossPost: undefined,
      });
      updatedUsername = updated.updated.username;
    });

    expect(updatedUsername).toBe("public-voice");
    expect(mocks.registerLightningAddressWithRetry).not.toHaveBeenCalled();
  });

  it("fails deliberate Lightning address renames without publishing", async () => {
    mocks.registerLightningAddressWithRetry.mockRejectedValueOnce(
      new LightningUsernameTakenError("new-voice"),
    );
    const envelope = makeEnvelope("stable-dtag");
    const { result } = renderHook(() => useUpdatePersona(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          backupEvent: {
            id: "old",
            pubkey: "operator-pubkey",
            kind: 30078,
            created_at: 1,
            tags: [["d", "stable-dtag"]],
            content: "old",
            sig: "sig",
          },
          envelope,
          npub: "npub1persona",
          name: "Voice",
          username: "voice",
          lightningUsername: "new-voice",
          systemPrompt: "System",
          bio: "",
          originalBio: "",
          bioHydrated: true,
          pictureUrl: "",
          originalPicture: "",
          pictureHydrated: true,
          crossPost: undefined,
        });
      }),
    ).rejects.toThrow("new-voice@breez.tips is already taken");

    expect(mocks.registerLightningAddressWithRetry).toHaveBeenCalledWith(
      { id: "wallet" },
      expect.objectContaining({
        baseUsername: "new-voice",
      }),
    );
    expect(mocks.signEvent).not.toHaveBeenCalled();
    expect(mocks.nostrEvent).not.toHaveBeenCalled();
  });
});
