# Wallet UI + Lightning Address — follow-up plan (2026-05-09)

> **Status: SHIPPED on `fix/ui-polish`** (2026-05-10)
>
> All five tasks landed across the `fix/refactor` merge (commit `68d8cdc`)
> and post-merge audit fixes (commit `bd6d542`):
>
> - **Task 1** — `useUpdatePersona` / `useCreatePersona` audited against
>   the 8-item LN-flow checklist; both pass. Bonus fix: `useCreatePersona`
>   was missing `setQueryData` for the `persona.detail` and
>   `persona.publicProfile` caches so an immediate navigate to
>   `/dashboard/<npub>` round-tripped the relay; both calls added.
> - **Task 2** — `noSuffixOnCollision` flag + `LightningUsernameTakenError`
>   class shipped via `fix/refactor`; `useUpdatePersona` passes
>   `noSuffixOnCollision: true` on rename and re-throws the typed error
>   as a user-friendly message; `EditPersona` taken-hint copy updated.
> - **Task 3** — Dashboard nudge for missing donate handle shipped via
>   `fix/refactor` (already integrated into the persona header flow).
> - **Task 4** — `src/lib/wallet/lightningAddress.test.ts` (140 lines)
>   shipped via `fix/refactor` with full coverage of `slugifyForUsername`,
>   `isValidLightningUsername`, `randomUsernameSuffix`, and
>   `probeLightningUsernameAvailability`.
> - **Task 5** — Doc sweep complete; `grep -rln "spark\.money" docs/ dev/
>   AGENTS.md README.md` returns zero hits.
>
> Verification: `npm test` green at 116/116 on the merged tree.

Scope: hard-cut tasks left after the `fix/ui-polish` branch's wallet-UI
polish + Lightning Address registration work landed (commit `3dc4287` plus
the LN-domain fix and WalletPanel/EditPersona consolidation that followed).

Prereqs: `fix/ui-polish` rebased on current `main`. Each task below is
written as an independently shippable commit on the same branch (or a
follow-up branch off it).

---

## Task 1 — Audit `useUpdatePersona` / `useCreatePersona` for LN flow integrity

**Why:** A linter pass refactored the registration logic out of
`Onboard.tsx` and `EditPersona.tsx` into shared hooks introduced as part
of the codebase audit/remediation work. The original logic in those page
components performed a specific sequence (connect SDK → register-with-retry
→ update envelope → republish kind 0 with `lud16`). If the refactor
collapsed any step, the bug is invisible until someone mints or renames
a persona — exactly the demo path.

**Files to read (in order):**

- `src/hooks/useCreatePersona.ts`
- `src/hooks/useUpdatePersona.ts`
- `src/hooks/useUpdatePersona.test.tsx` (already exists — see what it covers)
- `src/hooks/useCreatePersona.test.tsx` (already exists)
- Compare against the inline version at commit `3dc4287` for `Onboard.tsx`
  and `EditPersona.tsx` (`git show 3dc4287:src/pages/Onboard.tsx` and
  `git show 3dc4287:src/pages/EditPersona.tsx`).

**Audit checklist (must all be present in the new hooks):**

1. **Mnemonic generation happens before `connectWallet`.** The hook owns
   the seed lifecycle so the SDK only ever sees a hot mnemonic.
2. **`registerLightningAddressWithRetry` is called with `baseUsername`,
   `description`, and `fallbackBase: "persona"`.** The base must be the
   user-typed username when present, otherwise `slugifyForUsername(name)`.
3. **The `LightningAddressInfo` result writes back to `wallet.lightning_address`
   AND `wallet.lnurl` in the encrypted envelope.** Forgetting `lnurl` breaks
   the WalletPanel's bech32/QR display.
4. **`persona.username` gets the resolved (post-suffix) value, not the
   user input.** Otherwise the UI shows `imani` while the SDK serves
   `imani-7k2p@breez.tips`.
5. **`persona.display_name` is set on create AND preserved (or updated) on
   rename.** The kind 0 publish reads it.
6. **kind 0 republish writes `name` (= username), `display_name`, and
   `lud16` (= lightning_address).** Skipping any of these makes the
   persona's Nostr profile diverge from the encrypted backup.
