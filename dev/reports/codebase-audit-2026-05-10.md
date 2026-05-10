# Codebase Audit - 2026-05-10

Scope: `src/`, `dev/`, and `docs/`.

Focus: code quality, code smell, readability, DRY violations, and technical
debt. This audit treats `dev/PROJECT.md` as the product source of truth and
uses the current `src/` implementation as the source of truth for runtime
behavior.

## Summary

Phoenix/Zuka has a clear layered direction in the docs (`pages -> hooks -> lib`)
and the privacy-critical persona primitives are better factored than the page
surfaces. The main debt is now integration debt: large route components own too
much orchestration, wallet/PPQ/operator state is coupled through global UI, and
several docs still describe pre-merge flows. These issues will slow further V1
work because the code paths that matter most for the demo are spread across
large components, hooks with hidden side effects, and stale design notes.

The highest-priority cleanup is to stabilize the operator envelope d-tag/update
model, remove mnemonic-derived cache keys, and refresh `docs/DATA-FLOW.md` plus
`docs/PERSONA-SCHEMA.md` before more agents use them as implementation maps.

## Findings

### 1. Operator envelope updates append instead of replacing

Severity: High

`useOperatorEnvelope` documents one operator envelope per user, but every
publish uses a fresh d-tag:

- `src/hooks/useOperatorEnvelope.ts:1-19` says there is one envelope and updates
  should mutate that envelope.
- `src/hooks/useOperatorEnvelope.ts:113-122` always calls
  `generateOperatorDTag()` before publishing.
- `src/lib/operator/index.ts:13-22` also describes one envelope while saying the
  d-tag is fresh random.

Because kind 30078 replacement semantics key on `(author, kind, d-tag)`, this
creates a new addressable event for every operator update. The practical impact:
relay state grows, the scan-and-decrypt query gets slower, and the observable
kind-30078 count leaks extra operator activity. It also increases the chance
that stale operator envelopes are selected if relay ordering is uneven.

Recommendation: give the operator envelope its own stable opaque d-tag, store it
inside the encrypted operator payload, and reuse it on update. While doing that,
dedupe query results by d-tag before decrypting, mirroring `usePersona`.

### 2. Wallet query keys expose and collide on mnemonic prefixes

Severity: High

`useWallet` derives TanStack Query keys from `mnemonic.slice(0, 8)`:

- `src/hooks/useWallet.ts:48-51`

This has two problems. First, the query cache key contains a prefix of a wallet
secret. It is not a full seed, but it is still secret material in a debugging
surface. Second, it is collision-prone: many mnemonics can share the same first
word or first eight characters, so wallet info and payment history can be
cached under the wrong identity.

Recommendation: use a non-secret per-wallet identifier from the encrypted
envelope, such as persona pubkey plus wallet kind, or derive a one-way session
hash with Web Crypto and never expose the mnemonic substring.

### 3. PPQ account state mixes React state with non-reactive localStorage

Severity: Medium

`usePpqAccount` resolves the current account with `useMemo`, but one of its
sources is a localStorage read:

- `src/hooks/usePpqAccount.ts:58-65`
- `src/hooks/usePpqAccount.ts:90-98`
- `src/hooks/usePpqAccount.ts:121-129`

If `ensureAccount()` creates an account and the operator-envelope write fails,
the account is saved to localStorage but the memo dependency
(`operator.envelope?.ppq`) does not change. The hook can keep returning `null`
until some unrelated remount. `signOut()` has the inverse problem: it clears
localStorage but does not directly invalidate the memoized `account` value.

Recommendation: make the account an explicit query with localStorage and
operator-envelope sources, update that query data on create/clear, and keep
localStorage as an implementation detail rather than a non-reactive dependency.

### 4. The global header initializes wallet and PPQ machinery on every page

Severity: Medium

`AppHeader` loads the operator envelope and creates a wallet hook instance just
to show the wallet badge:

