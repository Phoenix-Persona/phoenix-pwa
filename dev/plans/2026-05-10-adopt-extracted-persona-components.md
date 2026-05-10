# Adopt extracted persona components — implementation plan

> **Status:** Ready to execute. Branch: `derek/edit-persona-cleanup-adoption`.

## Problem

PR #20 (`fix/ui-polish` → `5fd57a1`) created four extracted presentational components for persona pages but **never wired them into their consumers**. The components exist and are tested in isolation, but the page files still render the same JSX inline:

| Component | Created in PR #20 | Used by any page? |
|---|---|---|
| `src/components/persona/PersonaHero.tsx` | ✅ | ❌ — orphan |
| `src/components/persona/EditPersonaIdentityFields.tsx` | ✅ | ❌ — orphan |
| `src/components/persona/EditPersonaPublicProfileFields.tsx` | ✅ | ❌ — orphan |
| `src/components/persona/EditPersonaCrossPostFields.tsx` | ✅ | ❌ — orphan |
| `src/components/persona/DashboardComposerCard.tsx` | ✅ | ✅ — already wired |

Net result: `EditPersona.tsx` is still 503 lines of inline form JSX, `Dashboard.tsx` and `PersonaFeed.tsx` each reimplement the same 90-line hero block. The audit-driven extraction was half-completed.

PR #20 also removed `tags`, `languages`, `voice_id`, `voice_sample_url` from the persona schema. EditPersona and Onboard already dropped those fields from their forms (the cleanup grep returns no references), so the **schema change itself is fully adopted**. The remaining work is purely consuming the extracted components.

## Goal

Wire the 4 orphan components into their intended consumers. Result:

- `EditPersona.tsx` → ~280 lines (down from 503; -223 lines, -44%)
- `Dashboard.tsx` persona-display hero → use `PersonaHero`
- `PersonaFeed.tsx` persona-display hero → use `PersonaHero`
- Zero behavior change. Pure presentational refactor.

## Scope

**In scope:**
- `src/pages/EditPersona.tsx`
- `src/pages/Dashboard.tsx` (hero block only — composer is already extracted)
- `src/pages/PersonaFeed.tsx` (hero block only)

**Out of scope (deferred):**
- `Onboard.tsx` form decomposition — flagged as high-conflict in the original refactor plan. Defer until other onboard work lands.
- The `Dashboard.tsx` skeleton-loading hero variant (lines 177-187). Keep inline; it's small and divergent from the data-loaded shape.
- New tests. The extracted components already have isolated tests in PR #20. Page-level smoke tests stay as-is.

## Pre-flight

