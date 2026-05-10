/**
 * Delete a persona — releases the persona's Lightning Address, publishes a NIP-09 deletion
 * request, and overwrites the kind 30078 envelope with a "deleted"
 * sentinel.
 *
 * Mechanics:
 *  1. Decrypt the existing backup to recover the persona's wallet seed.
 *     Best-effort: if decryption fails or the persona has no wallet,
 *     skip the LN address release and proceed.
 *  2. Connect to the Spark SDK with the persona's seed and call
 *     `deleteLightningAddress()`. Best-effort — log and continue if it
 *     fails so the operator can still tombstone the envelope.
 *  3. Publish kind 5 (NIP-09) referencing the backup event id and the
 *     persona's kind 0 if we can find one. Best-effort — relays honor
 *     this at their discretion.
 *  4. Publish a NEW kind 30078 with the SAME d-tag as the original
 *     backup, but with encrypted content that's a "deleted" sentinel
 *     (`{ app, version, deleted: true }`). Because kind 30078 is
 *     addressable, this replaces the original on every relay that
 *     accepts it. The sentinel doesn't carry a `persona` block, so
 *     `parsePhoenixEnvelope` returns null and `useMyPersonas`
 *     silently drops it.
 *
 * What this does NOT do:
 *  - Retract the persona's already-published kind 1 posts. Those are
 *     signed by the persona's keypair which we throw away after this
 *     mutation, so we can't retract them ourselves. NIP-09 against
 *     them would have to be signed by the persona key, which we
 *     deliberately don't surface.
 *  - Recover the persona — once the backup is overwritten, the
 *     persona's nsec becomes inaccessible to the user. Deletion is
 *     intentionally irreversible.
 */

import { useNostr } from "@nostrify/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";

import {
  buildEncryptedPersonaTemplate,
  type PhoenixEnvelope,
  PHOENIX_PAYLOAD_APP,
  PHOENIX_PAYLOAD_VERSION,
} from "@/lib/persona";
import { publishWithTimeout } from "@/lib/nostrPublish";
import { tryDecryptPhoenixEnvelope } from "@/lib/personaCrypto";
import { queryKeys } from "@/lib/queryKeys";
import { connectWallet, disconnectWallet } from "@/lib/wallet/client";
import { useCurrentUser } from "./useCurrentUser";

export interface DeletePersonaArgs {
  /** The current kind 30078 backup event we're tombstoning. */
  backupEvent: NostrEvent;
  /** The persona's pubkey (hex). Used for the kind 0 deletion lookup. */
  personaPubkey: string;
  /** Persona npub. Used for exact query-cache eviction. */
  npub: string;
}

export type DeletePersonaWarning =
  | "backup-decrypt"
  | "lightning-address-release"
  | "kind0-lookup";

export interface DeletePersonaResult {
  deletionId: string;
  tombstoneId: string;
  warnings: DeletePersonaWarning[];
}

type MyPersonaRecord = {
  event: NostrEvent;
  envelope: PhoenixEnvelope;
  npub: string;
};