- `src/components/AppHeader.tsx:23-30`
- `src/components/AppHeader.tsx:84-90`
- `src/hooks/useWallet.ts:104-120` also pulls PPQ account state.
- `src/hooks/useWallet.ts:190-199` polls wallet info every 15 seconds once
  connected.

That means every page with a header can trigger operator-envelope decrypts,
Spark wallet connection, PPQ account resolution, and polling even when the user
is reading static or public content. This creates hidden app-wide latency and
makes wallet behavior harder to reason about.

Recommendation: split a lightweight `useWalletSummary` or lazy wallet badge
from the full wallet hook. Connect/poll only when the badge is visible and the
user expands the wallet dialog, or when a page explicitly needs wallet state.

### 5. Route components own too much business logic

Severity: Medium

Several page files are doing orchestration, domain mutation, UI rendering, and
cache updates in one place:

- `src/pages/Onboard.tsx` is 639 lines and handles key generation, wallet seed
  generation, Lightning Address registration, NIP-44 encryption, Nostr publish,
  public profile publish, optimistic cache writes, and the full wizard UI.
- `src/pages/Dashboard.tsx` is 619 lines and combines persona loading, wallet
  state, PPQ styling, cross-post dispatch, composer UI, and feed UI.
- `src/pages/EditPersona.tsx` is 513 lines and owns profile hydration,
  encrypted-envelope update, public kind-0 update, cross-post settings, and UI.

The `pages -> hooks -> lib` rule in `docs/ARCHITECTURE.md` is sound, but these
pages still hold business workflows that should be reusable and testable outside
the route.

Recommendation: extract focused hooks/services:

- `useCreatePersona` for the Onboard publish path.
- `useUpdatePersona` for encrypted backup + kind-0 updates.
- `usePersonaComposer` for style/publish/cross-post orchestration.
- Shared profile builders for kind 0 metadata.

### 6. DRY violations around parsing and NIP-19 conversion

Severity: Low

Several small helpers are duplicated across files:

- `npubToHex` exists in `src/hooks/usePersona.ts:67`,
  `src/pages/Dashboard.tsx:36`, `src/pages/PersonaFeed.tsx:18`, and
  `src/pages/Verify.tsx:41`.
- `parseList` exists in `src/pages/Onboard.tsx:627-633` and
  `src/pages/EditPersona.tsx:505-511`.
- kind-0 profile content is hand-built in both `src/pages/Onboard.tsx:264-284`
  and `src/pages/EditPersona.tsx:298-310`, with subtle differences around
  `username`, `display_name`, `lud16`, and Phoenix metadata.

These are not severe individually, but the profile duplication is a schema drift
risk because kind 0 is part of the public persona contract.

Recommendation: move these into small shared utilities:

- `src/lib/nip19.ts` or `src/lib/nostrIds.ts`.
- `src/lib/text.ts` for comma-list parsing.
- `src/lib/personaProfile.ts` for kind-0 metadata construction.

### 7. Docs are stale enough to mislead implementation

Severity: High

Several engineering docs contradict current code:

- `docs/DATA-FLOW.md:10-22` says persona d-tags are fresh per publish and
  `styleClient.ts` is still the active style path.
- `docs/DATA-FLOW.md:29-35` lists `styleClient` and `/api/style` for persona
  creation and compose, while `Dashboard` now calls `usePpqInference` directly
  at `src/pages/Dashboard.tsx:31` and `src/pages/Dashboard.tsx:87-96`.
- `docs/DATA-FLOW.md:445-451` says `usePpqInference` has no page callers and
  wallet UI is unwired.
- `docs/ARCHITECTURE.md:21-23` and `docs/PERSONA-SCHEMA.md:157-168` still
  claim the persona code uses fresh random d-tags and lacks wallet/dTag fields.
  Current `Onboard` writes `persona.dTag` and reuses it on edit.
- `docs/guides/nostrify.md:59-60` says the persona backup is encrypted to its
  own pubkey, then `docs/guides/nostrify.md:149-151` says user pubkey plus
  fresh d-tag. The first statement is wrong for the operator-self-encryption
  model.

