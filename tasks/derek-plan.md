# Derek's Plan — Phoenix Persona

**Role:** Frontend + Nostr + PWA (PROJECT.md §12).
**Source of truth:** [`dev/PROJECT.md`](../dev/PROJECT.md). When this plan and PROJECT.md disagree, **PROJECT.md wins** — but see "Open items to escalate" below for two cases where I'm proposing PROJECT.md should change.

> **Coordination rule.** Other devs (Anaïse, Jim, Topher) are working in parallel. To avoid merge conflicts, I touch only the files claimed below in "Files I own". Anything cross-cutting (`PROJECT.md`, `tasks/todo.md`, `App.tsx`, `AppRouter.tsx`, `package.json`) gets a heads-up in chat before I touch it.

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

## Phase 0 — Lock contracts (Hours 0–2)

### Coordination
- [ ] Read PROJECT.md end-to-end with the team
- [ ] Confirm role split (Derek=Nostr only; Jim takes Breeze; Topher PPQ + LNURL-pay)
- [ ] Propose PROJECT.md amendments to Anaïse: §5.2 envelope keeps untrackable form; §10 #6 resolved (per-user, once-per-session, log_n=18). Get her sign-off before the inner-payload rewrite lands.
- [ ] (Derek + Topher) Lock the §5.2 *inner payload* schema — the encrypted JSON the user signs over. Envelope tags are non-negotiable per the locked decision above.
- [ ] (Derek + Jim) Lock the wizard agent tool set per §6 — agree on tool names + arg shapes Jim will implement and I'll surface in `pi-web-ui`
- [ ] Pick default models per task with the team (PROJECT.md §6 table)
- [ ] Demo arc agreed

### Spike — Nostr crypto (Spike C Part 1, ~1h)
**Working dir:** `spikes/nostr-breeze/nostr/`
**Deliverable:** `docs/spike-nostr.md` (Part 1 of the original spike — Jim writes the Breeze half separately)

- [ ] Generate fresh user keypair (`nostr-tools/pure`)
- [ ] Generate fresh persona keypair
- [ ] NIP-44 self-encrypt a JSON payload to user pubkey; round-trip; assert equality
- [ ] NIP-49 encrypt user nsec at log_n=18; measure derive time on desktop + a real mobile device; round-trip decrypt; assert equality
- [ ] Build kind 30078 with **random UUID d-tag, no `t`, no `alt`**, sign with user, publish to a real relay
- [ ] Query back with `{kinds:[30078], authors:[user_pubkey], limit:200}` on Damus, Ditto, primal, nostr.band — confirm all four return the event
- [ ] Time the scan-and-decrypt loop with 1 / 10 / 100 candidate kind 30078 events (with NIP-44 cache off vs. on)
- [ ] Document: signer NIP-44 self-encryption pattern (author == recipient), envelope shape, scan-decrypt latency, NIP-49 mobile latency

### Spike deliverable note (`docs/spike-nostr.md`)
Recommended Phase 1 approach captures:
- Signer self-encrypt API call shape (what `user.signer.nip44.encrypt(user.pubkey, json)` looks like end-to-end)
- Confirmed scan-and-decrypt query + cache strategy (cache decrypt results by event id; only decrypt new candidates on subsequent loads)
- Measured scan-decrypt latency at expected scale; flag if a remote NIP-46 signer makes this painful
- NIP-49 wrapper helper signature: `nip49.encrypt(skBytes, passphrase, log_n=18) -> ncryptsec` and the inverse, with WebWorker offload if log_n=18 jank tests poorly on mobile
- Relay set we'll target

---

## Phase 1 — Skeleton (Hours 2–8)

### Persona library rewrite (`src/lib/persona*`, `src/hooks/usePersona*`)
Adapt — don't rewrite. **Outer envelope (event tags) stays untrackable per the locked decision.** **Inner payload (decrypted JSON) adopts §5.2 schema.**

