import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";

import {
  buildEncryptedPersonaTemplate,
  type PhoenixEnvelope,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";
import { publishWithTimeout } from "@/lib/nostrPublish";
import { queryKeys } from "@/lib/queryKeys";
import {
  autoTopupConfigToPersisted,
  type AutoTopupConfig,
} from "@/lib/wallet/types";

import { useCurrentUser } from "./useCurrentUser";

interface UpdateWalletAutoTopupInput {
  backupEvent: NostrEvent;
  envelope: PhoenixEnvelope;
  npub: string;
  autoTopup: AutoTopupConfig;
}

type MyPersonaRecord = {
  event: NostrEvent;
  envelope: PhoenixEnvelope;
  npub: string;
};

export function useUpdateWalletAutoTopup() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation<void, Error, UpdateWalletAutoTopupInput>({
    mutationFn: async (input) => {
      if (!user) throw new Error("Sign in required");
      if (!input.envelope.wallet) {
        throw new Error("No wallet is available for this persona.");
      }

      const dTag =
        input.envelope.persona.dTag ??
        input.backupEvent.tags.find(([name]) => name === "d")?.[1];
      if (!dTag) throw new Error("Backup event is missing its d-tag.");

      const signer = user.signer as unknown as Nip44Signer;
      const nextEnvelope: PhoenixEnvelope = {
        ...input.envelope,
        persona: {
          ...input.envelope.persona,
          dTag,
        },
        wallet: {
          ...input.envelope.wallet,
          auto_topup: autoTopupConfigToPersisted(input.autoTopup),
        },
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
        npub: input.npub,
      };
      queryClient.setQueryData(
        queryKeys.persona.detail(input.npub, user.pubkey),
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
  });
}
