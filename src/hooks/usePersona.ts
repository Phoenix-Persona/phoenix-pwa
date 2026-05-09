/**
 * Hooks for fetching Phoenix persona configurations.
 *
 * Persona configs are encrypted to the operator. The operator's signer
 * (NIP-44) is required to decrypt — so these hooks only return useful data
 * for personas owned by the currently signed-in user.
 */

import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";

import {
  PERSONA_FILTER_TAG,
  PERSONA_KIND,
  getPersonaPubkeyFromEvent,
  type PersonaConfig,
} from "@/lib/persona";
import { decryptPersonaConfig, type Nip44Signer } from "@/lib/personaCrypto";
import { useCurrentUser } from "./useCurrentUser";

function npubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") return null;
    return decoded.data;
  } catch {
    return null;
  }
}

/**
 * Look up a single persona event by persona npub.
 *
 * The event is authored by the *operator* but tagged with the persona's
 * pubkey via the d-tag and a `p` tag. Once located, the content is decrypted
 * using the current operator's signer.
 *
 * If the current user is not the operator, decryption fails and the hook
 * returns an error — the persona is private to its creator.
 */
export function usePersona(npub: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ["phoenix-persona", npub, user?.pubkey],
    enabled: Boolean(npub && user),
    queryFn: async (c): Promise<{ event: NostrEvent; config: PersonaConfig } | null> => {
      if (!npub || !user) return null;
      const personaHex = npubToHex(npub);
      if (!personaHex) throw new Error("Invalid npub");

      // The persona event is authored by THIS operator (only the operator
      // can have signed it). Filter by author + persona pubkey via #d.
      const events = await nostr.query(
        [
          {
            kinds: [PERSONA_KIND],
            authors: [user.pubkey],
            "#d": [personaHex],
            "#t": [PERSONA_FILTER_TAG],
            limit: 1,
          },
        ],
        { signal: c.signal }
      );

      const event = events[0];
      if (!event) return null;
      if (getPersonaPubkeyFromEvent(event) !== personaHex) return null;

      const signer = user.signer as unknown as Nip44Signer;
      const config = await decryptPersonaConfig(
        event.content,
        event.pubkey,
        signer
      );
      return { event, config };
    },
  });
}

/**
 * List the operator's own personas (decrypted).
 */
export function useMyPersonas() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ["phoenix-my-personas", user?.pubkey],
    enabled: Boolean(user),
    queryFn: async (c) => {
      if (!user) return [];

      const events = await nostr.query(
        [
          {
            kinds: [PERSONA_KIND],
            authors: [user.pubkey],
            "#t": [PERSONA_FILTER_TAG],
            limit: 100,
          },
        ],
        { signal: c.signal }
      );

      // Deduplicate by persona pubkey (d-tag) — keep latest per persona.
      const byPersona = new Map<string, NostrEvent>();
      for (const ev of events) {
        const pp = getPersonaPubkeyFromEvent(ev);
        if (!pp) continue;
        const existing = byPersona.get(pp);
        if (!existing || existing.created_at < ev.created_at) {
          byPersona.set(pp, ev);
        }
      }

      const signer = user.signer as unknown as Nip44Signer;
      const decrypted: Array<{
        event: NostrEvent;
        config: PersonaConfig;
        npub: string;
      }> = [];

      for (const ev of byPersona.values()) {
        try {
          const config = await decryptPersonaConfig(
            ev.content,
            ev.pubkey,
            signer
          );
          const personaPubkey = getPersonaPubkeyFromEvent(ev);
          if (!personaPubkey) continue;
          decrypted.push({
            event: ev,
            config,
            npub: nip19.npubEncode(personaPubkey),
          });
        } catch (err) {
          // Skip undecryptable events (shouldn't happen if filter is correct).
          console.warn("Failed to decrypt persona event", ev.id, err);
        }
      }

      return decrypted.sort((a, b) => b.event.created_at - a.event.created_at);
    },
  });
}

/**
 * Fetch posts authored by a persona (PUBLIC kind 1 events).
 * No auth required — anyone can view a persona's feed.
 */
export function usePersonaPosts(npub: string | undefined, limit = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["phoenix-persona-posts", npub, limit],
    enabled: Boolean(npub),
    queryFn: async (c) => {
      if (!npub) return [];
      const hex = npubToHex(npub);
      if (!hex) return [];

      const events = await nostr.query(
        [
          {
            kinds: [1],
            authors: [hex],
            limit,
          },
        ],
        { signal: c.signal }
      );

      return events.sort((a, b) => b.created_at - a.created_at);
    },
  });
}