- [ ] `persona.ts`:
  - **Tags unchanged:** `[["d", <random-uuid>]]`. No `t`, no `alt`. (Existing `buildEncryptedPersonaTemplate` is correct.)
  - **Inner payload Zod schema** updated to §5.2:
    - `version: 1`
    - `persona: { pubkey, nsec, name, system_prompt, voice_id, voice_sample_url?, reference_image_url?, languages[], tags[], created_at }`
    - `wallet: { kind: "breeze", seed, lnurl? }`
    - `model_prefs: { agent, image, tts, video? }`
    - `settings: { default_relays[] }`
  - Drop sketch-era fields: `region`, `cause`, `tone`, `frequencySec`, `sources`, `focus`, `personality`, `bio`, `voiceStyle`, `avoidTopics`. `bio` and any voice-style guidance fold into `system_prompt`. Topical tags move to `persona.tags`.
  - Preserve `app: "phoenix-persona"` discriminator and `version: 1` pin inside the encrypted payload.
  - Preserve derive-and-verify (`personaPubkey` claim must match `getPublicKey(personaNsec)`).
- [ ] `personaCrypto.ts`: minimal change — NIP-44 self-encrypt is the same. Update types to point at the new payload schema.
- [ ] `personaKey.ts`: keep as-is (already correct; no localStorage persistence).
- [ ] `personaPost.ts`: **keep as-is.** No `t:phoenix`, no `client:phoenix`, no persona-name `alt:`. Existing comments document why.
- [ ] `persona.test.ts`: rewrite for new payload schema; keep the tampered-envelope test (still valuable).
- [ ] `usePersona.ts`: **keep the scan-and-decrypt approach.** Add a per-event-id NIP-44 decryption cache (in-memory map `Map<event.id, PhoenixEnvelope | "not-phoenix">`) so subsequent persona switches don't re-decrypt the same events. Keep the d-tag dedup (newest revision per d-tag wins).
- [ ] `usePersonaPublish.ts`: keep; verify timeout still right.
- [ ] Add `useCreatePersona` mutation that bundles: generate persona keypair → build §5.2 inner payload → NIP-44 self-encrypt to user pubkey → publish kind 30078 with random UUID d-tag → publish kind 0 from persona keypair → return `{persona, event}` for the dashboard to pick up.

### `src/lib/styleClient.ts` removal
- [ ] Delete the file
- [ ] Find all importers and update them to point at Jim's `src/lib/ppq/*` (or stub if Jim isn't ready — ImportError is preferable to a phantom `/style` endpoint)

### User keypair onboarding + NIP-49 at-rest wrapper
The existing `AuthDialog.tsx` supports NIP-07, NIP-46 bunker URIs, nsec paste, and fresh-key signup. Adapt — don't rebuild.

- [ ] Audit `AuthDialog.tsx` for any "operator"-era language; rename to "user" for §3 consistency.
- [ ] Add a copy line at signup: "Stronger custody available — install Amber (Android) or nsec.app and connect via 'Bunker URI' instead." Links to NIP-46.

**NIP-49 at-rest layer (new, only for the fresh-Phoenix-generated path):**
- [ ] `src/lib/nip49Storage.ts` — wraps the user nsec in NIP-49 ncryptsec at log_n=18 before writing to localStorage. Helpers:
  - `encryptAndStore(nsecBytes, passphrase) -> ncryptsec` (writes `phoenix:user:ncryptsec`)
  - `loadEncrypted() -> ncryptsec | null`
  - `unlock(passphrase) -> nsecBytes` (called on first user-signer action of the session)
  - `clear()` (logout)
  - Heavy work in a WebWorker if main-thread benchmark says ≥150ms.
- [ ] `src/lib/userSigner.ts` — proxy signer that holds the unlocked nsec in memory (closure, not state) and forwards `signEvent` / `nip44.encrypt` / `nip44.decrypt`. Implements `NLogin`'s signer interface so the rest of Nostrify is unchanged.
- [ ] Hook into the signup flow: after `generateSecretKey()`, prompt for a passphrase (with strength meter; min 12 chars), encrypt+store, then `login()` with the proxy signer.
- [ ] Hook into page-load: if `phoenix:user:ncryptsec` is present, present the unlock screen on first signer use (wrap routes in an `<UnlockGate>` that defers any user-signer action until unlocked). Once-per-session — don't re-prompt while the tab is alive.
- [ ] Settings → Danger Zone: "Change passphrase" (decrypt → re-encrypt with new passphrase), "Forget device" (clear ncryptsec from this browser; backup must exist elsewhere).
- [ ] Document this code path explicitly does NOT defend against XSS, only against passive disk reads / browser extensions / shared devices. Comment in `nip49Storage.ts`.

**BYO users untouched:** NIP-07, NIP-46, nsec paste flows go straight to Nostrify's existing `login.*` actions. No NIP-49 layer (their key custody is whatever signer they brought).

