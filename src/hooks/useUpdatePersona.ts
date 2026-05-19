import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";
import { finalizeEvent } from "nostr-tools/pure";

import {
  buildEncryptedPersonaTemplate,
  type Persona,
  type PersonaWallet,
  type PhoenixEnvelope,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";
import { publishWithTimeout, tryPublishWithTimeout } from "@/lib/nostrPublish";
import { buildPersonaProfileMetadata } from "@/lib/personaProfile";
import { safePersonaPictureUrl } from "@/lib/personaView";
import { queryKeys } from "@/lib/queryKeys";
import { connectWallet, disconnectWallet } from "@/lib/wallet/client";
import {
  LightningUsernameTakenError,
  registerLightningAddressWithRetry,
  SPARK_LN_DOMAIN,
} from "@/lib/wallet/lightningAddress";

import { useCurrentUser } from "./useCurrentUser";

export interface UpdatePersonaInput {
  backupEvent: NostrEvent;
  envelope: PhoenixEnvelope;
  npub: string;
  name: string;
  username: string;
  lightningUsername: string;
  systemPrompt: string;
  bio: string;
  originalBio: string;
  bioHydrated: boolean;
  pictureUrl: string;
  originalPicture: string;
  pictureHydrated: boolean;
  crossPost: Persona["cross_post"];
}

export interface UpdatePersonaResult {
  updated: Persona;
  backupEvent: NostrEvent;
  profileEvent?: NostrEvent;
  profileWarning?: string;
}

type MyPersonaRecord = {
  event: NostrEvent;
  envelope: PhoenixEnvelope;
  npub: string;
};

function lightningUsernameFromAddress(address: string | undefined): string | undefined {
  return address?.split("@")[0];
}

export function useUpdatePersona() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation<UpdatePersonaResult, Error, UpdatePersonaInput>({
    mutationFn: async (input) => {
      if (!user) throw new Error("Sign in required");
      const { backupEvent, envelope } = input;
      const original = envelope.persona;

      const dTag =
        original.dTag ?? backupEvent.tags.find(([n]) => n === "d")?.[1];
      if (!dTag) throw new Error("Backup event is missing its d-tag.");

      let registeredAddress: string | undefined;
      let registeredLnurl: string | undefined;
      const resolvedUsername = input.username || original.username;
      const usernameChanged =
        input.username.length > 0 && input.username !== original.username;
      const currentLightningUsername =
        lightningUsernameFromAddress(envelope.wallet?.lightning_address) ??
        original.username ??
        "";
      const lightningUsernameChanged =
        input.lightningUsername.length > 0 &&
        input.lightningUsername !== currentLightningUsername;
      const seed = envelope.wallet?.seed;
      if (lightningUsernameChanged && !seed) {
        throw new Error("No wallet seed available to update Lightning Address.");
      }
      if (lightningUsernameChanged && seed) {
        const handle = await connectWallet({ mnemonic: seed });
        try {
          try {
            const ln = await registerLightningAddressWithRetry(handle, {
              baseUsername: input.lightningUsername,
              description: `Donations to ${input.name.trim() || original.name}`,
              fallbackBase: "persona",
            });
            registeredAddress = ln.lightningAddress;
            registeredLnurl = ln.lnurl;
          } catch (err) {
            if (err instanceof LightningUsernameTakenError) {
              throw new Error(
                `${input.lightningUsername}@${SPARK_LN_DOMAIN} is already taken. Pick a different Lightning address before saving.`,
                { cause: err },
              );
            }
            throw err;
          }
        } finally {
          await disconnectWallet(handle).catch(() => undefined);
        }
      }

      const trimmedName = input.name.trim() || original.name;
      const updated: Persona = {
        ...original,
        dTag,
        name: trimmedName,
        display_name: trimmedName,
        username: resolvedUsername,
        system_prompt: input.systemPrompt,
        reference_image_url: input.pictureUrl || undefined,
        cross_post: input.crossPost,
      };

      const updatedWallet: PersonaWallet | undefined = envelope.wallet
        ? {
            ...envelope.wallet,
            ...(registeredAddress !== undefined
              ? { lightning_address: registeredAddress }
              : {}),
            ...(registeredLnurl !== undefined
              ? { lnurl: registeredLnurl }
              : {}),
          }
        : undefined;

      const signer = user.signer as unknown as Nip44Signer;
      const nextEnvelope: PhoenixEnvelope = {
        app: envelope.app,
        version: envelope.version,
        persona: updated,
        wallet: updatedWallet,
        ppq: envelope.ppq,
        model_prefs: envelope.model_prefs,
        settings: envelope.settings,
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

      const displayNameChanged = updated.name !== original.name;
      const bioChanged = input.bioHydrated && input.bio !== input.originalBio;
      const pictureChanged =
        input.pictureHydrated && input.pictureUrl !== input.originalPicture;
      const lud16Changed = registeredAddress !== undefined;
      let profileEvent: NostrEvent | undefined;
      let profileWarning: string | undefined;
      if (
        displayNameChanged ||
        bioChanged ||
        pictureChanged ||
        usernameChanged ||
        lud16Changed
      ) {
        try {
          const decoded = nip19.decode(updated.nsec);
          if (decoded.type !== "nsec") throw new Error("Bad nsec");
          const finalLightningAddress =
            registeredAddress ?? envelope.wallet?.lightning_address;
          const kind0Content = buildPersonaProfileMetadata({
            name: updated.name,
            username: updated.username,
            displayName: updated.display_name ?? updated.name,
            bio: input.bio,
            pictureUrl: input.pictureUrl || undefined,
            lightningAddress: finalLightningAddress,
          });
          profileEvent = finalizeEvent(
            {
              kind: 0,
              created_at: Math.floor(Date.now() / 1000),
              tags: [],
              content: JSON.stringify(kind0Content),
            },
            decoded.data,
          );
          const publishAttempt = await tryPublishWithTimeout(
            nostr,
            profileEvent,
            "persona-profile-publish",
          );
          if (!publishAttempt.ok) {
            profileWarning = publishAttempt.error.message;
            console.warn(
              "Failed to update persona profile:",
              publishAttempt.error,
            );
          }
        } catch (error) {
          // The encrypted persona backup is the source of truth for this edit.
          // Keep public kind-0 refresh best-effort so a profile relay failure
          // does not make a successful backup save look like a failed edit.
          profileWarning =
            error instanceof Error
              ? error.message
              : "Unknown profile publish error";
          console.warn("Failed to update persona profile:", error);
        }
      }

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
            record.envelope.persona.pubkey === updated.pubkey
              ? updatedRecord
              : record,
          ),
      );
      if (profileEvent && !profileWarning) {
        const metadata = buildPersonaProfileMetadata({
          name: updated.name,
          username: updated.username,
          displayName: updated.display_name ?? updated.name,
          bio: input.bio,
          pictureUrl: input.pictureUrl || undefined,
          lightningAddress:
            registeredAddress ?? updatedWallet?.lightning_address,
        });
        queryClient.setQueryData(queryKeys.nostr.author(updated.pubkey), {
          event: profileEvent,
          metadata,
        });
        queryClient.setQueryData(queryKeys.persona.publicProfile(updated.pubkey), {
          bio: input.bio,
          pictureUrl: safePersonaPictureUrl(input.pictureUrl),
        });
      } else if (
        displayNameChanged ||
        bioChanged ||
        pictureChanged ||
        usernameChanged ||
        lud16Changed
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.nostr.author(updated.pubkey),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.persona.publicProfile(updated.pubkey),
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.persona.allDetails() });
      queryClient.invalidateQueries({ queryKey: queryKeys.persona.allMine() });

      return { updated, backupEvent: signed, profileEvent, profileWarning };
    },
  });
}
