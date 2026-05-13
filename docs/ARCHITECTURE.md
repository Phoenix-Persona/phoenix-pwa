# Architecture

A map of `src/`. Read this first. Source of truth is the code — when this
doc disagrees with what's on disk, the code wins; update this file.

> **Identity model.** Zuka uses an **operator + persona split**
> (`dev/PROJECT.md` §3). The operator signs in with a single Nostr
> identity that NIP-44-self-encrypts each persona's config as a kind
> 30078 event. Each persona has its own separate keypair that publishes
> its public kind 0 profile and kind 1 posts. The link from persona ↔
> operator only exists inside the encrypted ciphertext. ("User
> keypair" appears in some passing prose as a synonym; prefer
> "operator.")
>
> **kind-30078 tag scheme.** Per `dev/PROJECT.md` §5.2, the only tag is
> `["d", "<opaque random uuid>"]`, **stable per persona** (generated
> at creation, stored as `persona.dTag` inside the encrypted plaintext,
> reused on every update). No `t`, no `alt`. Externally a Zuka
> backup is indistinguishable from any other NIP-78 app-data event.
> Discovery is by scan-and-decrypt over the operator's own kind-30078
> events.

## Entry & root

| File                | Role                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `main.tsx`          | React root. Mounts `<App />` inside `<ErrorBoundary />`. Polyfills first. |
| `App.tsx`           | Provider stack only. **Don't add routes here** — `App.tsx:1` says so. |
| `AppRouter.tsx`     | All routes.                                                       |
| `index.css`         | Tailwind v4 + Imigongo theme tokens.                              |

## Provider stack (App.tsx)

```
UnheadProvider                         (SEO meta, src/components/PhoenixHeader uses useSeoMeta)
└─ AppProvider                          (config: theme, relays, Blossom)        ← src/components/AppProvider.tsx
   └─ QueryClientProvider               (TanStack Query — every fetch flows through it)
      └─ NostrLoginProvider             (multi-account login state)             ← @nostrify/react/login
         └─ NostrProvider               (NPool + NIP-42 AUTH)                   ← src/components/NostrProvider.tsx
            ├─ NostrSync                (kind 10002, kind 10063)                ← src/components/NostrSync.tsx
            └─ TooltipProvider → Toaster → Suspense → AppRouter
```

**Key invariants:**

- The `NPool` is created exactly once per provider via `useState(initializer)` — see `NostrProvider.tsx:34-81`. Don't refactor that to a `useMemo` or you'll churn the pool on relay-config changes.
- Relay metadata and the current-user signer are read inside `NPool` callbacks via refs (`relayMetadataRef`, `signerRef`) so the pool never has to be recreated. Effects sync the refs (`NostrProvider.tsx:107-115`).
- `NostrSync` runs globally; it lazily updates app config from the operator's kind 10002 / 10063 events.

## Routes (AppRouter.tsx)

| Path                | Component       | Auth req'd | Notes                                |
| ------------------- | --------------- | ---------- | ------------------------------------ |
| `/`                 | `Index`         | no         | Marketing landing page.              |
| `/onboard`          | `Onboard`       | yes        | 5-step persona creation wizard.      |
| `/my-personas`      | `MyPersonas`    | yes        | Grid of operator's decrypted personas. |
| `/dashboard/:npub`  | `Dashboard`     | yes        | Per-persona compose + recent posts.  |
| `/p/:npub`          | `PersonaFeed`   | no         | Public feed for any persona.         |
| `/verify/:npub`     | `Verify`        | no         | Public attestation — operator deliberately not disclosed. |
| `/:nip19`           | `NIP19Page`     | no         | Catch-all for raw npub/note/naddr.   |
| `*`                 | `NotFound`      | no         |                                      |

## Layer responsibilities

```
   pages/        ← orchestrate hooks, render UI, handle navigation
       ↓
   hooks/        ← TanStack Query / Mutation, glue UI to lib/
       ↓
   lib/          ← pure logic + HTTP clients; no React
```

