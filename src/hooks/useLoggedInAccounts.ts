import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/types';
import { parseNostrMetadata } from '@/lib/nostrMetadata';
import { queryKeys } from '@/lib/queryKeys';

export interface Account {
  id: string;
  pubkey: string;
  event?: NostrEvent;
  metadata: NostrMetadata;
}

export function useLoggedInAccounts() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();
  const currentLogin = logins[0];

  const { data: authors = [] } = useQuery({
    queryKey: queryKeys.nostr.logins(currentLogin?.id ?? ''),
    queryFn: async () => {
      if (!currentLogin) return [];
      const events = await nostr.query(
        [{ kinds: [0], authors: [currentLogin.pubkey] }],
        { signal: AbortSignal.timeout(1500) },
      );

      return [currentLogin].map(({ id, pubkey }): Account => {
        const event = events.find((e) => e.pubkey === pubkey);
        const metadata = parseNostrMetadata(event?.content);
        if (metadata) {
          return { id, pubkey, metadata, event };
        }

        return { id, pubkey, metadata: {}, event };
      });
    },
    retry: 3,
  });

  const currentUser: Account | undefined = (() => {
    if (!currentLogin) return undefined;
    const author = authors.find((a) => a.id === currentLogin.id);
    return { metadata: {}, ...author, id: currentLogin.id, pubkey: currentLogin.pubkey };
  })();

  return {
    authors,
    currentUser,
  };
}
