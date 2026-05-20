import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mockFn, hoisted, mockModule, clearAllMocks } from "@/test/api";

import type { CreatePersonaResult } from "@/hooks/useCreatePersona";
import { useCreatePersona } from "@/hooks/useCreatePersona";
import type { DeletePersonaResult } from "@/hooks/useDeletePersona";
import { useDeletePersona } from "@/hooks/useDeletePersona";
import { useMyPersonas, clearPersonaDecryptCache } from "@/hooks/usePersona";
import type { UpdatePersonaResult } from "@/hooks/useUpdatePersona";
import { useUpdatePersona } from "@/hooks/useUpdatePersona";
import type { PersonaKeypair } from "@/lib/personaKey";

import {
  loginFor,
  testKeys,
} from "./fixtures/nostr";
import {
  createRelayHarness,
  type RelayHarness,
} from "./harness/renderWithRelay";

const walletMocks = hoisted(() => ({
  generateMnemonic: mockFn(async () =>
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  ),
  connectWallet: mockFn(async () => ({
    deleteLightningAddress: mockFn(async () => undefined),
  })),
  disconnectWallet: mockFn(async () => undefined),
  registerLightningAddressWithRetry: mockFn(async () => ({
    username: "amina",
    lightningAddress: "amina@breez.tips",
    lnurl: "lnurl1fixture",
  })),
}));

mockModule("@/lib/wallet/client", () => ({
  generateMnemonic: walletMocks.generateMnemonic,
  connectWallet: walletMocks.connectWallet,
  disconnectWallet: walletMocks.disconnectWallet,
}));

mockModule("@/lib/wallet/lightningAddress", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/wallet/lightningAddress")>();
  return {
    ...actual,
    registerLightningAddressWithRetry:
      walletMocks.registerLightningAddressWithRetry,
  };
});

describe("persona lifecycle integration", () => {
  let harness: RelayHarness | undefined;

  beforeEach(() => {
    clearPersonaDecryptCache();
    clearAllMocks();
  });

  afterEach(async () => {
    clearPersonaDecryptCache();
    await harness?.cleanup();
    harness = undefined;
  });

  it("creates, updates, lists, and deletes a persona through the local relay", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    harness = await createRelayHarness({
      logins: [loginFor(testKeys.operator)],
      queryClient,
    });
    const personaKeypair: PersonaKeypair = {
      nsec: testKeys.persona.nsec,
      npub: testKeys.persona.npub,
      hex: {
        sk: testKeys.persona.skHex,
        pk: testKeys.persona.pubkey,
      },
    };

    const createHook = renderHook(() => useCreatePersona(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(createHook.result.current).toBeTruthy());
    let created: CreatePersonaResult | undefined;
    await act(async () => {
      created = await createHook.result.current.mutateAsync({
        name: "Amina Test",
        username: "amina-public",
        lightningUsername: "amina",
        bio: "Original public bio",
        systemPrompt: "Protect the operator and speak clearly.",
        keypair: personaKeypair,
      });
    });
    expect(created).toBeDefined();

    const initialBackups = harness.relay.getEvents({
      authors: [testKeys.operator.pubkey],
      kinds: [30078],
    });
    const initialProfiles = harness.relay.getEvents({
      authors: [testKeys.persona.pubkey],
      kinds: [0],
    });
    expect(initialBackups).toHaveLength(1);
    expect(initialProfiles).toHaveLength(1);
    expect(JSON.parse(initialProfiles[0]!.content)).toEqual(
      expect.objectContaining({
        name: "amina-public",
        display_name: "Amina Test",
        about: "Original public bio",
        lud16: "amina@breez.tips",
      }),
    );

    const mineHook = renderHook(() => useMyPersonas(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(mineHook.result.current.isSuccess).toBe(true));
    expect(mineHook.result.current.data).toHaveLength(1);
    expect(mineHook.result.current.data?.[0]?.envelope.persona.name).toBe(
      "Amina Test",
    );

    const updateHook = renderHook(() => useUpdatePersona(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(updateHook.result.current).toBeTruthy());
    let updated: UpdatePersonaResult | undefined;
    await act(async () => {
      updated = await updateHook.result.current.mutateAsync({
        backupEvent: created!.backupEvent,
        envelope: created!.envelope,
        npub: created!.npub,
        name: "Amina Updated",
        username: "amina-public",
        lightningUsername: "amina",
        systemPrompt: "Updated system prompt.",
        bio: "Updated public bio",
        originalBio: "Original public bio",
        bioHydrated: true,
        pictureUrl: "",
        originalPicture: "",
        pictureHydrated: true,
        crossPost: undefined,
      });
    });
    expect(updated?.updated.name).toBe("Amina Updated");
    expect(walletMocks.registerLightningAddressWithRetry).toHaveBeenCalledTimes(1);

    const updatedBackups = harness.relay.getEvents({
      authors: [testKeys.operator.pubkey],
      kinds: [30078],
    });
    const updatedProfiles = harness.relay.getEvents({
      authors: [testKeys.persona.pubkey],
      kinds: [0],
    });
    expect(updatedBackups).toHaveLength(1);
    expect(updatedBackups[0]?.id).toBe(updated?.backupEvent.id);
    expect(JSON.parse(updatedProfiles[0]!.content)).toEqual(
      expect.objectContaining({
        name: "amina-public",
        display_name: "Amina Updated",
        about: "Updated public bio",
        lud16: "amina@breez.tips",
      }),
    );

    await waitFor(() =>
      expect(mineHook.result.current.data?.[0]?.envelope.persona.name).toBe(
        "Amina Updated",
      ),
    );

    const deleteHook = renderHook(() => useDeletePersona(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(deleteHook.result.current).toBeTruthy());
    let deleted: DeletePersonaResult | undefined;
    await act(async () => {
      deleted = await deleteHook.result.current.mutateAsync({
        backupEvent: updated!.backupEvent,
        personaPubkey: testKeys.persona.pubkey,
        npub: created!.npub,
      });
    });

    expect(deleted?.warnings).toEqual([]);
    expect(walletMocks.connectWallet).toHaveBeenCalledTimes(2);

    const deletionEvents = harness.relay.getEvents({
      authors: [testKeys.operator.pubkey],
      kinds: [5],
    });
    const tombstones = harness.relay.getEvents({
      authors: [testKeys.operator.pubkey],
      kinds: [30078],
    });
    expect(deletionEvents).toHaveLength(1);
    expect(deletionEvents[0]?.tags).toEqual(
      expect.arrayContaining([
        ["e", updated!.backupEvent.id],
        ["k", "30078"],
        ["e", updatedProfiles[0]!.id],
        ["k", "0"],
      ]),
    );
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.id).toBe(deleted?.tombstoneId);

    await waitFor(() => expect(mineHook.result.current.data).toEqual([]));
  });
});