**Cross-layer rule:** `lib/` does not import React. `hooks/` does not own
business logic that isn't React-specific. `pages/` doesn't talk to
`fetch` directly. Keep that direction.

## `src/lib/`

Pure logic and HTTP clients. No React imports.

### Persona layer (privacy-critical — read the file headers)

| File              | What it does                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| `persona.ts`      | Persona Zod schemas, kind 30078 event template builder, envelope parser. **Read the file header (lines 1-43)** — it documents the privacy posture (no Zuka-specific tags) and the four-layer envelope verification. |
| `personaCrypto.ts`| `encryptPhoenixEnvelope` / `tryDecryptPhoenixEnvelope` — operator-self-encrypted NIP-44 ciphertext. |
| `personaKey.ts`   | Persona keypair generation, nsec ↔ keypair, `signWithPersona()`.            |
| `personaPost.ts`  | `buildPersonaPostTemplate` — kind 1 with **no Zuka-identifying tags** (no `client`, no operator pubkey, no persona name). Read lines 1-19 for what's deliberately omitted. |

### PPQ layer (built; not wired into pages yet)

| File              | What it does                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| `ppq/client.ts`   | Low-level HTTP client. `chatCompletion`, `generateImage`, `submitVideo`/`getVideoStatus`, `createTopupInvoice`/`getTopupStatus`, NWC auto-topup. Throws `PpqError` with HTTP status preserved. |
| `ppq/storage.ts`  | Pluggable account-credential storage. v1 = `localStorage` at `phoenix:ppq:account`. Header notes a future NIP-44-to-self upgrade path. |
| `ppq/types.ts`    | Wire types. The PPQ API is loose around shapes (balance, topup); types are deliberately wide and the client has defensive accessors (`extractBolt11`, `isTopupSettled`). |

### Other lib files

| File              | What it does                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| `appRelays.ts`    | App-default Nostr relays (`relay.ditto.pub`, `relay.primal.net`, `relay.damus.io`). Used as fallback for new users and during nostrconnect handshakes. |
| `appBlossom.ts`   | App-default Blossom servers + `parseBlossomServerList(event)` for kind 10063 + `getEffectiveBlossomServers()` for the merge-with-user-list policy. |
| `genUserName.ts`  | Deterministic display name from a pubkey for "Unknown persona" fallbacks. Has tests. |
| `polyfills.ts`    | Loaded first in `main.tsx`. Browser polyfills.                              |
| `utils.ts`        | shadcn `cn()` helper.                                                       |
| `styleClient.ts`  | **Legacy — scheduled for deletion per `dev/PROJECT.md` §11.** POSTs to `/api/style` (Vercel function) for persona text styling. Both `Onboard.tsx` and `Dashboard.tsx` still call this. The PPQ hooks exist but are not yet wired in — see `DATA-FLOW.md` "Unwired seams". Migration: replace with `usePpqInference`. |

## `src/hooks/`

### Persona

| Hook                  | Signature                                  | Notes                                                         |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `usePersona(npub)`    | `useQuery → { event, config } \| null`    | Scans operator's kind 30078s, decrypts each, matches `personaPubkey`. Slow by design (privacy). |
| `useMyPersonas()`     | `useQuery → { event, config, npub }[]`    | Scan-and-decrypt across all of the operator's kind 30078s; returns Zuka-shaped envelopes. |
| `usePersonaPosts(npub, limit)` | `useQuery → NostrEvent[]`         | Public kind 1 query by author pubkey. Anyone can call.        |
| `usePersonaPublish()` | `useMutation({ personaNsec, template })`  | Decodes nsec, finalizes/signs the event with `signWithPersona`, publishes via `nostr.event(...)`. |

### Nostr / auth (mostly Nostrify wrappers)

