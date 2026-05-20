import { useNostr } from '@nostrify/react';
import {
  NLogin,
  type NLoginType,
  type NostrConnectParams,
  type NostrConnectStatus,
  useNostrLogin,
} from '@nostrify/react/login';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { APP_RELAYS } from '@/lib/appRelays';
import { clearOperatorSessionState } from '@/lib/operatorSessionState';

// Central auth boundary. Keep Zuka to one active login slot and route all
// login/logout changes through operator session cleanup.

export type { NostrConnectParams, NostrConnectStatus };
export { generateNostrConnectParams, generateNostrConnectURI } from '@nostrify/react/login';

export function useLoginActions() {
  const { nostr } = useNostr();
  const { logins, addLogin, clearLogins } = useNostrLogin();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const currentLogin = logins[0];

  async function replaceLogin(login: NLoginType): Promise<void> {
    await clearOperatorSessionState(queryClient, currentLogin?.pubkey);
    clearLogins();
    addLogin(login);
  }

  return {
    // Login with a Nostr secret key
    async nsec(nsec: string): Promise<void> {
      const login = NLogin.fromNsec(nsec);
      await replaceLogin(login);
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(uri: string): Promise<void> {
      const login = await NLogin.fromBunker(uri, nostr);
      await replaceLogin(login);
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      const login = await NLogin.fromExtension();
      await replaceLogin(login);
    },
    // Login via nostrconnect:// (client-initiated NIP-46)
    // The client displays a QR code and waits for the remote signer to connect.
    //
    // `onStatus` is forwarded from @nostrify/react so the UI can render
    // live progress through the handshake phases — see NostrConnectStatus.
    async nostrconnect(
      params: NostrConnectParams,
      signal?: AbortSignal,
      onStatus?: (status: NostrConnectStatus) => void,
    ): Promise<void> {
      const login = await NLogin.fromNostrConnect(params, nostr, { signal, onStatus });
      await replaceLogin(login);
    },
    // Get the relay URLs for NIP-46 nostrconnect communication
    getRelayUrls(): string[] {
      const relays = config.relayMetadata.relays
        .filter((r) => r.write)
        .map((r) => r.url);
      // Fall back to the app default relays if the user has none configured,
      // so the remote signer has multiple connection options during handshake.
      return relays.length > 0
        ? relays
        : APP_RELAYS.relays.filter((r) => r.write).map((r) => r.url);
    },
    // Log out the current user
    async logout(): Promise<void> {
      await clearOperatorSessionState(queryClient, currentLogin?.pubkey);
      clearLogins();
    }
  };
}