- [ ] `git status` clean
- [ ] On branch `derek/edit-persona-cleanup-adoption` based on `main` HEAD `c820745` or later
- [ ] `npm test` baseline green (117 tests expected per PR #20's commit message)

---

## Task 1 — Adopt EditPersona*Fields trio

**Files:**
- Modify: `src/pages/EditPersona.tsx`

**Steps:**

- [ ] **1.1 Replace the inline identity fields block (lines 302-335) with `<EditPersonaIdentityFields>`.**
  - Pass: `name`, `username`, `initialUsername`, `availability`, `onNameChange`, `onUsernameChange`.
  - The local `UsernameAvailabilityHint` function (lines 444-501) becomes dead code — delete it. The identical version is already inside `EditPersonaIdentityFields.tsx`.

- [ ] **1.2 Replace the inline bio + picture block (lines 337-359) with `<EditPersonaPublicProfileFields>`.**
  - Pass: `bio`, `pictureUrl`, `name`, `loadingBio={profileQuery.isLoading}`, `onBioChange={setBio}`, `onPictureUrlChange={setPictureUrl}`.

- [ ] **1.3 Replace the inline cross-post block (lines 373-412) with `<EditPersonaCrossPostFields>` wrapped in the existing `crossPostEnabled` gate.**
  - Pass: `webhookUrl`, `webhookPlatformsInput`, `onWebhookUrlChange`, `onWebhookPlatformsInputChange`.

- [ ] **1.4 Drop now-unused imports:**
  - `Input`, `Label`, `Textarea` (still used by the system-prompt textarea — keep `Textarea` and `Label`)
  - `PersonaPictureField` (now imported by the public-profile fields component)
  - `SPARK_LN_DOMAIN` (now imported by the identity-fields component)

- [ ] **1.5 Verify behavior unchanged.**
  ```bash
  npm test
  ```
  Expected: 117/117 pass. No new warnings.

- [ ] **1.6 Manual smoke** — open `/dashboard/<npub>/edit`:
  - Display name + username flow including live availability check
  - Bio + picture upload/generate flow
  - System prompt textarea
  - Cross-post webhook fields
  - Save → toast → navigate back to dashboard
  - Cancel → navigate back

- [ ] **1.7 Commit:**
  ```bash
  git add src/pages/EditPersona.tsx
  git commit -m "Adopt extracted EditPersona field components"
  ```

---

## Task 2 — Adopt PersonaHero in Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Steps:**

- [ ] **2.1 Replace the inline persona hero (lines 188-256) with `<PersonaHero>`.**

  Replacement:
  ```tsx
  <PersonaHero
    eyebrow="Composer"
    name={personaConfig.name}
    bio={publicBio}
    pictureUrl={picture ?? null}
    avatarSize="dashboard"
    actions={
      <div className="flex items-center gap-2 pt-2">
        {walletSeed ? (
          <WalletBadge
            wallet={wallet}
            onClick={() => setWalletOpen(true)}
            inverse
          />
        ) : null}
        <PersonaActionsMenu
          npub={npub}
          backupEvent={persona.data!.event}
          personaPubkey={personaConfig.pubkey}
          personaName={personaConfig.name}
          variant="inline"
          publicFeedNpub={npub}
          inverse
        />
      </div>
    }
  />
  ```

- [ ] **2.2 Leave the loading skeleton (lines 177-187) AS-IS.** The skeleton hero is a different visual (grey blocks, no avatar logic) and inlining it into `PersonaHero` would over-complicate the component's prop surface for one variant. Keep it inline.

- [ ] **2.3 Drop now-unused imports** (audit imports section — `ImigongoSeal`, possibly `FlagStripe` if no other usage).

- [ ] **2.4 Verify:**
  ```bash
  npm test
  ```

- [ ] **2.5 Manual smoke** — open `/dashboard/<npub>`:
  - Hero renders identically: avatar, eyebrow "Composer", name, bio, wallet badge, persona actions
  - Composer card below still works (already wired to `DashboardComposerCard`)
  - Loading state still renders the skeleton variant

- [ ] **2.6 Commit:**
  ```bash
  git add src/pages/Dashboard.tsx
  git commit -m "Adopt PersonaHero in Dashboard persona-display section"
  ```

---

## Task 3 — Adopt PersonaHero in PersonaFeed

**Files:**
- Modify: `src/pages/PersonaFeed.tsx`

**Steps:**

- [ ] **3.1 Replace the inline persona hero (lines 54-123) with `<PersonaHero>`.**

  Replacement:
  ```tsx
  <PersonaHero
    eyebrow="Public persona"
    name={displayName}
    bio={bio}
    pictureUrl={picture ?? null}
    avatarSize="public"
    badges={
      <div className="flex flex-wrap gap-2 pt-1 items-center">
        <Badge
          variant="secondary"
          className="font-mono text-[10px] bg-imigongo-cream/15 text-imigongo-cream border-0"
        >
          {npub.slice(0, 16)}…
        </Badge>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-full border-imigongo-cream/30 text-imigongo-cream bg-transparent hover:bg-imigongo-cream/10 hover:text-imigongo-cream"
        >
          <Link to={`/verify/${npub}`}>
            <ShieldCheck className="mr-2 size-4" />
            Verify
          </Link>
        </Button>
      </div>
    }
  />
  ```

  Note: this uses `badges` rather than `actions` so the npub pill + Verify button appear in the same line as in the original. Both prop slots accept any ReactNode; the difference is visual ordering inside `PersonaHero` (badges render between `bio` and `actions`).

- [ ] **3.2 Drop now-unused imports** — likely `ImigongoSeal`, possibly `FlagStripe`.

- [ ] **3.3 Verify:**
  ```bash
  npm test
  ```

- [ ] **3.4 Manual smoke** — open `/<npub>` (public persona feed):
  - Hero renders: avatar, "Public persona" eyebrow, name, bio, npub pill, Verify button
  - Feed list below still loads
  - Empty / loading / error states still work

- [ ] **3.5 Commit:**
  ```bash
  git add src/pages/PersonaFeed.tsx
  git commit -m "Adopt PersonaHero in PersonaFeed"
  ```

---

## Final verification

- [ ] **Full validation:**
  ```bash
  npm test
  ```

- [ ] **Diff sanity check:**
  ```bash
  git diff --stat origin/main...HEAD
  ```
  Expected: 3 files changed, ~250-300 lines removed, ~80 lines added (net ~-200).

- [ ] **Push and PR:**
  ```bash
  git push -u origin derek/edit-persona-cleanup-adoption
  gh pr create --title "Adopt extracted persona components in EditPersona + Dashboard + PersonaFeed" \
    --body "..."
  ```

## Why this matters

Beyond the line-count win, this finishes the audit-remediation work in `dev/reports/codebase-audit-2026-05-10.md` finding #5 ("Route components own too much business logic"). Three pages now stop owning ~70 lines of identical hero JSX each, and EditPersona's 200+-line form becomes a thin orchestrator around three named field groups — easier to skim, easier to test, easier to vary visually if a future design pass changes the field layout.

## Risks

- **Visual regression** is the primary risk. Mitigation: read the extracted components against the inline JSX side-by-side before deleting (Steps 1.1-1.3, 2.1, 3.1). The components were extracted by `git mv`-equivalent so the markup should be identical, but PR #20 was a squash and small drift is possible.
- **Prop coverage gaps**: the inline JSX may pass an inline class or callback that the extracted component doesn't expose. If found, prefer adding the prop to the component (and its test) over forking the JSX.
- **Onboard.tsx is intentionally untouched** — that file was flagged as high-conflict in the prior refactor plan. Wait for the next onboard-touching PR to land before tackling it.
