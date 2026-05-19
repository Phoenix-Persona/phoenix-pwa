# Auth and Session Model

Zuka uses a hard-cut operator isolation model. Production operator
wallets, PPQ credentials, and persona decrypt state are scoped to the
active operator pubkey and must not be shared through browser caches or
deployment-wide environment pins.

## Persistence Rules

| Data | Production location | Notes |
| --- | --- | --- |
| Active Nostr login | Memory only | `NostrLoginProvider` uses in-memory storage as a single active login slot. Refresh/new tab must not restore an active plaintext `nsec`. |
| Local account backup | NIP-49 `ncryptsec` | At most one encrypted local account backup is stored through `secureStorage`; web falls back to localStorage, native uses Keychain/KeyStore. |
| External operator login | External signer | Zuka does not change NIP-07/NIP-46 custody. |
| Operator wallet seed | Operator envelope | Encrypted kind 30078, self-encrypted to the operator. |
| Operator PPQ credentials | Operator envelope | Encrypted kind 30078. No production global PPQ localStorage cache. |
| Persona `nsec` and wallet seed | Persona envelope | Encrypted kind 30078 authored by the operator. Runtime plaintext is memory-only. |
| Dev PPQ/wallet env pins | Dev only | `VITE_PPQ_API_KEY`, `VITE_PPQ_CREDIT_ID`, and `VITE_WALLET_SEED` are ignored by production app flows. |

## Cleanup Boundary

`src/lib/operatorSessionState.ts` is the central cleanup API for
sensitive operator state.

- Login replacement and logout clear PPQ queries, wallet queries, operator envelope
  cache, persona list/detail queries, persona decrypt cache, legacy PPQ
  localStorage, and resumable video-chain state.
- Log out clears active session state and runtime caches, but keeps the
  encrypted local account backup.
- Wipe device data clears the encrypted local account backup plus active
  session and runtime state, then hard reloads.

New logout, login-replacement, or device-wipe paths should call
this module instead of clearing storage or caches directly.

## Dev Pins

Environment-pinned PPQ and wallet credentials are local/demo tools only.
Use `readDevEnv()` for those keys. Production code must not call
`readEnv()` directly for:

- `VITE_PPQ_API_KEY`
- `VITE_PPQ_CREDIT_ID`
- `VITE_WALLET_SEED`

The `/dev/*` harnesses may keep direct env pins because they are not
operator account flows.
