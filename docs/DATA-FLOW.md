# Data Flow

The seams in `src/`. This doc traces current call paths so engineers do not
need to grep across pages, hooks, and lib helpers.

> Companion to `docs/ARCHITECTURE.md`. The architecture doc tells you what
> each file does; this doc tells you what calls what. Source of truth is the
> code.

## Flows At A Glance

| Flow | Entry | Hooks / Components | Lib / Network |
| --- | --- | --- | --- |
| Login | `AuthDialog` / `LoginArea` | `useLoginActions`, `useCurrentUser` | Nostrify login store, relays on later operations |
| Operator wallet | app mount / header retry | `OperatorWalletInit`, `useOperatorEnvelope`, `useOperatorWallet` | Breez Spark seed in encrypted operator envelope |
| Persona creation | `Onboard` | `useCreatePersona`, `PersonaPictureStager`, `AiAssistButton` | Nostr kind 30078 + kind 0, Blossom, Breez Spark, PPQ image/chat |
| List/load personas | `MyPersonas`, `Dashboard` | `useMyPersonas`, `usePersona` | Scan-and-decrypt operator-authored kind 30078 events |
| Compose + publish | `DashboardComposerCard` | `usePersonaComposer`, `usePersonaPublish`, `useCrossPost`, `usePersonaPpqAccountOptions` | Persona-scoped PPQ chat, Nostr kind 1, optional webhook |
| Post wizard | `PostWizardDialog` | `usePpqInference` | Persona-scoped PPQ chat |
| Video composer | `VideoComposerDialog` | `useGenerateVideoPipeline`, `useUploadFile`, `usePersonaPpqAccountOptions`, `usePersonaPublish` | Persona-scoped PPQ image/video/chat, Blossom, Nostr publish |
| Wallet / PPQ | `WalletDialog`, `WalletPanel` | `useWallet`, `usePpqAccount` | Breez Spark, scoped PPQ account/balance/history/topups |
| Public feed | `PersonaFeed` | `useAuthor`, `usePersonaPosts` | Relays: kind 0 and kind 1 by persona author |
| Relay / Blossom sync | app mount | `NostrSync` | Relays: kind 10002 and 10063 by operator author |

---

## Login

`AuthDialog` supports generated nsec, a saved local account backup, pasted
nsec, browser extension, NIP-46 bunker, and nostrconnect login paths. All paths
call `useLoginActions`, which enforces a single active login slot in Nostrify's
login store using `appNostrLoginStorage`.

After login, `NostrProvider` derives the active `NUser` and stores the signer
in refs used by the long-lived `NPool` callbacks. `useCurrentUser` re-derives
the same active user for pages and hooks. Operator-scoped cleanup components
run at the app root and during login replacement/logout so prior-account
persona, PPQ, wallet, and transient runtime state does not bleed into the next
login.

## Operator Wallet And PPQ Account

The operator wallet is independent from the operator's public Nostr profile.
`OperatorWalletInit` mints an encrypted operator envelope when the active
operator has no wallet seed in their envelope; it does not read or modify the
operator's kind 0 Lightning Address settings.

`useOperatorEnvelope` owns the encrypted operator envelope read/write path.
`useOperatorWallet` connects the Breez Spark wallet from that envelope seed.
`usePpqAccount` resolves credentials in this order: dev-only env pins outside
production, existing operator-envelope PPQ credentials, then newly minted PPQ
credentials saved back into the operator envelope. The legacy
`phoenix:ppq:account` localStorage key is only cleared for old-cache cleanup.

Operator PPQ credentials fund operator-level surfaces only. Persona AI flows
pass `usePersonaPpqAccountOptions` into PPQ hooks so each persona reads or
mints credentials inside its own encrypted persona backup.

## Persona Creation

`Onboard` is a two-step wizard: details, then picture. The display name,
username, and Lightning Address fields start blank. Username and Lightning
Address derive from the name only until the user edits those fields.

On publish, `Onboard` generates a persona keypair, optionally uploads or
generates a profile picture through `PersonaPictureStager`, and calls
`useCreatePersona`. The mutation mints a per-persona wallet seed, optionally
registers a persona Lightning Address, builds the encrypted persona envelope,
publishes the operator-signed kind 30078 backup, and publishes the
persona-signed kind 0 profile.

The persona nsec is never written to local storage by Zuka. It lives inside
the encrypted kind 30078 backup and in memory while the persona is active.

## Persona Loading

`useMyPersonas` and `usePersona` query the current operator's kind 30078
events by author only. They intentionally do not use Zuka-specific tags. Each
candidate event must decrypt through the operator signer and validate as a
Zuka persona envelope before the app shows it.

Loading one persona still scans and decrypts the operator's candidate backup
events, then picks the envelope whose embedded persona pubkey matches the
route npub. That scan-and-decrypt cost is deliberate: narrower relay filters
would leak app participation.

## Compose, Publish, And Media

`Dashboard` owns composer state and passes it into `DashboardComposerCard`.
`usePersonaComposer.styleInVoice()` sends the raw idea to the persona-scoped
PPQ account using the persona system prompt as the system message. On success
it refreshes the persona wallet and PPQ balance state.

`usePersonaComposer.publishTextOnly()` builds a kind 1 template through
`buildPersonaPostTemplate`, signs it with the persona nsec through
`usePersonaPublish`, and publishes it to relays. If cross-posting is enabled
and the persona has a webhook, the same published event is dispatched through
`useCrossPost`; webhook failure returns a warning result without undoing the
Nostr publish.

AI Assist controls use `AiAssistField` / `AiAssistButton`, which call
`usePpqInference` with the active persona PPQ scope and replace only the field
they are attached to. Post wizard flows also use persona PPQ chat. Video flows
use `useGenerateVideoPipeline` to create video jobs through persona PPQ, upload
outputs to Blossom, and publish persona events.

## Wallet And Public Surfaces

`useWallet` connects persona wallets from the encrypted persona envelope seed,
reads payment history, exposes deposit/withdraw helpers, and manages scoped PPQ
topups. Persona wallet UI can show Lightning Address details. Operator wallet
UI intentionally hides Lightning Address fields because Zuka does not configure
an operator Lightning Address.

`PersonaFeed` is public. It reads kind 0 metadata, kind 1 posts, replies,
reactions, and zap receipts by persona pubkey. The operator-to-persona
relationship remains encrypted-only and is not disclosed on public pages.

## Test Infrastructure

Automated unit tests are colocated under `src/**/*.test.ts(x)`.
Integration tests live in `test/integration/` and use only local in-memory
relay/HTTP harnesses. Manual spend/network scripts live in `test/manual/`.

Validation scripts live in `test/scripts/`. Root `scripts/` is reserved for
app build/dev/shared-env code.
