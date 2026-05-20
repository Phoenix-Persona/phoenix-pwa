import { useCallback, useMemo } from "react";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";
import { useQueryClient } from "@tanstack/react-query";

import {
  buildEncryptedPersonaTemplate,
  type PhoenixEnvelope,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";
import { publishWithTimeout } from "@/lib/nostrPublish";
import type { PpqAccount } from "@/lib/ppq/types";
import { queryKeys } from "@/lib/queryKeys";

import { useCurrentUser } from "./useCurrentUser";
import type { PpqAccountOptions } from "./usePpqAccount";

type MyPersonaRecord = {
  event: NostrEvent;
  envelope: PhoenixEnvelope;
  npub: string;
};

export interface UsePersonaPpqAccountOptionsArgs {
  npub: string | undefined;
  backupEvent: NostrEvent | undefined;
  envelope: PhoenixEnvelope | null | undefined;
  isLoading: boolean;
  refetchEnvelope?: () => Promise<PhoenixEnvelope | null | undefined>;
}

export function usePersonaPpqAccountOptions({
  npub,
  backupEvent,
  envelope,
  isLoading,
  refetchEnvelope,
}: UsePersonaPpqAccountOptionsArgs): PpqAccountOptions {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const persistAccount = useCallback(
    async (account: PpqAccount) => {
      if (!user) throw new Error("Sign in required");
      if (!npub || !backupEvent || !envelope) {
        throw new Error("Persona backup is not loaded.");
      }

      const dTag =
        envelope.persona.dTag ??
        backupEvent.tags.find(([name]) => name === "d")?.[1];
      if (!dTag) throw new Error("Backup event is missing its d-tag.");

      const signer = user.signer as unknown as Nip44Signer;
      const nextEnvelope: PhoenixEnvelope = {
        ...envelope,
        persona: {
          ...envelope.persona,
          dTag,
        },
        ppq: account,
      };
      const ciphertext = await encryptPhoenixEnvelope(
        nextEnvelope,
        user.pubkey,
        signer,
      );
      const template = buildEncryptedPersonaTemplate({
        dTag,
        encryptedContent: ciphertext,
      });
      const signed = await user.signer.signEvent(template);
      await publishWithTimeout(nostr, signed);

      const updatedRecord: MyPersonaRecord = {
        event: signed,
        envelope: nextEnvelope,
        npub,
      };
      queryClient.setQueryData(
        queryKeys.persona.detail(npub, user.pubkey),
        updatedRecord,
      );
      queryClient.setQueryData(
        queryKeys.persona.mine(user.pubkey),
        (old: MyPersonaRecord[] | undefined) =>
          (old ?? []).map((record) =>
            record.envelope.persona.pubkey === nextEnvelope.persona.pubkey
              ? updatedRecord
              : record,
          ),
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.persona.allDetails(),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.persona.allMine() });
    },
    [backupEvent, envelope, nostr, npub, queryClient, user],
  );

  return useMemo(
    () => ({
      scope: "persona" as const,
      ownerKey: envelope?.persona.pubkey,
      account: envelope?.ppq,
      isLoading,
      refetchAccount: refetchEnvelope
        ? async () => {
            const refreshed = await refetchEnvelope();
            return refreshed?.ppq ?? null;
          }
        : undefined,
      persistAccount,
    }),
    [
      envelope?.persona.pubkey,
      envelope?.ppq,
      isLoading,
      persistAccount,
      refetchEnvelope,
    ],
  );
}
