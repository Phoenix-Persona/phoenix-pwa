import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * App default relays. Used as the initial `relayMetadata` for new users and as
 * a fallback when the user has no NIP-65 relay list configured (e.g. during
 * nostrconnect handshakes before any user relays have been loaded).
 *
 * Picked to maximize the chance that a freshly-signed-up user can immediately
 * publish kind 30078 backups + kind 0 profiles + kind 1 posts and have them
 * visible to anyone querying any of the major public relays. Per derek-plan.md
 * Phase 2 the V1 target is 7-10 relays mixing the high-availability hubs with
 * a long-tail mirror or two.
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    // High-availability hubs — most clients query these
    { url: 'wss://relay.damus.io', read: true, write: true },
    { url: 'wss://relay.primal.net', read: true, write: true },
    { url: 'wss://nos.lol', read: true, write: true },
    // Ditto stack — needed for Soapbox / Ditto-rendered persona feeds
    { url: 'wss://relay.ditto.pub', read: true, write: true },
    // nostr.band — search index; helps the public profile feed
    { url: 'wss://relay.nostr.band', read: true, write: true },
    // Long-tail mirrors — keep events alive if a hub drops them
    { url: 'wss://nostr.wine', read: true, write: true },
    { url: 'wss://relay.nostr.bg', read: true, write: true },
  ],
  updatedAt: 0,
};
