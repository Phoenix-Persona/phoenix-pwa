/**
 * Backfill (or re-issue) a persona's Spark Lightning Address.
 *
 * Used by personas that already have a wallet seed but no
 * `wallet.lightning_address` (e.g. minted before the LN address flow
 * landed). The same hook can also re-register on username change —
 * the SDK's `registerLightningAddress` is idempotent at the
 * Spark-identity level, so calling it again with a different username
 * frees the old slot and claims the new one.
 *
 * Side effects on success:
 *   1. Spark assigns `<username>@spark.money` to the persona's wallet.
 *   2. Persona envelope is re-encrypted + republished (kind 30078)
 *      with the new `wallet.lightning_address` + `wallet.lnurl` and a
 *      `persona.username` field if it was previously missing.
 *   3. Persona's kind 0 profile is re-published with the resolved
 *      `lud16` so Nostr clients show the zap button.
 *
 * Best-effort posture: the SDK call is the slowest step (WASM init +
 * register call). Failures bubble up so the caller can toast; the
 * envelope never gets republished if the SDK call fails.
 */

import { useNostr } from "@nostrify/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";

import {
  buildEncryptedPersonaTemplate,
  type PhoenixEnvelope,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";
import { connectWallet, disconnectWallet } from "@/lib/wallet/client";
import { registerLightningAddressWithRetry } from "@/lib/wallet/lightningAddress";
import { buildPersonaProfileMetadata } from "@/lib/personaProfile";
import { useCurrentUser } from "./useCurrentUser";

export interface RegisterPersonaLightningAddressArgs {
  /** Username slug to attempt first. Falls back to `slugify(persona.name)` if invalid. */
  baseUsername: string;
}

export interface RegisterPersonaLightningAddressContext {
  /** The persona's current encrypted backup event — needed for the d-tag. */
  backupEvent: NostrEvent;
  /** The decrypted envelope we're updating. */
  envelope: PhoenixEnvelope;
  /** The persona's npub (for cache key invalidation). */
  npub: string;
}

export interface RegisterPersonaLightningAddressResult {
  username: string;
  lightningAddress: string;
  lnurl?: string;
}

export function useRegisterPersonaLightningAddress(
  ctx: RegisterPersonaLightningAddressContext,
) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation<
    RegisterPersonaLightningAddressResult,
    Error,
    RegisterPersonaLightningAddressArgs
  >({
    mutationFn: async ({ baseUsername }) => {
      if (!user) throw new Error("Sign in required");
      const { backupEvent, envelope } = ctx;
      const persona = envelope.persona;
      const seed = envelope.wallet?.seed;
      if (!seed) {
        throw new Error("Persona has no wallet seed to register against");
      }
      const dTag =
        persona.dTag ?? backupEvent.tags.find(([n]) => n === "d")?.[1];
      if (!dTag) {
        throw new Error("Backup event is missing its d-tag");
      }

      // 1. Register with Spark — connect on the persona's seed, retry
      //    on collision, disconnect.
      const handle = await connectWallet({ mnemonic: seed });
      let resolved: RegisterPersonaLightningAddressResult;
      try {
        const ln = await registerLightningAddressWithRetry(handle, {
          baseUsername,
          description: `Donations to ${persona.name}`,
          fallbackBase: "persona",
        });
        resolved = {
          username: ln.username,
          lightningAddress: ln.lightningAddress,
          lnurl: ln.lnurl,
        };
      } finally {
        await disconnectWallet(handle).catch(() => undefined);
      }

      // 2. Re-encrypt + republish the kind 30078 envelope with the
      //    new wallet fields. Preserve everything else verbatim.
      const updatedEnvelope: PhoenixEnvelope = {
        ...envelope,
        persona: {
          ...persona,
          username: resolved.username,
          // Keep display_name in sync if it was missing.
          display_name: persona.display_name ?? persona.name,
        },
        wallet: {
          ...envelope.wallet!,
          lightning_address: resolved.lightningAddress,
          lnurl: resolved.lnurl,
        },
      };

      const signer = user.signer as unknown as Nip44Signer;
      const ciphertext = await encryptPhoenixEnvelope(
        {
          persona: updatedEnvelope.persona,
          wallet: updatedEnvelope.wallet,
          model_prefs: updatedEnvelope.model_prefs,
          settings: updatedEnvelope.settings,
        },
        user.pubkey,
        signer,
      );
      const tmpl = buildEncryptedPersonaTemplate({
        dTag,
        encryptedContent: ciphertext,
      });
      const signed = await user.signer.signEvent(tmpl);
      await nostr.event(signed, { signal: AbortSignal.timeout(8000) });

      // 3. Republish kind 0 with the new lud16. Best-effort — the
      //    encrypted backup is already saved, so a kind-0 failure
      //    only affects the public donate button on Nostr clients
      //    (not Phoenix itself, which reads from the envelope).
      try {
        const decoded = nip19.decode(persona.nsec);
        if (decoded.type !== "nsec") throw new Error("Bad nsec");
        const { finalizeEvent } = await import("nostr-tools/pure");

        // Read the current kind 0 so we don't blow away bio/picture
        // the user set elsewhere. Single-relay round-trip with a
        // tight timeout — fall back to envelope-derived defaults.
        let bio = "";
        let picture = persona.reference_image_url ?? "";
        try {
          const events = await nostr.query(
            [{ kinds: [0], authors: [persona.pubkey], limit: 1 }],
            { signal: AbortSignal.timeout(2500) },
          );
          const ev = events[0];
          if (ev) {
            const meta = JSON.parse(ev.content) as {
              about?: string;
              picture?: string;
            };
            bio = meta.about ?? "";
            if (meta.picture) picture = meta.picture;
          }
        } catch {
          // Use defaults.
        }

        const kind0Content = buildPersonaProfileMetadata({
          name: persona.name,
          username: resolved.username,
          displayName: updatedEnvelope.persona.display_name ?? persona.name,
          bio,
          pictureUrl: picture || undefined,
          lightningAddress: resolved.lightningAddress,
        });

        const profileTemplate = {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify(kind0Content),
        };
        const profileEvent = finalizeEvent(profileTemplate, decoded.data);
        await nostr.event(profileEvent, {
          signal: AbortSignal.timeout(8000),
        });
      } catch (err) {
        console.warn(
          "[useRegisterPersonaLightningAddress] kind 0 republish failed:",
          err,
        );
      }

      return resolved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phoenix-persona"] });
      queryClient.invalidateQueries({ queryKey: ["phoenix-my-personas"] });
      queryClient.invalidateQueries({ queryKey: ["nostr", "author"] });
      queryClient.invalidateQueries({
        queryKey: ["persona-public-profile"],
      });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
  });
}