| Hook                    | Notes                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `useNostr.ts`           | **Re-export only** of `useNostr` from `@nostrify/react`. The file's comment (lines 1-5) says don't edit — it exists because LLMs invent it. |
| `useNostrPublish`       | Operator publish (kind 0, kind 22242, etc). Auto-tags `client` on https. |
| `useCurrentUser`        | Returns `{ user, users, ...metadata }`. The current login is `users[0]`. Builds `NUser` from the active login. |
| `useLoggedInAccounts`   | Multi-account list with kind-0 metadata pre-fetched.                 |
| `useLoginActions`       | `nsec` / `bunker` / `extension` / `nostrconnect` login methods + `logout`. **Don't edit except to add new login methods** (file comment, line 10). |
| `useUploadFile`         | Wraps `BlossomUploader` from `@nostrify/nostrify/uploaders`. Reads server list from `useAppContext`. |
| `useAuthor(pubkey)`     | Resolve pubkey → kind 0 metadata. 5-min staleTime.                   |

### PPQ (built, not yet wired into pages)

| Hook                 | What it does                                                              |
| -------------------- | ------------------------------------------------------------------------- |
| `usePpqAccount`      | Reads/refreshes ppq account + balance. `ensureAccount` is the only mutation that creates one. Cross-tab `storage` listener re-hydrates. |
| `usePpqInference`    | Mutation: chat completion. Auto-creates ppq account on first call.        |
| `usePpqImage`        | Mutation: image generation.                                               |
| `usePpqVideo`        | `usePpqVideoSubmit` + `usePpqVideoJob(id)` polling pair. Default model `veo3-fast`. |
| `usePpqTopup`        | `usePpqLightningTopup`, `usePpqTopupStatus(id)` polling, `usePpqNwcAutoTopup` (NIP-47 auto-topup). |

### Misc

| Hook              | Notes                                              |
| ----------------- | -------------------------------------------------- |
| `useAppContext`   | Sugar for `AppContext` consumer.                   |
| `useTheme`        | Reads/writes `config.theme`.                       |
| `useToast`        | shadcn toast.                                      |
| `useLocalStorage` | Generic key/value with serialize/deserialize hooks. |
| `useIsMobile`     | Media-query based.                                 |
| `useInView`       | Intersection observer wrapper.                     |

## `src/components/`

### Top-level (Zuka-specific UI)

| File                  | What it does                                                          |
| --------------------- | --------------------------------------------------------------------- |
| `AppProvider.tsx`     | App config (theme, relays, Blossom). Persists to `localStorage` via Zod-validated deserializer. |
| `NostrProvider.tsx`   | NPool + NIP-42 AUTH. **Read it before changing the pool.** The signer/relay refs pattern (lines 22-115) is load-bearing. |
| `NostrSync.tsx`       | Global syncer for kind 10002 + 10063 → app config.                    |
| `ErrorBoundary.tsx`   | React error boundary at the root.                                     |
| `ScrollToTop.tsx`     | Reset window scroll on route change.                                  |
| `PhoenixHeader.tsx`   | App-wide header (logo + nav + LoginArea).                             |
| `PostCard.tsx`        | Renders a kind 1 from a persona, with attribution UI.                 |
| `PostBody.tsx`        | Body renderer with link/mention parsing.                              |
| `Skeletons.tsx`       | `PersonaHeaderSkeleton`, `PersonaGridSkeleton`, `PostListSkeleton`.   |
| `ImigongoBand.tsx`    | Decorative band + seal (Rwandan geometric pattern).                   |
| `HowItWorks.tsx` + `howItWorks/{Build,Speak,Outlive}Visual.tsx` | Marketing section + supporting illustrations. |

### `components/auth/`

| File                  | What it does                                                          |
| --------------------- | --------------------------------------------------------------------- |
| `LoginArea.tsx`       | Either the "Join" button (logged out) or the `AccountSwitcher` (logged in). |
| `AccountSwitcher.tsx` | Multi-persona dropdown with switch / log out / add. Drives `useLoggedInAccounts.setLogin/removeLogin`. |
| `AuthDialog.tsx`      | Six-step modal: welcome → generate → secure → profile → login → connect. Handles nsec / extension / nostrconnect / bunker login. **The nostrconnect listening effect (lines 197-232) is subtle** — its dep array is intentionally limited to avoid tearing down in-flight subscriptions on re-render. |

