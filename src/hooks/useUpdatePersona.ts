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
import { buildPersonaProfileMetadata } from "@/lib/personaProfile";
import { connectWallet, disconnectWallet } from "@/lib/wallet/client";
import { registerLightningAddressWithRetry } from "@/lib/wallet/lightningAddress";

import { useCurrentUser } from "./useCurrentUser";

export interface UpdatePersonaInput {
  backupEvent: NostrEvent;
  envelope: PhoenixEnvelope;
  npub: string;
  name: string;
  username: string;
  systemPrompt: string;
  voiceId: string;
  languages: string[];
  tags: string[];
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
      let resolvedUsername = input.username || original.username;
      const usernameChanged =
        input.username.length > 0 && input.username !== original.username;
      const seed = envelope.wallet?.seed;
      if (usernameChanged && seed) {
        const handle = await connectWallet({ mnemonic: seed });
        try {
          const ln = await registerLightningAddressWithRetry(handle, {
            baseUsername: input.username,
            description: `Donations to ${input.name.trim() || original.name}`,
            fallbackBase: "persona",
          });
          registeredAddress = ln.lightningAddress;
          registeredLnurl = ln.lnurl;
          resolvedUsername = ln.username;
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
        voice_id: input.voiceId.trim() || original.voice_id,
        languages:
          input.languages.length > 0 ? input.languages : original.languages,
        tags: input.tags,
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
      const ciphertext = await encryptPhoenixEnvelope(
        {
          persona: updated,
          wallet: updatedWallet,
          model_prefs: envelope.model_prefs,
          settings: envelope.settings,
        },
        user.pubkey,
        signer,
      );

      const template = buildEncryptedPersonaTemplate({
        dTag,
        encryptedContent: ciphertext,
      });
      const signed = await user.signer.signEvent(template);
      await nostr.event(signed, { signal: AbortSignal.timeout(8000) });

      const displayNameChanged = updated.name !== original.name;
      const bioChanged = input.bioHydrated && input.bio !== input.originalBio;
      const pictureChanged =
        input.pictureHydrated && input.pictureUrl !== input.originalPicture;
      const lud16Changed = registeredAddress !== undefined;
      let profileEvent: NostrEvent | undefined;
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
          await nostr.event(profileEvent, {
            signal: AbortSignal.timeout(8000),
          });
        } catch (error) {
          // The encrypted persona backup is the source of truth for this edit.
          // Keep public kind-0 refresh best-effort so a profile relay failure
          // does not make a successful backup save look like a failed edit.
          console.warn("Failed to update persona profile:", error);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["phoenix-persona"] });
      queryClient.invalidateQueries({ queryKey: ["phoenix-my-personas"] });
      queryClient.invalidateQueries({ queryKey: ["nostr", "author"] });
      queryClient.invalidateQueries({
        queryKey: ["persona-public-profile"],
      });

      return { updated, backupEvent: signed, profileEvent };
    },
  });
}
