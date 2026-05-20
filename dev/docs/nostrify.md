# Nostrify

Nostr framework for web browsers and Deno. Already wired into the scaffold —
`@nostrify/nostrify` (core) + `@nostrify/react` (hooks/providers).

> Versions in `package.json`: `@nostrify/nostrify@^0.52.0`,
> `@nostrify/react@^0.6.0`. Both are JSR packages, installable via npm.
> Source: nostrify.dev. GitHub mirror: `soapbox-pub/nostrify`.

## Modules

| Module     | Notes                                                       |
| ---------- | ----------------------------------------------------------- |
| Schemas    | `NSchema` — zod schemas for events, filters, metadata       |
| Storages   | `NCache`, `NDatabase`, `NSet` — implement the `NStore` interface |
| Relays     | `NRelay1` (single relay), `NPool` (multi-relay)             |
| Signers    | `NSecSigner`, `NSeedSigner`, `NPhraseSigner`, `NCustodial`, `NConnectSigner` (NIP-46) |
| Uploaders  | Blossom, nostr.build                                        |
| Policies   | Custom event-filtering rules                                |

## Schema validation

```ts
import { NSchema as n } from '@nostrify/nostrify';

const event = n.event().parse(eventData);
const metadata = n.json().pipe(n.metadata()).parse(event.content);
const nsec = n.bech32('nsec').parse(token);
```

Always parse untrusted input through `NSchema`.

## Signers

The `NostrSigner` interface mirrors NIP-07 (`window.nostr`), so any signer
is a drop-in. Zuka uses **`NSecSigner`** — local nsec held in memory
after the user unlocks the NIP-49 ncryptsec.

```ts
import { NSecSigner } from '@nostrify/nostrify';

const signer = new NSecSigner(secretKeyBytes);
const pubkey = await signer.getPublicKey();
const event = await signer.signEvent({
  kind: 1,
  content: 'Hello',
  tags: [],
  created_at: Math.floor(Date.now() / 1000),
});
```

### NIP-44 helpers (used for kind 30078 backup)

```ts
const ciphertext = await signer.nip44!.encrypt(personaPubkey, plaintext);
const plaintext  = await signer.nip44!.decrypt(personaPubkey, ciphertext);
```

For Zuka, the persona's backup is encrypted to its **own** pubkey:
`signer.nip44.encrypt(await signer.getPublicKey(), backupJson)`.

`NConnectSigner` (NIP-46 remote signer) is supported through login flows where
available; review current source before changing signer handling.

## Relays

### `NRelay1` — single relay

```ts
import { NRelay1 } from '@nostrify/nostrify';

const relay = new NRelay1('wss://relay.damus.io');

for await (const msg of relay.req([{ kinds: [1], limit: 20 }])) {
  if (msg[0] === 'EVENT') console.log(msg[2]);
  if (msg[0] === 'EOSE') break; // breaking sends CLOSE automatically
}
```

Auto-reconnects on disconnect, re-subscribes on reconnect.

### `NPool` — multiple relays (Outbox model)

```ts
import { NPool, NRelay1 } from '@nostrify/nostrify';

const pool = new NPool({
  open: (url) => new NRelay1(url),
  reqRelays: async (filters) => personaRelaysFor(filters),
  eventRelays: async (event) => personaRelaysFor(event),
});

await pool.event(signedEvent);                      // publish
const events = await pool.query([{ kinds: [0], authors: [pubkey] }]);
```

`pool.query` deduplicates and applies replaceable-event semantics; `pool.req`
streams raw messages and may emit duplicates.

## React integration

### Provider

```tsx
import { NostrContext } from '@nostrify/react';
import { NRelay1 } from '@nostrify/nostrify';

<NostrContext.Provider value={{ relay: new NRelay1('wss://relay.example.com') }}>
  <YourApp />
</NostrContext.Provider>
```

In Zuka this is wrapped by `src/components/NostrProvider.tsx` and
`NostrSync.tsx`, which load relay config from app settings.

### Login

```tsx
import { NostrLoginProvider } from '@nostrify/react/login';

<NostrLoginProvider storageKey='nostrify-logins'>
  <YourApp />
</NostrLoginProvider>
```

`storageKey` names the login storage record. Zuka passes an in-memory storage
adapter, so active Nostr login state is not persisted to localStorage.
`LoginArea` / `AccountSwitcher` switch operator accounts.

### Hooks already in the scaffold

These are the project's own wrappers around Nostrify's primitives.
Authoritative source is the file itself.

| Hook                  | File                                | Zuka use                              |
| --------------------- | ----------------------------------- | ---------------------------------------- |
| `useNostr`            | `src/hooks/useNostr.ts`             | Get pool/relay from context              |
| `useNostrPublish`     | `src/hooks/useNostrPublish.ts`      | Publish kind 0/1/30078 (auto-tags `client`) |
| `useAuthor`           | `src/hooks/useAuthor.ts`            | Resolve pubkey → kind 0 metadata         |
| `useCurrentUser`      | `src/hooks/useCurrentUser.ts`       | Active operator                          |
| `useLoggedInAccounts` | `src/hooks/useLoggedInAccounts.ts`  | List + switch operator accounts          |
| `useLoginActions`     | `src/hooks/useLoginActions.ts`      | Add / remove operator accounts           |
| `useUploadFile`       | `src/hooks/useUploadFile.ts`        | Blossom upload                           |

`useNostrLogin` from `@nostrify/react/login` is the lower-level primitive
those `useLoggedInAccounts` / `useLoginActions` build on.

## Zuka-specific notes

- **Persona backups (kind 30078)**: NIP-44-encrypt to the **operator's own
  pubkey** with `signer.nip44.encrypt`, set `d` tag
  to an opaque random UUID **stable per persona** (generated once at
  creation, stored as `persona.dTag`, reused on every update — no `t`,
  `alt`, or other tags) so a Zuka backup is externally indistinguishable
  from any other app's encrypted-app-data event. Discovery is
  scan-and-decrypt over the operator's own kind-30078 events. See
  `docs/PERSONA-SCHEMA.md`.
- **NIP-49 (ncryptsec)** for at-rest local nsec: `nostr-tools` provides
  this. Signer construction happens after the user unlocks.
- **Auto-`client` tag**: `useNostrPublish` is for operator-authored events.
  Persona-authored posts use `usePersonaPublish` and do not add app-identifying
  tags.

## Source

- nostrify.dev — main docs site
- `github.com/soapbox-pub/nostrify` — GitHub mirror (canonical is GitLab)
- Per-package READMEs at `packages/{nostrify,react}/README.md` —
  authoritative API reference
- Existing scaffold: `src/components/{NostrProvider,NostrSync,auth/*}.tsx`,
  `src/hooks/*`
- `docs/ARCHITECTURE.md`
- `docs/PERSONA-SCHEMA.md`