7. **Disconnect on every path** — the SDK connection is in a
   try/finally so a registration failure doesn't leak the SDK handle.
8. **Registration failure is non-fatal during create** (toast + continue
   without an address) but **fatal during rename** (envelope save aborts
   so the user can pick another username). See Task 2 for the
   `noSuffixOnCollision` flag.

**If any item is missing:** open a new commit `Restore LN registration
step in useCreatePersona/useUpdatePersona` that adds the missing piece
back into the hook, and add a regression test that asserts the post-mint
envelope has `wallet.lightning_address`, `wallet.lnurl`, and
`persona.username` populated.

**Validation:** existing tests pass; new test covers the
mint-with-registration path against a mocked SDK that returns a known
`LightningAddressInfo`.

---

## Task 2 — `noSuffixOnCollision` for deliberate renames

**Why:** `registerLightningAddressWithRetry` always appends a 4-char
suffix on collision. That's correct for Onboard (creation flow, user
just wants something to land), but a deliberate rename in EditPersona
silently mangles `imani` → `imani-7k2p` instead of telling the user the
name is taken. Surprises the user; bad data gets saved.

**Files to change:**

- `src/lib/wallet/lightningAddress.ts` — extend
  `RegisterLightningAddressOptions` with an optional
  `noSuffixOnCollision?: boolean`. When true, skip the retry loop:
  - `checkLightningAddressAvailable` says taken → throw
    `LightningUsernameTakenError` (new exported error class).
  - `registerLightningAddress` throws → re-throw as the same error.
- `src/lib/wallet/lightningAddress.ts` — export
  `class LightningUsernameTakenError extends Error { username: string }`
  so callers can pattern-match.
- `src/hooks/useUpdatePersona.ts` (or wherever the rename flow lives
  after Task 1) — pass `noSuffixOnCollision: true` when the operation
  is a username *change* (i.e. `original.username !== newUsername` and
  `original.username` was not undefined). Backfill (where
  `original.username` is undefined) keeps the suffix behavior.
- Same hook — catch `LightningUsernameTakenError` and re-throw as a
  user-friendly error: "Username `imani` is taken — pick another." The
  envelope save aborts (no kind 30078 publish, no kind 0 publish).
- `src/pages/EditPersona.tsx` — adjust the "taken" hint copy in
  `UsernameAvailabilityHint` to match: stop saying "Save will append a
  random suffix rather than fail."

**Tests:**

- Unit: `lightningAddress.test.ts` — mock SDK, assert
  `registerLightningAddressWithRetry({ noSuffixOnCollision: true })`
  throws `LightningUsernameTakenError` on a taken probe.
- Hook: `useUpdatePersona.test.tsx` — assert that a rename to a taken
  name throws and does NOT publish kind 30078 or kind 0. Backfill (no
  prior username) still suffixes.

**Validation:** `npm test` green. Manual: in EditPersona, type a known-taken
name, hit Save, see the "taken" toast and no profile change.

---

## Task 3 — Dashboard nudge for missing donate handle

**Why:** Legacy personas (created before LN registration shipped) only
discover they have no donate handle by opening the wallet dialog. A
small banner under the persona header on the Dashboard makes it
discoverable from the main view.

**Files to change:**

