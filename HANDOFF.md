# Handoff — Phoenix Persona / Zuka, branch `fix/ui-polish`

You're picking up a hackathon-grade Nostr + Bitcoin Lightning PWA. The
user is moving on to **UI changes** in a fresh session and wants you
oriented fast. Read this top-to-bottom; it captures branch state,
recent shipped work, architectural facts that aren't obvious from the
code, and pointers into the tree.

---

## Branch state (as of 2026-05-10)

- **Active branch:** `fix/ui-polish` (HEAD = `4d69f7d`, pushed to
  `origin/fix/ui-polish`).
- **Status:** **DO NOT MERGE TO MAIN YET.** The user is waiting on
  another PR to land first. When that PR lands, the next steps are: (1)
  rebase `fix/ui-polish` on the new `main` (likely clean — most overlap
  was already absorbed by the merge commit), (2) run the manual smoke
  list from `dev/plans/2026-05-09-wallet-followups.md`, (3) open a PR,
  (4) delete `fix/refactor`.
- **Tests:** `npm test` (which runs `tsc --noEmit && eslint --cache &&
  vitest run && vite build`) is green at **116 / 116** on this branch.
- **Sibling branch warning:** `fix/refactor` exists but its commits
  (`dd75f36` + 2 ancestors) are already on `fix/ui-polish` via the
  merge commit `68d8cdc`. **Do not touch `fix/refactor`** — it should
  be deleted after this branch lands. Earlier sessions misdiagnosed
  the divergence as "a linter reverting changes."

---

## What just shipped on this branch

Across `21ee4d0`, `9d3d9bb`, `6386d59`, `68d8cdc`, `bd6d542`, `4d69f7d`:

**Wallet UI**
- Operator-wallet *eager connect* (was lazy on dialog open, hid the
  balance). Lives in `src/hooks/useOperatorWallet.ts` — **don't
  re-introduce the `enabled: boolean` arg.** The comment block in that
  file explains why.
- Operator badge in `AppHeader` shows live balance immediately after
  login. When the seed is missing AND the envelope query has settled,
  the slot renders a manual **"Set up wallet"** CTA that calls
  `operator.mint(undefined)` directly. On mint failure, the CTA
  switches to `variant="destructive"` with label "Wallet setup failed
  — retry"; clicking re-attempts and clears the error.
- `OperatorWalletInit` runs auto-mint at most **once per session per
  user** — no auto-retry loop. Recovery is via the manual CTA above.
- `ReceiveDialog` auto-dismisses on `paymentSucceeded` (matched by the
  BOLT11 string) and shows a transient toast with the received amount.
  Default memo is **"Zuka top-up"** (not "Phoenix top-up" — that
  rebrand happened).
- `SendDialog` uses `<Input>` instead of `<Textarea>` for the invoice
  field — the textarea's `field-sizing-content` was breaking layout on
  narrow viewports.
- `WalletPanel` shows the bech32 LNURL + 192px QR under the Lightning
  Address (collapsible "Show LNURL / QR" toggle).
- `WalletBadge` has an `inverse?: boolean` prop for cream-on-charcoal
  styling on dark hero mats — passed by `Dashboard.tsx` for the
  persona-header instance.

**Lightning Addresses**
- Hosted on `breez.tips`, not `spark.money` (the docs were stale and
  have been swept). Single source of truth: `SPARK_LN_DOMAIN` constant
  in `src/lib/wallet/lightningAddress.ts`.
- Persona mint registers `<username>@breez.tips` with collision retry
  (`<base>-<4chars>` suffix). The user picks the slug in the Onboard
  form's "Username" field; `display_name` is separate.
- EditPersona renames re-register via `noSuffixOnCollision: true` —
  Spark replaces the old slot atomically, but the SDK throws
  `LightningUsernameTakenError` instead of silently mangling on
  collision. The hook re-throws as a user-friendly toast and aborts
  the envelope save.
- `useDeletePersona` releases the LN address (best-effort) before
  publishing the kind 5 deletion + kind 30078 tombstone.

**Profile picture generation** (`PersonaPictureField`)
- Staged progress state machine: `idle → drafting → fetching →
  uploading → idle`. Each stage has a button label and a detail line
  ("PPQ is rendering…", "Downloading…", "Mirroring to Blossom…").

**Test coverage**
- `useOperatorWallet.test.tsx` — eager-connect contract, 4 cases.
- `OperatorWalletInit.test.tsx` — bounded-retry regression test,
  6 cases (most importantly: persistent mint rejection followed by
  `isMinting` cycling false must NOT re-fire mint).
- `useDeletePersona.test.tsx` — happy path + 4 failure modes
  (lightning-address-release, kind0-lookup, backup-decrypt, missing
  d-tag).
- `lightningAddress.test.ts` — pure-helper coverage (`slugify`,
  `isValid`, `randomSuffix`, `probeAvailability`).

---

## Architectural facts that aren't obvious from the code