This is a high-leverage debt item because this repo is designed for agent
collaboration. Stale docs will cause agents to reintroduce deleted code paths or
undo recent schema fixes.

Recommendation: refresh `docs/DATA-FLOW.md`, `docs/ARCHITECTURE.md`,
`docs/PERSONA-SCHEMA.md`, and `docs/guides/nostrify.md` in one docs-only pass.
Mark deprecated stream/hackathon notes as historical.

### 8. Dev route names and stream docs have drifted

Severity: Low

The stream docs specify `/dev/ppq-pay`:

- `dev/STREAMS.md:174-180`

The actual router exposes `/dev/inference-pay`:

- `src/AppRouter.tsx:30-32`

This is minor but causes avoidable confusion when following the active build
plan. The same area has historical owner/stream language that is useful context
but should be separated from current app navigation.

Recommendation: either add a route alias or update the docs to the current
route. Prefer route aliases during hackathon work if scripts or notes may still
reference the old path.

### 9. Scope drift is visible in production-facing UI and comments

Severity: Medium

`dev/PROJECT.md` frames V1 around text and image posting, with video deferred.
Current dashboard UI is centered on video composition even though the primary
video action is disabled:

- `src/pages/Dashboard.tsx:330-336`
- `src/pages/Dashboard.tsx:457-462`

There is also V1.5 cross-posting logic in the edit and dashboard paths:

- `src/pages/EditPersona.tsx:239-265`
- `src/pages/Dashboard.tsx:136-156`

This may be intentional product pivot work, but as code quality debt it creates
ambiguous ownership: unfinished V1.5 behavior lives in production routes while
the authoritative V1 plan still points elsewhere.

Recommendation: either update `dev/PROJECT.md`/`docs/SCOPE.md` to reflect the
video-first/cross-post pivot, or demote those controls behind an explicit dev or
feature flag until V1 text/image flows are complete.

### 10. Tests cover low-level schemas but not integration seams

Severity: Medium

Existing source tests cover `genUserName`, NIP-49 storage, persona envelope
parsing, the root app smoke test, and the error boundary. The critical flows
with the most debt are not covered in `src` tests:

- Operator envelope mint/update semantics.
- `usePpqAccount` create/cache/clear behavior.
- `useWallet` query-key isolation and auto-topup trigger behavior.
- Onboard create-persona orchestration.
- Edit persona stable d-tag replacement.

There are scripts under `tests/wallet` and `tests/ai-services`, but they are
not part of the app's unit/integration test surface and appear to require live
services.

Recommendation: when touching any of these flows next, add focused Vitest tests
around the extracted hooks/services rather than testing the 500+ line page
components directly.

## Positive Signals

- The persona schema and crypto helpers are relatively cohesive and include
  validation against tampered `persona.nsec`/`persona.pubkey` pairs.
- The code avoids `dangerouslySetInnerHTML` for event content; the only match in
  `src` is the shadcn chart style injector.
- The page-level UI uses existing shadcn primitives consistently.
- The docs clearly encode the intended privacy posture even where some details
  are stale.

## Recommended Cleanup Order

1. Fix operator envelope replacement semantics and add tests for it.
2. Replace mnemonic-prefix query keys in `useWallet`.
3. Make PPQ account state reactive and remove direct localStorage reads from the
   render path.
4. Refresh stale docs before assigning more parallel work.
5. Extract persona create/update/composer workflows from route components.
6. Consolidate duplicated NIP-19, list parsing, and kind-0 profile helpers.

## Worktree Note

The audit was performed with existing uncommitted changes present in the
workspace:

- `src/components/wallet/ReceiveDialog.tsx`
- `src/components/wallet/SendDialog.tsx`
- `src/hooks/useDeletePersona.ts`
- `src/lib/persona.ts`
- `src/pages/Onboard.tsx`
- `src/lib/wallet/lightningAddress.ts`
- `tests/ai-services/test-i2v-quick.ts`

Those changes were treated as user work and were not modified by this report.
