import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";

import {
  buildEncryptedPersonaTemplate,
  DEFAULT_MODEL_PREFS,
  generatePersonaDTag,
  PHOENIX_PAYLOAD_APP,
  PHOENIX_PAYLOAD_VERSION,
  type Persona,
  type PersonaWallet,
  type PhoenixEnvelope,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";
import {
  generatePersonaKeypair,
  signWithPersona,
  type PersonaKeypair,
} from "@/lib/personaKey";
import { buildPersonaProfileMetadata } from "@/lib/personaProfile";
import { publishWithTimeout } from "@/lib/nostrPublish";
import { queryKeys } from "@/lib/queryKeys";
import {
  connectWallet,
  disconnectWallet,
  generateMnemonic,
} from "@/lib/wallet/client";
import { DEFAULT_AUTO_TOPUP_CONFIG } from "@/lib/wallet/types";
import {
  isValidLightningUsername,
  registerLightningAddressWithRetry,
  slugifyForUsername,
} from "@/lib/wallet/lightningAddress";

import { useCurrentUser } from "./useCurrentUser";

export interface CreatePersonaInput {
  name: string;
  username: string;
  lightningUsername: string;
  bio: string;
  systemPrompt: string;
  pictureUrl?: string;
  /**
   * Optional pre-generated persona keypair. When provided, the hook
   * uses it instead of generating a fresh one.
   *
   * Onboard generates this at Create time so any staged picture upload
   * and the public profile publish use the same persona identity.
   */
  keypair?: PersonaKeypair;
}

export interface CreatePersonaResult {
  npub: string;
  envelope: PhoenixEnvelope;
  backupEvent: NostrEvent;
  profileEvent: NostrEvent;
  warning?: string;
}

type MyPersonaRecord = {
  event: NostrEvent;
  envelope: PhoenixEnvelope;
  npub: string;
};

export function useCreatePersona() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation<CreatePersonaResult, Error, CreatePersonaInput>({
    mutationFn: async (input) => {
      if (!user) throw new Error("Sign in required");

      const kp = input.keypair ?? generatePersonaKeypair();
      const dTag = generatePersonaDTag();
      const trimmedName = input.name.trim() || "Untitled";
      const personaUsername = (
        input.username || slugifyForUsername(trimmedName)
      ).trim();
      const baseLightningUsername = (
        input.lightningUsername || slugifyForUsername(trimmedName)
      ).trim();

      const mnemonic = await generateMnemonic();

      let lightningAddress: string | undefined;
      let lnurl: string | undefined;
      let warning: string | undefined;
      try {
        const handle = await connectWallet({ mnemonic });
        try {
          const ln = await registerLightningAddressWithRetry(handle, {
            baseUsername: baseLightningUsername,
            description: `Donations to ${trimmedName}`,
            fallbackBase: "persona",
          });
          lightningAddress = ln.lightningAddress;
          lnurl = ln.lnurl;
        } finally {
          await disconnectWallet(handle).catch(() => undefined);
        }
      } catch (err) {
        warning =
          err instanceof Error
            ? err.message
            : "Could not register the persona's Lightning Address.";
      }

      const finalUsername =
        isValidLightningUsername(personaUsername) ? personaUsername : undefined;

      const persona: Persona = {
        pubkey: kp.hex.pk,
        nsec: kp.nsec,
        dTag,
        name: trimmedName,
        username: finalUsername,
        display_name: trimmedName,
        system_prompt: input.systemPrompt,
        reference_image_url: input.pictureUrl || undefined,
        created_at: Math.floor(Date.now() / 1000),
      };

      const wallet: PersonaWallet = {
        kind: "spark",
        seed: mnemonic,
        lightning_address: lightningAddress,
        lnurl,
        auto_topup: {
          enabled: DEFAULT_AUTO_TOPUP_CONFIG.enabled,
          threshold_usd: DEFAULT_AUTO_TOPUP_CONFIG.thresholdUsd,
          target_usd: DEFAULT_AUTO_TOPUP_CONFIG.targetUsd,
        },
      };

      const signer = user.signer as unknown as Nip44Signer;
      const ciphertext = await encryptPhoenixEnvelope(
        {
          persona,
          wallet,
          model_prefs: DEFAULT_MODEL_PREFS,
        },
        user.pubkey,
        signer,
      );

      const personaTemplate = buildEncryptedPersonaTemplate({
        dTag,
        encryptedContent: ciphertext,
      });
      const backupEvent = await user.signer.signEvent(personaTemplate);
      await publishWithTimeout(nostr, backupEvent);

      const metadata = buildPersonaProfileMetadata({
        name: persona.name,
        username: persona.username,
        displayName: persona.display_name ?? persona.name,
        bio: input.bio,
        pictureUrl: input.pictureUrl || undefined,
        lightningAddress,
      });
      const profileEvent = signWithPersona(
        {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify(metadata),
        },
        kp,
      );
      await publishWithTimeout(nostr, profileEvent);

      const envelope: PhoenixEnvelope = {
        app: PHOENIX_PAYLOAD_APP,
        version: PHOENIX_PAYLOAD_VERSION,
        persona,
        wallet,
        model_prefs: DEFAULT_MODEL_PREFS,
      };

      const newRecord: MyPersonaRecord = {
        event: backupEvent,
        envelope,
        npub: kp.npub,
      };
      queryClient.setQueryData(
        queryKeys.persona.mine(user.pubkey),
        (old: MyPersonaRecord[] | undefined) => {
          const existing = old ?? [];
          if (existing.some((r) => r.event.id === backupEvent.id)) {
            return existing;
          }
          return [newRecord, ...existing];
        },
      );
      // Prime the detail cache so an immediate navigate to /dashboard/<npub>
      // renders without a relay round-trip.
      queryClient.setQueryData(
        queryKeys.persona.detail(kp.npub, user.pubkey),
        { event: backupEvent, envelope, npub: kp.npub },
      );
      // Prime the public-profile cache (bio + picture come from kind 0).
      queryClient.setQueryData(
        queryKeys.persona.publicProfile(kp.hex.pk),
        { bio: input.bio, pictureUrl: input.pictureUrl || null },
      );
      queryClient.setQueryData(queryKeys.nostr.author(kp.hex.pk), {
        event: profileEvent,
        metadata,
      });

      return {
        npub: kp.npub,
        envelope,
        backupEvent,
        profileEvent,
        warning,
      };
    },
  });
}