- **Brand:** the app is called **Zuka** in user-facing strings. The
  on-wire NIP-78 discriminator is still `phoenix-persona` for protocol
  back-compat — **don't rename that.** History: Phoenix → Feniksi → Zuka.
- **Two-tier identity model:** the operator (= logged-in user) signs
  encrypted persona backups; each persona has its own keypair that
  publishes kind 0 / kind 1.
- **Operator wallet** is internal — funds AI inference. **Per-persona
  wallets** receive donations. Don't conflate them.
- **Env override** for the operator's wallet seed: `VITE_WALLET_SEED`
  + `VITE_PPQ_API_KEY`. When both are set, `OperatorWalletInit` skips
  auto-mint entirely.
- **Privacy posture:** kind 30078 envelopes carry no Phoenix-identifying
  tags — the discriminator lives inside the NIP-44 ciphertext.
  Persona kind 1 posts carry no user pubkey. Don't add `["client",
  "phoenix"]` or similar tags.
- **Schema fields recently added** (in `src/lib/persona.ts`):
  `persona.username` (slug, required for new personas),
  `persona.display_name` (rich, optional, falls back to `name`),
  `persona.cross_post.{webhook_url, webhook_platforms}`. Existing
  personas without these fields stay valid.
- **Hooks introduced by the audit-remediation commit:**
  `useCreatePersona`, `useUpdatePersona`, `useDeletePersona`,
  `usePersonaPublicProfile`. Onboard / EditPersona / Dashboard now
  delegate to these. Cache infrastructure in `src/lib/queryKeys.ts`
  and publish helpers in `src/lib/nostrPublish.ts`
  (`publishWithTimeout`, `tryPublishWithTimeout`).

---

## Where to look for UI work

| Area | Path |
|---|---|
| Pages | `src/pages/{Dashboard,EditPersona,Onboard,MyPersonas,PersonaFeed,Settings,Verify,Index,NotFound}.tsx` |
| Persona components (extracted from the audit refactor) | `src/components/persona/` (`DashboardComposerCard`, `EditPersonaIdentityFields`, `EditPersonaPublicProfileFields`, `EditPersonaPrivateSettingsFields`, `EditPersonaCrossPostFields`, `PersonaHero`) |
| Wallet UI | `src/components/wallet/` (`WalletBadge`, `WalletPanel`, `WalletDialog`, `ReceiveDialog`, `SendDialog`) |
| Header / nav | `src/components/AppHeader.tsx` |
| Persona portrait field | `src/components/PersonaPictureField.tsx` |
| Imigongo design tokens | `src/components/ImigongoBand.tsx`, Tailwind classes prefixed `imigongo-`, `rw-` |
| Styling primitives | `src/components/ui/` (shadcn/ui — `Button`, `Dialog`, `Input`, `Textarea`, `Card`, `Sheet`, `Skeleton`, etc.) |
| Inverse-on-charcoal pattern | See `INVERSE_CLASS` in `WalletBadge.tsx` and `inverseBtnClass` in `PersonaActionsMenu.tsx` |
| Toast | `useToast()` from `@/hooks/useToast` |
| Class-merging helper | `cn()` from `@/lib/utils` |

---

## Useful pointers

- **Product source of truth:** `dev/PROJECT.md` (sections numbered;
  §5.2 has the schema, §6 has the AI/payment flow, §7 has wallet).
- **Recent shipped plans (kept for historical context):**
  - `dev/plans/2026-05-09-wallet-followups.md` (PR #20)
  - `dev/plans/2026-05-10-follow-up-refactoring.md` (PR #20)
  - `dev/plans/2026-05-10-adopt-extracted-persona-components.md` (PR #21)
- **Codebase audit:** `dev/reports/codebase-audit-2026-05-10.md` — read
  if you're touching cross-cutting infrastructure (predates PRs #20-#21,
  most findings are now resolved).
- **Capacitor Android shipped** in PRs #14 + #18 + #25 (privacy fix) +
  #27 (v1.0.1 bump). Live on the device.

---

## Working preferences (from memory + this branch's history)

- **Terse responses.** Short updates, no preamble, no
  recap-after-the-diff. The user reads diffs.
- **No comments unless the WHY is non-obvious.** Don't narrate WHAT
  the code does.
- **No emojis** unless explicitly requested.
- **Don't add scope.** A bug fix doesn't need a refactor; a one-shot
  doesn't need a helper.
- **Tests live next to source** as `*.test.tsx` / `*.test.ts`.
  Vitest + React Testing Library + `vi.hoisted()` mock pattern. See
  any existing `*.test.tsx` for the shape.
- **Confirm before destructive ops** (deletes, force-pushes, anything
  that touches `main`). The user trusts you to make additive changes
  in `src/` autonomously.

---

## First moves for the new session

1. `git status && git log --oneline -5` to confirm you're on
   `fix/ui-polish` at `4d69f7d` with a clean tree.
2. `npm test` to confirm the 116-test baseline before changing
   anything (cache-warm so this is fast).
3. Wait for the user's specific UI request — they said "other UI
   changes" without specifying yet. When they do, scope it against
   the file map above.