### Persona keypair generation
- [ ] `personaKey.ts:generatePersonaKeypair` already correct — fresh nsec, never written to disk, returned to caller
- [ ] Add an in-session `personaSession` map in `useCurrentUser` or a sibling hook so the active persona's nsec is available to the composer without re-decrypting kind 30078 on every publish

### Multi-persona switcher
- [ ] Reuse `useLoggedInAccounts` for the user-account switcher (already works)
- [ ] Build a *separate* persona-switcher dropdown in the dashboard header — it's a different list (the user's personas), not the existing nostrify accounts. Sourced from `useMyPersonas()`.

### Page shells
Build the navigation skeleton; data wiring lands in Phase 2.
- [ ] `Onboard.tsx` rewrite: wizard stage layout + progress indicator + nav state machine + `pi-web-ui` chat shell placeholder (Jim provides the agent loop in Phase 2)
- [ ] `Dashboard.tsx` shell: composer textarea, preview pane, publish button, wallet badge (badge calls `useWallet()` from Jim)
- [ ] `PersonaFeed.tsx` shell: profile header, post list (mock data), zap-receipt placeholder
- [ ] `Settings.tsx` shell: per-task model picker (UI only, data not wired)
- [ ] `MyPersonas.tsx` shell: list, switch, "create new persona" CTA → `Onboard`
- [ ] `Verify.tsx` shell: pubkey, signature provenance row, post count placeholder

---

## Phase 2 — Real integration (Hours 8–18)

### Wizard end-to-end (the headline V1 flow)
The wizard runs Jim's agent. I host the chat surface, intercept tool calls that need user confirmation, and publish events on `finalize_persona`.

- [ ] Wire `pi-web-ui` chat surface inside `CharacterCreator.tsx`
- [ ] Tool-call interception: render proposal cards for `propose_name`, `propose_bio`, `propose_system_prompt` with edit/approve/regenerate buttons before the agent continues
- [ ] `generate_profile_image(prompt)` → call Jim's PPQ image hook → upload result to Blossom via `useUploadFile` → return `{url, sha256}` to the agent and stash as `reference_image_url`
- [ ] `generate_voice_sample(text, voice_id)` → call Jim's PPQ TTS hook → upload to Blossom → return URL → stash as `voice_sample_url`
- [ ] `finalize_persona()`:
  1. Call `useCreatePersona` (generates persona keypair, builds §5.2 envelope, encrypts to user, publishes kind 30078)
  2. Sign and publish kind 0 from the persona keypair (with `phoenix.voice_sample` and `phoenix.reference_image` extensions per §5.1)
  3. Pre-fund the persona wallet via Jim's `useWallet().mint(seed)` — Jim's seam, my call site
  4. Navigate to `Dashboard` with the new persona active
- [ ] Loading + error states for each stage; allow "go back" without losing the agent transcript

