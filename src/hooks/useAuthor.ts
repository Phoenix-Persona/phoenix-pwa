import type { NostrEvent, NostrMetadata } from '@nostrify/types';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { parseNostrMetadata } from '@/lib/nostrMetadata';
import { withNostrQueryTimeout } from '@/lib/nostrQuery';

const AUTHOR_QUERY_TIMEOUT_MS = 1500;

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: queryKeys.nostr.author(pubkey),
    queryFn: async (context) => {
      if (!pubkey) {
        return {};
      }

      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: withNostrQueryTimeout(context.signal, AUTHOR_QUERY_TIMEOUT_MS) },
      );

      if (!event) {
        return {};
      }

      const metadata = parseNostrMetadata(event.content);
      if (metadata) {
        return { metadata, event };
      }

      return { event };
    },
    staleTime: 5 * 60 * 1000, // Keep cached data fresh for 5 minutes
    retry: false,
  });
}
