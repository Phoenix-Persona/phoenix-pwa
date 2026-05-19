/**
 * Hooks for fetching Phoenix persona configurations.
 *
 * Phoenix persona events carry no identifying tags (privacy by design),
 * so the only way to find them is to query the user's own kind 30078
 * events, attempt NIP-44 decryption on each, and check whether the
 * decrypted plaintext matches the Phoenix envelope shape.
 *
 * This is slower than tag-filtered queries but inherent to the threat
 * model — anything that would let us tag-filter would also let an
 * external observer enumerate users using Phoenix.
 *
 * Decryption cache
 * ────────────────
 * NIP-44 decryption can be expensive (especially when the user's signer
 * is a remote NIP-46 bunker — every decrypt is a round-trip to the
 * signer app). We cache results keyed by `event.id`, so subsequent
 * persona switches and `useMyPersonas` calls reuse decryption work.
 *
 * Cache entries are immutable per event id (an event id is a hash over
 * the canonical event so the ciphertext is fixed). We store either the
 * parsed envelope OR a "not-phoenix" sentinel for events that decrypted
 * but weren't Phoenix payloads (or didn't decrypt at all from this
 * signer). Both outcomes are stable across the session.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";

import type { PhoenixEnvelope } from "@/lib/persona";
import type { Nip44Signer } from "@/lib/personaCrypto";
import { npubToHex } from "@/lib/nostrIds";
import { withNostrQueryTimeout } from "@/lib/nostrQuery";
import { queryKeys } from "@/lib/queryKeys";
import {
  classifyEncryptedAppDataEvent,
  clearEncryptedAppDataDecryptCache,
  operatorEncryptedAppDataQuery,
} from "./useEncryptedAppData";
import { useCurrentUser } from "./useCurrentUser";

const PERSONA_PUBLIC_QUERY_TIMEOUT_MS = 3000;

export function clearPersonaDecryptCache(): void {
  clearEncryptedAppDataDecryptCache();
}

/** Test-only backwards-compatible alias. */
export const __clearPersonaDecryptCache = clearPersonaDecryptCache;

/**
 * Look up a single persona by persona npub. Walks the user's kind
 * 30078 events, decrypts each (with cache), and returns the one whose
 * envelope's persona.pubkey matches the requested npub.
 */
export function usePersona(npub: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.persona.detail(npub, user?.pubkey),
    enabled: Boolean(npub && user),
    queryFn: async (
      c
    ): Promise<{ event: NostrEvent; envelope: PhoenixEnvelope } | null> => {
      if (!npub || !user) return null;
      const personaHex = npubToHex(npub);
      if (!personaHex) throw new Error("Invalid npub");

      const events = await queryClient.fetchQuery(
        operatorEncryptedAppDataQuery(nostr, user.pubkey),
      );

      const signer = user.signer as unknown as Nip44Signer;

      for (const ev of events) {
        if (c.signal.aborted) return null;
        const classified = await classifyEncryptedAppDataEvent(
          ev,
          user.pubkey,
          signer,
        );
        if (classified.type !== "persona") continue;
        if (
          classified.envelope.persona.pubkey.toLowerCase() ===
          personaHex.toLowerCase()
        ) {
          return { event: ev, envelope: classified.envelope };
        }
      }

      return null;
    },
  });
}

/**
 * List the user's Phoenix personas. Decrypts every kind 30078 the
 * user has authored and keeps the ones that parse as Phoenix payloads.
 * Other apps' encrypted-app-data events are skipped silently.
 */
export function useMyPersonas() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.persona.mine(user?.pubkey),
    enabled: Boolean(user),
    queryFn: async (c) => {
      if (!user) return [];

      const events = await queryClient.fetchQuery(
        operatorEncryptedAppDataQuery(nostr, user.pubkey),
      );

      const signer = user.signer as unknown as Nip44Signer;
      const decrypted: Array<{
        event: NostrEvent;
        envelope: PhoenixEnvelope;
        npub: string;
      }> = [];

      for (const ev of events) {
        if (c.signal.aborted) return [];
        const classified = await classifyEncryptedAppDataEvent(
          ev,
          user.pubkey,
          signer,
        );
        if (classified.type !== "persona") continue;
        decrypted.push({
          event: ev,
          envelope: classified.envelope,
          npub: classified.npub,
        });
      }

      return decrypted.sort((a, b) => b.event.created_at - a.event.created_at);
    },
  });
}

export interface PersonaActivityStats {
  /** Total kind 1 events authored by this persona that we've seen. */
  postCount: number;
  /** Unix-second timestamp of the most recent post, or null if none. */
  lastActive: number | null;
}

/**
 * Batch-query post activity for many personas at once.
 *
 * Used by directory pages (MyPersonas grid, Settings persona list)
 * that want a small "X posts · last active 3d ago" caption per card
 * without firing N separate queries. One filter, one round-trip,
 * group by author client-side. Pubkeys are sorted before the
 * queryKey serialises so card-order churn doesn't blow the cache.
 */
export function usePersonaActivityStats(pubkeys: string[] | undefined) {
  const { nostr } = useNostr();
  const sorted = (pubkeys ?? []).slice().sort();

  return useQuery({
    queryKey: queryKeys.persona.activity(sorted.join(",")),
    enabled: sorted.length > 0,
    queryFn: async (c): Promise<Map<string, PersonaActivityStats>> => {
      const stats = new Map<string, PersonaActivityStats>();
      if (sorted.length === 0) return stats;

      // Cap the query to a reasonable budget. 100 events × N personas
      // is plenty for a directory caption — richer feeds use the
      // dedicated usePersonaPosts query.
      const events = await nostr.query(
        [
          {
            kinds: [1],
            authors: sorted,
            limit: Math.min(500, sorted.length * 100),
          },
        ],
        { signal: withNostrQueryTimeout(c.signal, PERSONA_PUBLIC_QUERY_TIMEOUT_MS) }
      );

      for (const ev of events) {
        const cur = stats.get(ev.pubkey);
        if (!cur) {
          stats.set(ev.pubkey, {
            postCount: 1,
            lastActive: ev.created_at,
          });
        } else {
          cur.postCount++;
          if (ev.created_at > (cur.lastActive ?? 0)) {
            cur.lastActive = ev.created_at;
          }
        }
      }

      // Ensure every requested pubkey has an entry, even with zero
      // posts — callers can skip a has-key check.
      for (const pk of sorted) {
        if (!stats.has(pk)) {
          stats.set(pk, { postCount: 0, lastActive: null });
        }
      }
      return stats;
    },
  });
}

/**
 * Fetch posts authored by a persona (PUBLIC kind 1 events).
 * Anyone can view a persona's feed — it looks like any other Nostr account.
 */
export function usePersonaPosts(npub: string | undefined, limit = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: queryKeys.persona.posts(npub, limit),
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
        { signal: withNostrQueryTimeout(c.signal, PERSONA_PUBLIC_QUERY_TIMEOUT_MS) }
      );

      return events.sort((a, b) => b.created_at - a.created_at);
    },
  });
}