interface Nip44Signer {
  signEvent: (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<NostrEvent>;
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
}

/**
 * Best-effort: connect with the persona's seed and release the
 * Lightning Address slot so it can be reclaimed by future
 * personas (or by other Phoenix users). Swallow all errors — a
 * deletion that misses the LN release is still a successful
 * persona deletion from the operator's POV.
 */
async function tryReleaseLightningAddress(seed: string): Promise<boolean> {
  try {
    const handle = await connectWallet({ mnemonic: seed });
    try {
      await handle.deleteLightningAddress();
    } finally {
      await disconnectWallet(handle).catch(() => undefined);
    }
    return true;
  } catch (err) {
    console.warn("[useDeletePersona] LN address release failed:", err);
    return false;
  }
}

export function useDeletePersona() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation<DeletePersonaResult, Error, DeletePersonaArgs>({
    mutationFn: async ({ backupEvent, personaPubkey, npub }) => {
      if (!user) throw new Error("Sign in required");
      const signer = user.signer as unknown as Nip44Signer;
      const warnings: DeletePersonaWarning[] = [];

      // Find the d-tag we need to reuse so the addressable replacement
      // actually replaces (not appends).
      const dTag = backupEvent.tags.find(([n]) => n === "d")?.[1];
      if (!dTag) {
        throw new Error("Backup event is missing its d-tag");
      }

      // 0. Best-effort LN address release. Decrypt the backup, pull
      //    the wallet seed, ask Spark to drop the registration. We do
      //    this BEFORE the tombstone so we still have a usable seed
      //    on disk; the SDK call is the slow step (WASM init + network)
      //    but bounding the worst case is fine — failures don't block
      //    the rest of the deletion.
      try {
        const envelope = await tryDecryptPhoenixEnvelope(
          backupEvent.content,
          user.pubkey,
          signer,
        );
        const seed = envelope?.wallet?.seed;
        if (seed) {
          const released = await tryReleaseLightningAddress(seed);
          if (!released) warnings.push("lightning-address-release");
        }
      } catch (err) {
        warnings.push("backup-decrypt");
        console.warn(
          "[useDeletePersona] could not decrypt backup to release LN address:",
          err,
        );
      }

      // Best-effort: look up the persona's kind 0 so we can include
      // it in the NIP-09 request. Single relay round-trip with a tight
      // timeout — if it misses, we still publish the kind 30078
      // tombstone (the user-facing effect doesn't depend on this).
      let kind0Id: string | null = null;
      try {
        const profiles = await nostr.query(
          [{ kinds: [0], authors: [personaPubkey], limit: 1 }],
          { signal: AbortSignal.timeout(2500) }
        );
        kind0Id = profiles[0]?.id ?? null;
      } catch {
        warnings.push("kind0-lookup");
        // Swallow — kind 0 deletion is best-effort.
      }

      const now = Math.floor(Date.now() / 1000);

      // 1. NIP-09 deletion request — references whatever event ids we have.
      const deletionTags: string[][] = [["e", backupEvent.id], ["k", "30078"]];
      if (kind0Id) {
        deletionTags.push(["e", kind0Id]);
        deletionTags.push(["k", "0"]);
      }
      const deletionTemplate = {
        kind: 5,
        created_at: now,
        tags: deletionTags,
        content: "Persona deleted by operator",
      };
      const deletionSigned = await signer.signEvent(deletionTemplate);
      await publishWithTimeout(nostr, deletionSigned);

      // 2. Tombstone the addressable kind 30078 — overwrite with a
      //    sentinel that fails the PhoenixEnvelope shape check, so
      //    useMyPersonas silently drops it.
      const sentinel = {
        app: PHOENIX_PAYLOAD_APP,
        version: PHOENIX_PAYLOAD_VERSION,
        deleted: true,
        deleted_at: now,
      };
      const ciphertext = await signer.nip44.encrypt(
        user.pubkey,
        JSON.stringify(sentinel)
      );
      const tombstoneTemplate = buildEncryptedPersonaTemplate(
        { dTag, encryptedContent: ciphertext },
        now
      );
      const tombstoneSigned = await signer.signEvent(tombstoneTemplate);
      await publishWithTimeout(nostr, tombstoneSigned);

      queryClient.setQueryData(
        queryKeys.persona.mine(user.pubkey),
        (old: MyPersonaRecord[] | undefined) =>
          (old ?? []).filter(
            (record) => record.envelope.persona.pubkey !== personaPubkey,
          ),
      );
      queryClient.setQueryData(
        queryKeys.persona.detail(npub, user.pubkey),
        null,
      );

      return {
        deletionId: deletionSigned.id,
        tombstoneId: tombstoneSigned.id,
        warnings,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persona.allMine() });
      queryClient.invalidateQueries({ queryKey: queryKeys.persona.allDetails() });
    },
  });
}
