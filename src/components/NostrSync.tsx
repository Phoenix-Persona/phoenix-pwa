import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { APP_RELAYS } from '@/lib/appRelays';
import { APP_BLOSSOM_SERVERS, parseBlossomServerList } from '@/lib/appBlossom';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Drop every cache that depends on the user-pubkey filter or on which
 * relays we're talking to. Called when the active user changes (so
 * the previous user's events don't bleed through) and when the
 * relay/Blossom list updates (so queries refetch against the now-
 * correct sources).
 */
function invalidateUserDependentCaches(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.persona.allMine() });
  queryClient.invalidateQueries({ queryKey: queryKeys.persona.allDetails() });
  queryClient.invalidateQueries({ queryKey: queryKeys.persona.allPosts() });
  queryClient.invalidateQueries({ queryKey: queryKeys.nostr.authors() });
}

/**
 * NostrSync — keeps the AppContext relay / Blossom lists in lock-step
 * with the active user.
 *
 * Behavior:
 *   - On the very first mount: trust whatever's persisted (the user
 *     is whoever Nostrify just restored from localStorage). Run the
 *     usual NIP-65 / NIP-94 sync against them.
 *   - When the active user changes (login replacement or logout):
 *     reset both lists to the app defaults FIRST, so the previous
 *     user's relays / Blossom servers don't bleed into the next
 *     user's session. Then re-run the sync against the new user (or
 *     leave defaults in place if they logged out).
 *
 * The reset matters for the "log out, log in as someone else" path
 * the most: a fresh user with no kind 10002 event would otherwise
 * inherit whatever list the prior user had.
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { updateConfig } = useAppContext();
  const queryClient = useQueryClient();

  // Tracks which pubkey we last synced for. `undefined` on first
  // mount; `null` when no user is signed in.
  const lastSyncedPubkey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const currentPubkey = user?.pubkey ?? null;
    const isFirstMount = lastSyncedPubkey.current === undefined;
    const userChanged = !isFirstMount && lastSyncedPubkey.current !== currentPubkey;
    lastSyncedPubkey.current = currentPubkey;

    if (userChanged) {
      // Reset before the sync queries fire so a brand-new user with
      // no kind 10002 / 10063 events sees the app defaults — not the
      // previous user's lists.
      updateConfig((current) => ({
        ...current,
        relayMetadata: APP_RELAYS,
        blossomServerMetadata: APP_BLOSSOM_SERVERS,
      }));
      // Drop the prior user's cached personas / kind 0 metadata so
      // the next render queries against the fresh signer.
      invalidateUserDependentCaches(queryClient);
    }

    if (!user) return;

    // Guarded by the most recent updateConfig callback so the
    // freshness comparison sees post-reset state, not stale closure
    // values.
    const syncRelays = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );
        const event = events[0];
        if (!event) return;

        const fetchedRelays = event.tags
          .filter(([name]) => name === 'r')
          .map(([_, url, marker]) => ({
            url,
            read: !marker || marker === 'read',
            write: !marker || marker === 'write',
          }));
        if (fetchedRelays.length === 0) return;

        updateConfig((current) => {
          const currentUpdatedAt =
            current.relayMetadata?.updatedAt ?? APP_RELAYS.updatedAt;
          if (event.created_at <= currentUpdatedAt) return current;
          return {
            ...current,
            relayMetadata: {
              relays: fetchedRelays,
              updatedAt: event.created_at,
            },
          };
        });
        // Persona queries that ran against APP_RELAYS during the
        // first paint should now re-run against the user's actual
        // relay list. Invalidating regardless of whether updateConfig
        // accepted the change is harmless — TanStack will return
        // cached data for unchanged-key queries.
        invalidateUserDependentCaches(queryClient);
      } catch (error) {
        console.error('Failed to sync relays from Nostr:', error);
      }
    };

    const syncBlossomServers = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10063], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );
        const event = events[0];
        if (!event) return;

        const fetchedServers = parseBlossomServerList(event);
        if (fetchedServers.length === 0) return;

        updateConfig((current) => {
          const currentUpdatedAt =
            current.blossomServerMetadata?.updatedAt ??
            APP_BLOSSOM_SERVERS.updatedAt;
          if (event.created_at <= currentUpdatedAt) return current;
          return {
            ...current,
            blossomServerMetadata: {
              servers: fetchedServers,
              updatedAt: event.created_at,
            },
          };
        });
        // useAuthor pulls kind 0 metadata which uses Blossom-hosted
        // pictures; refresh it so any per-user picture caching aligns
        // with the new server list.
        queryClient.invalidateQueries({ queryKey: queryKeys.nostr.authors() });
      } catch (error) {
        console.error('Failed to sync Blossom servers from Nostr:', error);
      }
    };

    syncRelays();
    syncBlossomServers();
  }, [user, nostr, updateConfig, queryClient]);

  return null;
}