### Composer wired to PPQ styling
- [ ] On publish: `useStyle()` (Jim's hook) → returns styled text → `buildPersonaPostTemplate` → `usePersonaPublish` with the active persona's nsec
- [ ] Inline post-image generation in compose flow with a "regenerate" button; always pass `reference_image_url` to Jim's PPQ image hook
- [ ] Show estimated sats cost before commit (Jim provides the estimator)
- [ ] Disable the publish button when `useWallet().canAfford()` returns false; sticky banner with "Top up" sheet

### kind 1 publish
- [ ] Tags from `personaPost.ts` only: `t:<region-slug>`, `t:<cause-slug>`, optional `t:<extra-topic>`, `r:<source-url>` per source, plus NIP-92 `imeta` tags for any attached images. **No `client:phoenix`, no `t:phoenix`, no persona name in `alt:`.**
- [ ] **Do NOT route persona posts through `useNostrPublish`** — it auto-injects a `client` tag we deliberately want to omit. Persona posts go through `usePersonaPublish` (already correct).
- [ ] If we want a generic `alt:` for accessibility, derive it from the post content (first 100 chars), not from persona metadata.

### PersonaFeed reads real events
- [ ] `usePersonaPosts(npub)` already correct shape; verify it picks up posts within seconds of publish on the relay set we're using
- [ ] Render `imeta` images with NIP-92 helpers (load `note-content` skill if I need the renderer)
- [ ] Zap-receipt strip: query `{kinds:[9735], '#p':[persona_pubkey], limit:50}`, decode bolt11 amount, render with sender attribution where available

### Verify page
- [ ] Display: persona npub, kind 0 signature checked, kind 30078 backup exists (count), post count, latest post timestamp
- [ ] All client-side verification — no trust assumptions on a server

### Persona event load on dashboard mount
- [ ] On dashboard mount, if no active persona, redirect to `MyPersonas`
- [ ] On persona-switcher selection, call `usePersona(npub)` → unlock envelope → set in-session active persona → invalidate dashboard queries

### Relay set
- [ ] Finalize 7–10 relays in `AppContext` defaults: `wss://relay.damus.io`, `wss://relay.primal.net`, `wss://relay.ditto.pub`, `wss://nos.lol`, `wss://relay.nostr.band`, `wss://nostr.wine`, plus 1–2 regional. Confirm all return our test kind 30078 + kind 1 events from the spike.

---

## Phase 3 — Polish (Hours 18–26)

### Settings page wired
- [ ] `useQuery` PPQ `/v1/models` (Jim's hook); render per-task pickers (agent, image, tts, video)
- [ ] Persist selections by republishing the kind 30078 event with updated `model_prefs` — addressable replace handles the rest
- [ ] Confirm the dashboard composer + image gen + TTS pull from `model_prefs`, with task-default fallback

### MyPersonas polish
- [ ] Card per persona: profile pic, name, post count, wallet balance, last-active timestamp
- [ ] Swipe / dropdown switch to make the persona active
- [ ] "Create new persona" CTA prominent

### Public PersonaFeed polish
- [ ] Profile header with `picture`, `display_name`, `about`, `phoenix.voice_sample` audio control
- [ ] Donate button: opens sheet with QR for Lightning Address + LNURL string + "Zap with Nostr" button (NIP-57 zap-request flow)
- [ ] Inline zap receipts per post

### Download-backup flow
- [ ] In the wizard's final step (and from Settings → Danger Zone): generate a fresh NIP-49 ncryptsec from the user's nsec (separate passphrase from the at-rest one — user's choice; recommend distinct), trigger file download (`.ncryptsec`).
- [ ] Reciprocal import path: in `AuthDialog`, accept `.ncryptsec` files and prompt for the export passphrase. After import, prompt for the at-rest passphrase to re-wrap for this device.
- [ ] Reuses the same `nip49Storage.ts` helpers from Phase 1 — no new crypto.

### Imigongo polish
- [ ] Coordinate with Anaïse on the locked palette/pattern/type pairing
- [ ] Apply tokens via Tailwind theme + CSS variables (load `theming` skill)
- [ ] `ImigongoBand.tsx` already exists — verify it's on-brand
- [ ] Splash + 404 + empty-state polish

### PWA
- [ ] `vite-plugin-pwa` — manifest with Imigongo-themed 192/512/maskable icons
- [ ] Service worker: cache app shell, last-fetched feed, profile assets. Offline shell falls back to "you're offline; recent posts shown below."
- [ ] Install prompt fires after first successful post (not on first load — too aggressive)

### Mobile QA
- [ ] iPhone Safari + Android Chrome at 360px / 414px / 768px
- [ ] Wizard flow works one-handed
- [ ] Donate-button QR is scannable from across a stage (this is demo-critical)

---

## Phase 5 — Demo prep (my pieces, Hours 30–34)

- [ ] **Kill-and-resurrect staging.** Pre-test on a second device: log in with the user nsec, watch persona list re-hydrate, publish a post from Device B while Device A is offline.
- [ ] Persona nsec backups exported to multiple devices in case of laptop death (NIP-49 ncryptsec flow exercised)
- [ ] Pre-load demo browser tabs, sign-ins tested on demo laptop
- [ ] PWA install demonstrated on Anaïse's phone

---

## Definition of Done — Derek's slice

- [ ] Wizard end-to-end runs on a fresh device, generates persona, publishes kind 30078 + kind 0
- [ ] Dashboard composer publishes kind 1 with attribution tags + persona signature; appears on PersonaFeed within seconds
- [ ] PersonaFeed renders real events including images and zap receipts
- [ ] MyPersonas lists every persona for the user; switching swaps the active persona's signer in the composer
- [ ] Verify page passes for a freshly-created persona
- [ ] Settings page persists model overrides into kind 30078; dashboard picks them up
- [ ] Download-backup produces a valid NIP-49 ncryptsec; import recovers
- [ ] PWA installs on Android; service worker survives a kill-and-relaunch
- [ ] Kill-and-resurrect demo path works without intervention

---

## Review

_Filled in post-demo._
