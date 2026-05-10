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
} from "@/lib/personaKey";
import { buildPersonaProfileMetadata } from "@/lib/personaProfile";
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
  bio: string;
  systemPrompt: string;
  tags: string[];
  languages: string[];
  voiceId: string;
  pictureUrl?: string;
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

      const kp = generatePersonaKeypair();
      const dTag = generatePersonaDTag();
      const trimmedName = input.name.trim() || "Untitled";
      const baseUsername = (
        input.username || slugifyForUsername(trimmedName)
      ).trim();

      const mnemonic = await generateMnemonic();

      let lightningAddress: string | undefined;
      let lnurl: string | undefined;
      let resolvedUsername: string | undefined;
      let warning: string | undefined;
      try {
        const handle = await connectWallet({ mnemonic });
        try {
          const ln = await registerLightningAddressWithRetry(handle, {
            baseUsername,
            description: `Donations to ${trimmedName}`,
            fallbackBase: "persona",
          });
          lightningAddress = ln.lightningAddress;
          lnurl = ln.lnurl;
          resolvedUsername = ln.username;
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
        resolvedUsername ??
        (isValidLightningUsername(baseUsername) ? baseUsername : undefined);

      const persona: Persona = {
        pubkey: kp.hex.pk,
        nsec: kp.nsec,
        dTag,
        name: trimmedName,
        username: finalUsername,
        display_name: trimmedName,
        system_prompt: input.systemPrompt,
        voice_id: input.voiceId,
        languages: input.languages.length > 0 ? input.languages : ["en"],
        tags: input.tags,
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
      await nostr.event(backupEvent, { signal: AbortSignal.timeout(8000) });

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
      await nostr.event(profileEvent, { signal: AbortSignal.timeout(8000) });

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
        ["phoenix-my-personas", user.pubkey],
        (old: MyPersonaRecord[] | undefined) => {
          const existing = old ?? [];
          if (existing.some((r) => r.event.id === backupEvent.id)) {
            return existing;
          }
          return [newRecord, ...existing];
        },
      );
      queryClient.setQueryData(["nostr", "author", kp.hex.pk], {
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