- `src/pages/Dashboard.tsx` — under the existing persona header
  `<section>` (the charcoal mat with avatar + tags + actions menu),
  before the composer card, render a one-line dismissable card when:
  - `personaConfig` is loaded, AND
  - `wallet.info?.lightningAddress` is `undefined`, AND
  - `walletSeed` is present (no point nudging if there's no wallet).
- Banner copy: "No public donate handle yet — claim a username on
  Edit persona to enable zaps."
- Style: same shape as the existing `border-dashed border-amber-500/30
  bg-amber-50/40` "wallet not minted" banner so the visual vocabulary
  stays consistent.
- Dismissable: persist the dismissal in `sessionStorage` keyed by
  `npub` so we don't pester within a session, but it returns next
  session if the address is still missing.
- Link target: `/dashboard/${npub}/edit`, scrolling/focusing the
  Username field if practical (out of scope for V1; just navigate).

**Validation:** Manual smoke — load a persona with no
`lightning_address`, see the banner; click through to EditPersona, claim
a username, return to Dashboard, banner is gone.

---

## Task 4 — Unit tests for the pure LN-address helpers

**Why:** `slugifyForUsername`, `isValidLightningUsername`,
`randomUsernameSuffix`, and `probeLightningUsernameAvailability` are all
pure (or easily mockable) and currently untested. The slug regex is the
likely source of future surprises (Unicode, diacritics, leading
hyphens, length truncation).

**File to create:** `src/lib/wallet/lightningAddress.test.ts`

**Test cases (must include):**

- `slugifyForUsername`:
  - `"Voice of Rwanda"` → `"voice-of-rwanda"`
  - `"Imani Hakizimana"` → `"imani-hakizimana"`
  - `"Café Maman"` (diacritics) → `"cafe-maman"`
  - `"--leading--hyphens--"` → `"leading-hyphens"`
  - `""` → `""`
  - 50-char input → result `<= 30` chars
  - `"!!!@@@"` → `""` (no valid chars)
- `isValidLightningUsername`:
  - `"imani"` → true
  - `"imani-jr"` → true
  - `"imani-7k2p"` → true
  - `"-imani"` → false (leading hyphen)
  - `"Imani"` → false (uppercase)
  - `""` → false
  - 30-char limit boundary
- `randomUsernameSuffix`:
  - Length 4
  - Each char ∈ `[a-hjkmnpqrstuvwxyz23456789]`
  - 1000 iterations: ≥ 950 unique values (sanity check on randomness)
- `probeLightningUsernameAvailability`:
  - Mock `fetch` to return 404 → `"available"`
  - Mock 200 → `"taken"`
  - Mock 500 → `"error"`
  - Mock throw → `"error"` (no exception bubbles)
  - Invalid input (`"-bad"`) → `"error"` without calling fetch

**Validation:** `npm test` green; coverage of these four functions at
100% (they're small).

---

## Task 5 — Doc sweep for `breez.tips`

**Why:** The source code now uses `SPARK_LN_DOMAIN = "breez.tips"`
consistently, but `docs/guides/breez-spark.md` and other docs still
reference the old `breez.tips` domain. The docs are read by future
agents/contributors as design references — leaving the wrong domain
will produce more code that probes the wrong endpoint.

**Files to grep and update:**

```bash
grep -rln "spark\.money" docs/ dev/ AGENTS.md README.md
```

Expected matches (as of the audit on this branch):

- `docs/guides/breez-spark.md` — multiple references in the LNURL
  registration section.
- `dev/PROJECT.md` §7.x if it references the domain.
- `docs/DATA-FLOW.md` if it shows kind 0 lud16 examples.

**Replacements:**

- `breez.tips` → `breez.tips` in prose and example addresses.
- Add a parenthetical: "(default Breez LNURL host; the SDK's
  `getLightningAddress()` returns whatever Spark assigns)".
- In `breez-spark.md`, add a note: "The default domain is configurable
  via `Config.lnurlDomain`; Phoenix V1 uses the default."

**Validation:** `grep -rln "spark\.money" docs/ dev/ AGENTS.md README.md`
returns no hits. Manual: read the registration section of
`breez-spark.md` end to end.

---

## Sequencing + branching

1. Land Task 1 first — it's the only one where there might be a hidden
   bug. If issues are found, they may change the surface for Tasks 2–4.
2. Tasks 2 + 3 + 4 are independent and can land in any order, ideally
   one commit each.
3. Task 5 is a pure docs commit and should land last so it reflects any
   API/error changes from Task 2.

All tasks together fit one PR titled "Wallet UI + LN address follow-ups"
or split into 2 PRs (audit + tests as one, UX polish + docs as the
other) at the implementer's discretion.

## Out of scope for this plan

- Operator wallet LN address (deferred earlier — operator is an internal
  funder, no public donate handle needed for V1).
- BOLT12 offer support (Spark SDK 0.13.6 doesn't expose it as a receive
  method).
- Cross-device persona unlock disclosure (separate UX concern).
- Spark `lnurlDomain` config plumbing (we hardcode `breez.tips` for now;
  revisit when Breez ships a self-hosted LNURL host option Phoenix
  cares about).
