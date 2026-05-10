import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { groupInteractions, type GroupedInteractions } from "@/lib/postInteractions";
import { queryKeys } from "@/lib/queryKeys";

const EMPTY: GroupedInteractions = { replies: [], reactions: [], zaps: [] };

/**
 * Fetch a kind 1 post's direct interactions: kind 1 replies (NIP-10),
 * kind 7 reactions (NIP-25), and kind 9735 zap receipts (NIP-57). One
 * subscription with three kinds keyed on the post id; results bucketed
 * client-side. TanStack Query caches across remounts so scrolling back
 * to a previously-rendered post is free.
 */
export function usePostInteractions(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<GroupedInteractions>({
    queryKey: queryKeys.persona.interactions(eventId),
    enabled: Boolean(eventId),
    queryFn: async (c) => {
      if (!eventId) return EMPTY;
      const events = await nostr.query(
        [
          {
            kinds: [1, 7, 9735],
            "#e": [eventId],
            limit: 200,
          },
        ],
        { signal: c.signal },
      );
      return groupInteractions(events);
    },
    staleTime: 30 * 1000,
  });
}
