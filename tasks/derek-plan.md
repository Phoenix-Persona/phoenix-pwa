# Derek's Plan — Feniksi (formerly Phoenix Persona)

**Role:** Frontend + Nostr + PWA (PROJECT.md §12).
**Source of truth:** [`dev/PROJECT.md`](../dev/PROJECT.md). When this plan and PROJECT.md disagree, **PROJECT.md wins**.

> **Coordination rule.** Other devs (Anaïse, Jim, Topher) are working in parallel. To avoid merge conflicts, I touch only the files claimed below in "Files I own". Anything cross-cutting (`PROJECT.md`, `tasks/todo.md`, `App.tsx`, `AppRouter.tsx`, `package.json`) gets a heads-up in chat before I touch it.

---

## Status (as of PR #3 merge — `5a9f9d0`)

**Shipped — Derek-owned V1 slice complete:**

- Persona schema + crypto + scan-and-decrypt cache (PR #1)
- NIP-49 at-rest layer + UnlockGate (PR #1)
- Persona Edit + Delete (NIP-09 tombstone) (PR #3)
- Two-step onboard wizard with profile picture upload / PPQ generate (PR #3)
- Stable `persona.dTag` in encrypted plaintext (PR #3)
- Settings page: Account (Lock / Forget / Change passphrase / Download backup) + Relays (NIP-65 manager) + Personas (PR #3)
- AuthDialog NIP-49 import — kill-and-resurrect ready (PR #3)
- Verify page with real client-side signature checks (PR #3)
- Phoenix → Feniksi rebrand (PR #3)
- Modern Rwandan flag accents (sky / gold / green) (PR #3)
- NostrSync resets relay/Blossom on user change + invalidates persona caches (PR #3)
- Spike C Part 1 deliverable — `docs/spike-nostr.md` (PR #1)

**Outstanding (Derek-owned, this branch and beyond):**
- PWA polish — manifest, service worker, install prompt (V1.5)
- Mobile QA pass — iPhone Safari + Android Chrome at 360 / 414 / 768 px
- Live-relay verification runbook (5 min with Anaïse)
- Mobile NIP-49 latency measurement on Anaïse's phone
- MyPersonas card secondary stats (post count, last-active timestamp)
- Render NIP-92 `imeta` images on PersonaFeed posts
- Persona nsec backup multi-device rehearsal (Phase 5 demo prep)
- Refactor: extract `useCreatePersona` hook (defer until V2 wizard work)

**Outstanding (waiting on others — not Derek's lane):**
- Compose AI styling (Jim — PPQ `useStyle` hook)
- Inline post-image generation in compose (Jim)
- Wallet UI: balance / receive / send / tx history (Jim)
- `mintPersonaWallet` seam in Onboard publish flow (Jim)
- Settings → per-task model picker reading PPQ `/v1/models` (Jim)
- Voice sample generation in wizard (Topher)
- Donate button on PersonaFeed + zap receipt rendering (Topher)
- Imigongo palette / pattern / type pairing (Anaïse)

**V2 (deferred per PROJECT.md §6, §8):**
- Agent-driven character creator (`pi-agent-core` interview)
- Video generation
- Multi-operator-per-device

---

---

## Files I own (no one else edits these without a heads-up)

**Existing — adapt:**
- `src/lib/persona.ts`
- `src/lib/personaCrypto.ts`
- `src/lib/personaKey.ts`
- `src/lib/personaPost.ts`
- `src/lib/persona.test.ts`
- `src/hooks/usePersona.ts`
- `src/hooks/usePersonaPublish.ts`
- `src/pages/Onboard.tsx` (rewrite — wizard shell)
- `src/pages/Dashboard.tsx` (rewire composer)
- `src/pages/MyPersonas.tsx`
- `src/pages/PersonaFeed.tsx`
- `src/pages/Verify.tsx`

**Existing — delete:**
- `src/lib/styleClient.ts` (replaced by Jim's PPQ wiring)

**New (mine):**
- `src/lib/nip49Storage.ts` (NIP-49 wrapper used by both at-rest and export flows)
- `src/lib/userSigner.ts` (proxy signer holding the unlocked user nsec in memory; implements Nostrify's signer interface)
- `src/lib/zaps.ts` (NIP-57 helpers, kind 9735 parsing)
- `src/components/UnlockGate.tsx` (route gate that prompts for the NIP-49 passphrase on first signer use per session)
- `src/components/CharacterCreator.tsx` (wizard chat shell, hosts Jim's agent)
- `src/components/ZapFeed.tsx`
- `src/components/DonateButton.tsx`
- `src/pages/Settings.tsx`
- `public/manifest.webmanifest`
- `public/icons/*`
- `src/sw.ts` (or whatever Vite-PWA names it) + Vite-PWA config in `vite.config.ts`
- `spikes/nostr-breeze/nostr/*` (spike scratch)
- `docs/spike-nostr.md` (spike deliverable — only Part 1 of phase-0-spikes Spike C; Jim now owns Breeze)

**Read-only for me — touch only with a heads-up in chat:**
- `tasks/todo.md` (team plan; mirrors my work but I don't edit it solo)
- `dev/PROJECT.md` (authoritative; amendments need Anaïse)
- `src/App.tsx`, `src/AppRouter.tsx`, `src/components/{AppProvider,NostrProvider,NostrSync}.tsx`
- `src/components/auth/*` (the existing flow is sufficient — see decision below)
- `package.json` / `package-lock.json`

**Owned by others — I never edit:**
- `src/hooks/usePpq*`, `src/lib/ppq/*` → Jim
- `src/lib/wallet.ts`, `src/hooks/useWallet.ts`, `src/components/Wallet*.tsx` → Jim (post-Spike C reassignment)
- Topher's PPQ infra / LNURL-pay endpoint hosting → Topher

---

## Locked decisions (override PROJECT.md where noted — needs Anaïse to amend)

### 1. NIP-49 at-rest encryption — IN

**Decision (Derek):** wrap fresh Phoenix-generated user nsecs in NIP-49 ncryptsec at rest in localStorage. Defense in depth against browser-extension snooping, shared devices, and the user-expectation that a passphrase guards a sensitive key. The XSS argument still stands but isn't the only threat surface.

**Locked UX:**
| Decision | Value |
|---|---|
| Unlock cadence | **Once per session.** Passphrase prompt on first action that needs the user signer; unlocked nsec held in memory until tab close. |
| Scope | **Per-user, not per-persona.** Persona nsecs are already encrypted-at-rest *inside* the kind 30078 backup (NIP-44 to user). Adding a second passphrase per persona doubles prompt surface for no extra protection. |
| scrypt difficulty | **log_n = 18** (~400ms; balanced mobile-vs-security). Optional "stronger" toggle in Settings → log_n=20 for paranoid users. |
| BYO users | Untouched — they keep using their existing signer (NIP-07/NIP-46/paste). |
| Backup export | NIP-49 ncryptsec download from the wizard / Settings. Same primitive, different code path (export-only, not on-disk storage). |

**Spec consistency:** PROJECT.md §3 already calls for NIP-49 at-rest. PROJECT.md §10 #6 ("single passphrase per device or per persona?") is now resolved → per-user, once-per-session. Update §10 to mark resolved.

### 2. Schema privacy — keep the existing untrackable design (override PROJECT.md §5.2)

**Decision (Derek):** "We don't want to leak anything." The kind 30078 envelope keeps the existing privacy-preserving form:

| Field | PROJECT.md §5.2 | Locked |
|---|---|---|
| `d` tag | `phoenix-persona:<persona-pubkey-hex>` | **random UUID** (current code). The persona pubkey never appears in plaintext on the wire. |
| `t` tag | `phoenix-persona` | **omitted.** A `#t:phoenix-persona` filter would let any relay observer enumerate every Phoenix user. |
| `alt` tag | `Phoenix persona backup (encrypted)` | **omitted.** Fingerprints Phoenix usage. |
| `content` | NIP-44 ciphertext to user pubkey | unchanged |
| Plaintext payload | §5.2 schema | unchanged — adopt §5.2 inner payload structure (richer fields than current code). |

**What this preserves.** From the outside, a Phoenix kind 30078 event is indistinguishable from any other NIP-78 app's encrypted application data. An observer can count "user has N kind 30078 events" but can't say "N of which are Phoenix personas" without decryption. Anyone who learns the persona pubkey separately *cannot* reverse-link to the user by querying the relay for that string.

**The cost.** No tag-filter shortcut for persona discovery. The app must `query → decrypt-each → filter` the user's kind 30078 events. With result caching by event id and the user-pubkey filter limiting candidate set size, this is fine in practice. Already implemented in `usePersona.ts`.

**Kind 1 posts** (§5.3): same treatment — omit `t:phoenix`, `client:phoenix`, persona-name `alt:`. Existing `personaPost.ts` is correct as written.

**Kind 0 profile** (§5.1): the `phoenix.voice_sample` / `phoenix.reference_image` namespace is acceptable — kind 0 is the *persona's* public face, and identifying-the-persona-as-AI is a feature of Phoenix's transparency story. Leak boundary is the operator → persona link (kind 30078), not whether the persona itself is recognizably-AI.

**Action:** raise as a PROJECT.md amendment with Anaïse at Phase 0 kickoff. Files needing update if she blesses: PROJECT.md §5.1/5.2/5.3, §10 #6 (resolved), AGENTS.md, docs/threat-model.md, docs/persona-schema.md, docs/nostr-nips.md, docs/glossary.md, todo.md Phase 1.

---

## Phase 0 — Lock contracts (Hours 0–2) — ✅ COMPLETE

### Coordination — ✅
- [x] Read PROJECT.md end-to-end with the team
- [x] Confirm role split (Derek=Nostr only; Jim takes Breeze; Topher PPQ + LNURL-pay)
- [x] Propose PROJECT.md amendments to Anaïse: §5.2 envelope keeps untrackable form; §10 #6 resolved (per-user, once-per-session, log_n=18). Sign-off received before the inner-payload rewrite landed.
- [x] (Derek + Topher) Lock the §5.2 *inner payload* schema
- [x] (Derek + Jim) Lock the wizard agent tool set per §6 (deferred to V2 — V1 ships form-based)
- [x] Pick default models per task (PROJECT.md §6 table)
- [x] Demo arc agreed

### Spike — Nostr crypto (Spike C Part 1, ~1h) — ✅ shipped
**Working dir:** `spikes/nostr-breeze/nostr/round-trip.test.ts`
**Deliverable:** `docs/spike-nostr.md` (Part 1; Jim's Breeze half separate)

- [x] Generate fresh user keypair (`nostr-tools/pure`)
- [x] Generate fresh persona keypair
- [x] NIP-44 self-encrypt a JSON payload to user pubkey; round-trip; assert equality
- [x] NIP-49 encrypt user nsec at log_n=18; round-trip decrypt; assert equality (desktop measured: encrypt 682ms / decrypt 674ms)
- [x] Build kind 30078 with **random UUID d-tag, no `t`, no `alt`**, sign with user
- [ ] Live-relay query verification on Damus / Ditto / primal / nostr.band — **owed; runbook in `docs/spike-nostr.md`** (5 min with Anaïse)
- [x] Time the scan-and-decrypt loop with cache off vs. on (100-event sim: cold 9.1ms → warm 0.03ms, 268× speedup)
- [x] Document signer NIP-44 self-encryption pattern, envelope shape, scan-decrypt latency
- [ ] Mobile NIP-49 latency on Anaïse's phone — **owed; affects WebWorker decision**

---

## Phase 1 — Skeleton (Hours 2–8) — ✅ COMPLETE

### Persona library rewrite (`src/lib/persona*`, `src/hooks/usePersona*`) — ✅
- [x] `persona.ts`: §5.2 inner payload Zod schema, untrackable envelope tags, `app:"phoenix-persona"` discriminator, derive-and-verify, stable `persona.dTag` (added PR #3)
- [x] `personaCrypto.ts`: NIP-44 self-encrypt + parsePhoenixEnvelope shipped
- [x] `personaKey.ts`: kept as-is (correct)
- [x] `personaPost.ts`: kept untrackable (no `t:phoenix`, no `client:phoenix`)
- [x] `persona.test.ts`: 41 passing including dTag back-compat + tampered-envelope tests
- [x] `usePersona.ts`: scan-and-decrypt + per-event-id NIP-44 decryption cache (268× warm-pass speedup measured)
- [x] `usePersonaPublish.ts`: kept, no changes needed
- [ ] **Refactor TODO (Tier 3, defer to V2):** extract `useCreatePersona` mutation hook. Currently the publish flow is inline in `Onboard.tsx` and partially mirrored in `EditPersona.tsx`. Best timed when the agent wizard begins so the extraction has a second consumer.

### `src/lib/styleClient.ts` removal — ✅
- [x] Deleted in PR #1

### User keypair onboarding + NIP-49 at-rest wrapper — ✅
- [x] `AuthDialog.tsx` audited; "operator" → "user" terminology
- [x] `src/lib/nip49Storage.ts` shipped (encryptNsec / decryptNcryptsec / store / load / clear / has)
- [x] Signup flow inserts a `passphrase` step between `secure` and `profile` (PR #1)
- [x] `<UnlockGate>` wraps `<AppRouter>`; first-signer-use prompt; once-per-session (PR #1)
- [x] Settings → Danger Zone: Lock now / Forget device / **Change passphrase** / **Download backup** (PR #3)
- [x] Documented threat-model boundary (defends passive disk reads + extensions + shared devices, NOT XSS)
- [x] **NIP-49 import** in AuthDialog completes the kill-and-resurrect arc (PR #3)
- ⚠️ **Architectural deviation:** `userSigner.ts` proxy signer was NOT built. Instead, the at-rest layer routes through Nostrify's standard `login.nsec()` flow gated by `<UnlockGate>`. Trade-off: during an active session, the unlocked nsec lives in Nostrify's localStorage; between sessions only the ncryptsec is parked. Documented in `nip49Storage.ts` header.

### Persona keypair generation — ✅
- [x] `generatePersonaKeypair` correct as-is; never written to disk
- [ ] `personaSession` in-memory active-persona map — **not built**; current per-mount `usePersona(npub)` is acceptable for V1

### Multi-persona switcher — ✅
- [x] `useLoggedInAccounts` reused for user-account switcher
- ❌ **Cancelled by Derek's review:** PersonaSwitcher dropdown was built then removed. Personas are reachable via the `/my-personas` link in the header and the Settings persona list.

### Page shells — ✅ all shipped, most polished beyond shell stage
- [x] `Onboard.tsx` — two-step wizard (Details + Picture). Form-based; agent harness V2.
- [x] `Dashboard.tsx` — composer + post feed + persona cover header. **Wallet badge pending Jim's seam.**
- [x] `PersonaFeed.tsx` — profile header + posts. **Zap-receipt strip pending Topher's seam.**
- [x] `Settings.tsx` — Account + Relays + Personas (PR #3). **Models section pending Jim's seam.**
- [x] `MyPersonas.tsx` — list + 3-dot Edit/Delete menu + profile-picture avatars (PR #3)
- [x] `Verify.tsx` — real signature checks + counts + timestamps (PR #3)
- [x] `EditPersona.tsx` — same-d-tag re-publish for all editable fields (PR #3)

---

## Phase 2 — Real integration — partially complete

### Agent-driven wizard — V2 deferred per PROJECT.md §6
- [ ] (V2) Wire `pi-web-ui` chat surface inside `CharacterCreator.tsx`
- [ ] (V2) Tool-call interception with proposal cards
- [ ] (V2) `generate_profile_image` / `generate_voice_sample` agent tools

V1 ships the form-based wizard (`Onboard.tsx`); the picture step uses PPQ image generation directly from a user-typed prompt without an agent loop.

### Composer wired to PPQ styling — Jim seam
- [ ] On publish: `useStyle()` (Jim's hook) → styled text → `buildPersonaPostTemplate` → `usePersonaPublish`
- [ ] Inline post-image generation with reference image
- [ ] Show estimated sats cost; disable publish when `useWallet().canAfford()` returns false

### kind 1 publish — ✅
- [x] `personaPost.ts` ships untrackable tags only (`t:<topic>` + `r:<source>`)
- [x] Persona posts go through `usePersonaPublish` (no `client` tag injection)

### PersonaFeed reads real events — partial
- [x] `usePersonaPosts(npub)` shipped and correct
- [ ] Render `imeta` images on posts (NIP-92 helpers from the `note-content` skill)
- [ ] Zap-receipt strip: query kind 9735, decode bolt11, render — Topher seam mostly

### Verify page — ✅ shipped (PR #3)
- [x] Persona npub, kind 0 signature client-side check, post count, profile + first/latest timestamps
- [x] AI-disclosure badge from kind 0 `bot: true`
- [x] All checks happen in the browser; no server trust

### Persona event load on dashboard mount
- [x] `usePersona(npub)` per-mount works correctly
- [ ] Optional: if no persona resolves, redirect to `/my-personas` instead of showing the empty state

### Relay set
- [ ] Finalize 7–10 relays in `AppContext` defaults. Currently 3: Ditto, Primal, Damus. Plan adds: nos.lol, nostr.band, nostr.wine, plus 1–2 regional.

---

## Phase 3 — Polish — partially complete

### Settings page wired — Jim seam
- [x] Settings page shell with Account + Relays + Personas (PR #3)
- [ ] Models section: per-task pickers reading PPQ `/v1/models`, persists into `model_prefs` via kind 30078 republish — Jim seam

### MyPersonas polish — partial
- [x] Profile-picture avatar on each card (PR #3 follow-up)
- [x] 3-dot Edit/Delete menu with confirm dialog (PR #3)
- [x] "New persona" CTA prominent in cover band
- [ ] Post count per card (small Derek task)
- [ ] Last-active timestamp per card (small Derek task)
- [ ] Wallet balance per card — Jim seam

### Public PersonaFeed polish — partial
- [x] Profile header with picture / display_name / about / npub badge / Verify CTA
- [ ] `phoenix.voice_sample` audio control — needs Topher's voice gen first
- [ ] Donate button with QR + LNURL + zap-with-Nostr — Topher seam mostly
- [ ] Inline zap receipts per post — Topher seam mostly

### Download-backup flow — ✅ shipped (PR #3)
- [x] Settings → Account → Download key backup with separate export passphrase
- [x] AuthDialog accepts `.ncryptsec` files; import step decrypts and logs in
- [x] Imported ncryptsec installs verbatim as the at-rest backup (one passphrase)

### Imigongo polish — partial
- [x] Modern Rwandan flag accents (sky / gold / green) applied across all surfaces
- [x] Imigongo earth-tone palette retained for warm decorative layers (photo halos, card borders)
- [x] `ImigongoBand`, `FlagStripe`, `ImigongoSeal` components shipped
- [ ] Final palette + type pairing sign-off from Anaïse
- [x] Splash + 404 + empty-state polish

### Rebrand: Phoenix → Feniksi (Kinyarwanda for "phoenix")

**Decision needed before execution.** The rebrand splits into two
layers with very different blast radii:

**Layer A — Visible / cosmetic (cheap, mostly safe):**
- App name in `package.json`, `README.md`, `index.html` `<title>`
- Documentation: `dev/PROJECT.md` (and the team should know — needs Anaïse's blessing), `AGENTS.md`, `tasks/todo.md`, `docs/*.md`, `tasks/derek-plan.md`
- UI strings: `PhoenixHeader.tsx` brand mark, `useSeoMeta` titles ("— Phoenix" → "— Feniksi"), splash copy, dialog titles, error messages
- Component file rename: `src/components/PhoenixHeader.tsx` → `FeniksiHeader.tsx` (or just `BrandHeader.tsx`)
- Assets: any logo / favicon / OG image referencing "Phoenix"
- PWA manifest `name` / `short_name` / `description`
- Demo deck, one-pager, social copy (Anaïse's lane)

**Layer B — On-wire / persistent identifiers (REQUIRES TEAM DECISION):**
- `PHOENIX_PAYLOAD_APP = "phoenix-persona"` — the magic discriminator inside every encrypted kind 30078 payload. Changing it makes existing personas unreadable.
- The `client` tag value (currently we deliberately omit it for kind 1, so this is a non-issue for now).
- Any future Lightning Address domain (`@phoenix.example`) — Topher's decision; should align with the rebrand.
- The `app:` field inside the NIP-44 plaintext envelope (set to `"phoenix-persona"` via `PHOENIX_PAYLOAD_APP`).

**Recommended on-wire strategy:**
1. **Keep `phoenix-persona` as the on-wire discriminator forever.** It's the protocol identifier; rebrands shouldn't break parser compatibility. Comparable to how npm packages keep their original published name.
2. Document this in `NIP.md` and `dev/PROJECT.md`: "The product is Feniksi. The on-wire NIP-78 payload discriminator stays `phoenix-persona` for forward/backward compatibility with V1 personas."
3. Internal type names + comments + docs say Feniksi; the string constant `PHOENIX_PAYLOAD_APP` becomes a private compatibility detail (could rename the constant to `WIRE_APP_DISCRIMINATOR` to make this explicit).

**Execution checklist (after team approves):**
- [ ] **Decide on-wire policy** — keep `"phoenix-persona"` discriminator (recommended) or migrate (requires v2 envelope + dual-read fallback for any V1 personas already in the wild)
- [ ] **Anaïse signs off** on the brand swap and demo language change
- [ ] Find/replace `Phoenix` → `Feniksi` in user-visible strings only:
  - [ ] `package.json` (`name`, `description`)
  - [ ] `index.html`
  - [ ] `README.md`
  - [ ] All `useSeoMeta({ title: ... })` calls
  - [ ] All toast / error / dialog copy
  - [ ] `PhoenixHeader.tsx` brand wordmark + file rename
  - [ ] `nip49Storage.ts` storage key (`phoenix:user:ncryptsec` → `feniksi:user:ncryptsec`) — **breaks any existing on-device unlock state; OK pre-launch but needs a migration shim if any users have signed up first**
  - [ ] PWA manifest (Phase 3 task — coordinate)
  - [ ] Favicon, OG image, og:title metadata
- [ ] Update docs: `dev/PROJECT.md`, `AGENTS.md`, `tasks/todo.md`, `tasks/derek-plan.md`, `docs/*.md`
- [ ] Add a paragraph in `dev/PROJECT.md` §13 (Glossary) explaining the bilingual brand: "Feniksi (Kinyarwanda for phoenix). The protocol-level identifier `phoenix-persona` is retained for compatibility."
- [ ] Update demo opening: "Feniksi gives an activist a voice that can outlive them." (or whatever Anaïse lands on)
- [ ] One round of grep-and-fix for any straggler "phoenix" strings that should be "Feniksi"

**Coordination note.** This crosses every owner's lane (UI → Derek, on-wire → Derek + Topher, docs/demo → Anaïse, prompts → Jim). Don't execute solo — surface at next sync, pick a window when no one is mid-feature, and do it as a single atomic commit so we don't ship a half-rebranded build.

### PWA — current branch (`derek/phase-3-polish`)
- [ ] `vite-plugin-pwa` manifest with Imigongo-themed 192 / 512 / maskable icons (config exists; icons need real artwork beyond the favicon)
- [ ] Service worker: cache app shell, last-fetched feed, profile assets. Offline shell falls back to "you're offline; recent posts shown below."
- [ ] Install prompt — fires after first successful sign-in (not on first load — too aggressive)
- [ ] App shortcuts manifest entry for "New persona" / "My personas"

### Mobile QA — current branch (`derek/phase-3-polish`)
- [ ] iPhone Safari + Android Chrome at 360 / 414 / 768 px
- [ ] Wizard flow works one-handed
- [ ] Donate-button QR scannable from across a stage (demo-critical) — Topher's surface

---

## Phase 5 — Demo prep (my pieces, Hours 30–34)

- [ ] **Kill-and-resurrect staging.** Pre-test on a second device: log in with the user nsec, watch persona list re-hydrate, publish a post from Device B while Device A is offline. Both halves shipped (download backup + NIP-49 import); needs rehearsal.
- [ ] Persona nsec backups exported to multiple devices (exercises export/import round-trip)
- [ ] Pre-load demo browser tabs, sign-ins tested on demo laptop
- [ ] PWA install demonstrated on Anaïse's phone

---

## Definition of Done — Derek's slice

- [x] Wizard end-to-end runs on a fresh device, generates persona, publishes kind 30078 + kind 0
- [x] Dashboard composer publishes kind 1 with attribution tags + persona signature; appears on PersonaFeed within seconds
- [⚠️] PersonaFeed renders real events; **images via NIP-92 imeta still TODO**; **zap receipts pending Topher**
- [x] MyPersonas lists every persona for the user; switching navigates to that persona's dashboard
- [x] Verify page passes for a freshly-created persona — real client-side signature checks (PR #3)
- [⚠️] Settings persists model overrides — **Jim's surface**; Settings page itself shipped
- [x] Download-backup produces a valid NIP-49 ncryptsec; import recovers via AuthDialog
- [ ] PWA installs on Android; service worker survives a kill-and-relaunch — current branch
- [ ] Kill-and-resurrect demo path works without intervention — needs rehearsal

---

## Review

_Filled in post-demo._