### `components/ui/`

56 files. **shadcn primitives — do not hand-edit.** Regenerate via the
shadcn CLI when upstream changes. App-specific UI lives one level up.

## `src/pages/`

| File              | What it does                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `Index.tsx`       | Marketing landing — hero, how-it-works, mission.                          |
| `Onboard.tsx`     | 5-step persona creation wizard (form-based, not agent-based). Encrypts envelope, signs as operator, publishes kind 30078 + persona kind 0. |
| `MyPersonas.tsx`  | Grid of operator's personas via `useMyPersonas`.                          |
| `Dashboard.tsx`   | Per-persona: header, raw → styled composer, publish, recent posts.        |
| `PersonaFeed.tsx` | Public read-only feed. Anyone can view.                                   |
| `Verify.tsx`      | Public attestation page. Explicitly states the operator is **not** disclosed. |
| `NIP19Page.tsx`   | Resolves raw npub/nprofile/note/nevent/naddr URLs.                        |
| `NotFound.tsx`    | 404.                                                                      |

## `src/contexts/`

| File              | What it does                                              |
| ----------------- | --------------------------------------------------------- |
| `AppContext.ts`   | `AppConfig` shape + context. `RelayMetadata`, `BlossomServerMetadata`. |

## `test/node/`

| File                    | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `setup.ts`              | node:test setup (jest-dom, jsdom).                        |
| `TestApp.tsx`           | Wrapped provider tree for render tests.                   |
| `api.ts`                | Project-local test API and mock helpers.                  |

## `test/manual/`

Manual and E2E Node scripts for wallet, PPQ, and media workflows. These are
run explicitly with `tsx`; they are not part of the Vitest suite.

Production tests are colocated next to source: `App.test.tsx`,
`lib/genUserName.test.ts`, `lib/persona.test.ts`. New tests should follow
that convention.

## Storage keys

| Key                   | Owner                | Contents                                       |
| --------------------- | -------------------- | ---------------------------------------------- |
| `nostr:app-config`    | `AppProvider`        | Theme, relay metadata, Blossom server metadata. Zod-validated on read. |
| `nostr:login`         | `NostrLoginProvider` | All saved logins (nsec / bunker / extension).  |
| `phoenix:ppq:account` | `lib/ppq/storage.ts` | `{ api_key, credit_id }` — the operator's PPQ account. |

**No persona keys live in `localStorage`.** Persona nsecs live inside the
encrypted kind 30078 event content, recoverable from any device with the
operator's signer. See `lib/personaKey.ts:1-9`.

## Conventions / "don't touch this"

- **`App.tsx` — providers only**, routes go in `AppRouter.tsx` (file comment line 1-2).
- **`useNostr.ts` — re-export only**, do not add logic (file comment lines 1-5).
- **`useLoginActions.ts` — only edit to add new login methods** (file comment line 10).
- **`components/ui/` — shadcn-generated**, regenerate, don't hand-edit.
- **No Zuka-specific tags on persona-published events.** Read `lib/persona.ts:1-43` and `lib/personaPost.ts:1-19` before touching tag arrays.
- **No NIP-04 anywhere.** Use NIP-44 via `signer.nip44.{encrypt,decrypt}`.
- **The current-user signer is at `useCurrentUser().user.signer`.** It satisfies the `Nip44Signer` interface — cast to that when calling `lib/personaCrypto.ts` helpers.

## Source

- Code in `src/` (canonical).
- `docs/DATA-FLOW.md` — the seams traced through real call paths.
- `dev/PROJECT.md` — design doc / master plan. Aligned on the identity
  model (§3), dependencies (§4 — Breez Spark SDK + PPQ credits), and
  tag-omission stance. Diverges on the d-tag *value* scheme (spec:
  stable opaque per persona; code: random per publish) — see warning
  at the top.
