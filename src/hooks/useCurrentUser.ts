import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { useNostr } from '@nostrify/react';
import { useCallback, useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();
  const currentLogin = logins[0];

  const loginToUser = useCallback((login: NLoginType): NUser => {
    switch (login.type) {
      case 'nsec': // Nostr login with secret key
        return NUser.fromNsecLogin(login);
      case 'bunker': // Nostr login with NIP-46 "bunker://" URI
        return NUser.fromBunkerLogin(login, nostr);
      case 'extension': // Nostr login with NIP-07 browser extension
        return NUser.fromExtensionLogin(login);
      // Other login types can be defined here
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }, [nostr]);

  const user = useMemo(() => {
    if (!currentLogin) {
      return undefined;
    }

    try {
      return loginToUser(currentLogin);
    } catch (error) {
      console.warn('Skipped invalid login', currentLogin.id, error);
      return undefined;
    }
  }, [currentLogin, loginToUser]);

  const author = useAuthor(user?.pubkey);

  return {
    user,
    ...author.data,
  };
}
