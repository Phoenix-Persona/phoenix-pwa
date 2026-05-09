# Nostrify

Framework for Nostr on Deno and web. Already wired into the scaffold —
Phoenix uses `@nostrify/nostrify` (core) and `@nostrify/react` (hooks).

> Versions in `package.json`: `@nostrify/nostrify@^0.52.0`,
> `@nostrify/react@^0.6.0`.

## What it provides

| Module              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| Relays              | Pool, reconnection, event gathering across relays         |
| Storages            | Unified store interface (memory / SQL / relays)           |
| Signers             | Private key, hardware wallet, remote (NIP-46) signers     |
| Schemas             | Parse Nostr events / relay messages from untrusted input  |
| Moderation Policies | Custom rule-based event filtering                         |
| Uploaders           | File upload to Blossom and nostr.build                    |

## Hooks already in the scaffold

These are reused as-is per PROJECT.md §11. Read the source to learn the
signatures — they're authoritative.

| Hook                      | Where in scaffold                  | Phoenix use                                  |
| ------------------------- | ---------------------------------- | -------------------------------------------- |
| `useNostr`                | `src/hooks/useNostr.ts`            | Get the configured pool / context            |
| `useNostrPublish`         | `src/hooks/useNostrPublish.ts`     | Publish kind 0, kind 1, kind 30078           |
| `useAuthor`               | `src/hooks/useAuthor.ts`           | Resolve a pubkey → kind 0 metadata           |
| `useCurrentUser`          | `src/hooks/useCurrentUser.ts`      | The active persona (multi-account aware)     |
| `useLoggedInAccounts`     | `src/hooks/useLoggedInAccounts.ts` | List + switch personas                       |
| `useLoginActions`         | `src/hooks/useLoginActions.ts`     | Add / remove personas                        |
| `useUploadFile`           | `src/hooks/useUploadFile.ts`       | Blossom upload (used by all media flows)     |

The `LoginArea` / `AccountSwitcher` components in `src/components/auth/`
already implement the multi-persona UX Phoenix needs.

## NIP support relevant to Phoenix

- **NIP-01** — events, filters, REQ/EVENT/CLOSE. See `docs/nostr-nips.md`.
- **NIP-44** — encrypted payloads. Used for the encrypted kind 30078 backup
  (PROJECT.md §5.2). Use the signer's NIP-44 helpers to encrypt to the
  persona's own pubkey.
- **NIP-49** — at-rest passphrase encryption of the nsec in `localStorage`.
  `nostr-tools` provides this; `@nostrify` may also expose helpers.

## API details — confirm before coding

The published website (nostrify.dev) is high-level. JSR pages return 403
to anonymous fetchers. **Before writing new code that touches Nostrify,
read the JSR docs in a browser** at:

- `jsr.io/@nostrify/nostrify`
- `jsr.io/@nostrify/react`

…and confirm the exact class names (`NPool`, `NRelay1`, `NSecSigner`, etc.)
and the NIP-44 method shape on the signer.

## Source

- nostrify.dev — overview
- jsr.io/@nostrify/nostrify, jsr.io/@nostrify/react — API reference
- Existing scaffold: `src/components/{NostrProvider,NostrSync,auth/*}.tsx`,
  `src/hooks/*`
- PROJECT.md §4 (architecture), §5 (event schema), §11 (file plan)
