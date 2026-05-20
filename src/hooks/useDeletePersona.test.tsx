import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, mockFn, hoisted, mockModule, clearAllMocks } from "@/test/api";

import { useDeletePersona } from "./useDeletePersona";

const mocks = hoisted(() => {
  const nostrEvent = mockFn(async () => undefined);
  const nostrQuery = mockFn(async () => [] as NostrEvent[]);
  const signEvent = mockFn(async (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => ({
    ...template,
    id:
      template.kind === 5
        ? "deletion-event-id"
        : template.kind === 30078
          ? "tombstone-event-id"
          : "other-event-id",
    pubkey: "operator-pubkey",
    sig: "operator-sig",
  }) as NostrEvent);
  const nip44Encrypt = mockFn(async () => "tombstone-ciphertext");
  const nip44Decrypt = mockFn();

  return {
    nostrEvent,
    nostrQuery,
    signEvent,
    nip44Encrypt,
    nip44Decrypt,
    tryDecryptPhoenixEnvelope: mockFn(),
    connectWallet: mockFn(),
    disconnectWallet: mockFn(async () => undefined),
    deleteLightningAddress: mockFn(async () => undefined),
  };
});

mockModule("@nostrify/react", () => ({
  useNostr: () => ({
    nostr: { event: mocks.nostrEvent, query: mocks.nostrQuery },
  }),
}));

mockModule("./useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: "operator-pubkey",
      signer: {
        signEvent: mocks.signEvent,
        nip44: { encrypt: mocks.nip44Encrypt, decrypt: mocks.nip44Decrypt },
      },
    },
  }),
}));

mockModule("@/lib/personaCrypto", () => ({
  tryDecryptPhoenixEnvelope: mocks.tryDecryptPhoenixEnvelope,
}));

mockModule("@/lib/wallet/client", () => ({
  connectWallet: mocks.connectWallet,
  disconnectWallet: mocks.disconnectWallet,
}));

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function resetQueryClient() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeBackupEvent(overrides?: Partial<NostrEvent>): NostrEvent {
  return {
    id: "backup-event-id",
    pubkey: "operator-pubkey",
    kind: 30078,
    created_at: 1_700_000_000,
    tags: [["d", "stable-d-tag"]],
    content: "encrypted-backup-content",
    sig: "sig",
    ...overrides,
  } as NostrEvent;
}

function makeKind0Event(): NostrEvent {
  return {
    id: "kind0-event-id",
    pubkey: "persona-pubkey",
    kind: 0,
    created_at: 1_700_000_001,
    tags: [],
    content: JSON.stringify({ name: "Imani" }),
    sig: "sig",
  } as NostrEvent;
}

describe("useDeletePersona", () => {
  beforeEach(() => {
    resetQueryClient();
    clearAllMocks();

    // Default: a usable wallet handle that releases the address cleanly.
    mocks.connectWallet.mockResolvedValue({
      deleteLightningAddress: mocks.deleteLightningAddress,
    });
    // Default: backup decrypts to an envelope with a wallet seed.
    mocks.tryDecryptPhoenixEnvelope.mockResolvedValue({
      app: "phoenix-persona",
      version: 1,
      persona: { pubkey: "persona-pubkey" },
      wallet: { kind: "spark", seed: "twelve mnemonic words here" },
    });
  });

  it("releases the LN address, publishes deletion + tombstone, returns no warnings on the happy path", async () => {
    mocks.nostrQuery.mockResolvedValue([makeKind0Event()]);

    const { result } = renderHook(() => useDeletePersona(), { wrapper });

    let resolved: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        backupEvent: makeBackupEvent(),
        personaPubkey: "persona-pubkey",
        npub: "npub1persona",
      });
    });

    expect(resolved).toBeDefined();
    expect(resolved!.deletionId).toBe("deletion-event-id");
    expect(resolved!.tombstoneId).toBe("tombstone-event-id");
    expect(resolved!.warnings).toEqual([]);

    // LN address release happened
    expect(mocks.connectWallet).toHaveBeenCalledWith({
      mnemonic: "twelve mnemonic words here",
    });
    expect(mocks.deleteLightningAddress).toHaveBeenCalledTimes(1);
    expect(mocks.disconnectWallet).toHaveBeenCalledTimes(1);

    // Two events published: kind 5 deletion (with both backup + kind 0
    // refs) and kind 30078 tombstone reusing the d-tag.
    const deletionTemplate = mocks.signEvent.mock.calls.find(
      ([tmpl]) => (tmpl as { kind: number }).kind === 5,
    )?.[0] as { tags: string[][] } | undefined;
    expect(deletionTemplate?.tags).toEqual(
      expect.arrayContaining([
        ["e", "backup-event-id"],
        ["k", "30078"],
        ["e", "kind0-event-id"],
        ["k", "0"],
      ]),
    );

    const tombstoneTemplate = mocks.signEvent.mock.calls.find(
      ([tmpl]) => (tmpl as { kind: number }).kind === 30078,
    )?.[0] as { tags: string[][] } | undefined;
    expect(tombstoneTemplate?.tags).toEqual([["d", "stable-d-tag"]]);
  });

  it("emits 'lightning-address-release' warning when the SDK call fails", async () => {
    mocks.connectWallet.mockRejectedValue(new Error("SDK boot failed"));
    mocks.nostrQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useDeletePersona(), { wrapper });

    let resolved: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        backupEvent: makeBackupEvent(),
        personaPubkey: "persona-pubkey",
        npub: "npub1persona",
      });
    });

    expect(resolved!.warnings).toContain("lightning-address-release");
    // Deletion + tombstone still published despite the LN release failure.
    expect(resolved!.deletionId).toBe("deletion-event-id");
    expect(resolved!.tombstoneId).toBe("tombstone-event-id");
  });

  it("emits 'kind0-lookup' warning when the kind 0 query fails", async () => {
    mocks.nostrQuery.mockRejectedValue(new Error("relay timeout"));

    const { result } = renderHook(() => useDeletePersona(), { wrapper });

    let resolved: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        backupEvent: makeBackupEvent(),
        personaPubkey: "persona-pubkey",
        npub: "npub1persona",
      });
    });

    expect(resolved!.warnings).toContain("kind0-lookup");
    // Deletion request omits the kind 0 references when lookup failed.
    const deletionTemplate = mocks.signEvent.mock.calls.find(
      ([tmpl]) => (tmpl as { kind: number }).kind === 5,
    )?.[0] as { tags: string[][] } | undefined;
    expect(deletionTemplate?.tags).toEqual([
      ["e", "backup-event-id"],
      ["k", "30078"],
    ]);
    expect(resolved!.tombstoneId).toBe("tombstone-event-id");
  });

  it("emits 'backup-decrypt' warning when the envelope can't be decrypted", async () => {
    mocks.tryDecryptPhoenixEnvelope.mockRejectedValue(new Error("nip44 decrypt failed"));
    mocks.nostrQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useDeletePersona(), { wrapper });

    let resolved: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        backupEvent: makeBackupEvent(),
        personaPubkey: "persona-pubkey",
        npub: "npub1persona",
      });
    });

    expect(resolved!.warnings).toContain("backup-decrypt");
    // No SDK boot when decrypt fails (no seed available).
    expect(mocks.connectWallet).not.toHaveBeenCalled();
    // Tombstone + deletion still published.
    expect(resolved!.deletionId).toBe("deletion-event-id");
    expect(resolved!.tombstoneId).toBe("tombstone-event-id");
  });

  it("throws if the backup event is missing its d-tag", async () => {
    const { result } = renderHook(() => useDeletePersona(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          backupEvent: makeBackupEvent({ tags: [] }),
          personaPubkey: "persona-pubkey",
          npub: "npub1persona",
        }),
      ).rejects.toThrow("Backup event is missing its d-tag");
    });

    // No publish attempts when the d-tag check fails up front.
    expect(mocks.nostrEvent).not.toHaveBeenCalled();
  });
});
