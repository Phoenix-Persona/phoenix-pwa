# Derek's Plan — Zuka (formerly Feniksi, originally Phoenix Persona)

> Brand history: Phoenix → Feniksi (PR #3) → Zuka (current PR). Each
> rebrand is user-visible only; the on-wire NIP-78 discriminator
> stays `phoenix-persona` forever for protocol compatibility.

**Role:** Frontend + Nostr + PWA (PROJECT.md §12).
**Source of truth:** [`dev/PROJECT.md`](../dev/PROJECT.md). When this plan and PROJECT.md disagree, **PROJECT.md wins**.

> **Coordination rule.** Other devs (Anaïse, Jim, Topher) are working in parallel. To avoid merge conflicts, I touch only the files claimed below in "Files I own". Anything cross-cutting (`PROJECT.md`, `tasks/todo.md`, `App.tsx`, `AppRouter.tsx`, `package.json`) gets a heads-up in chat before I touch it.

---

## Status (as of PR #5 merge — `59eacb8`)

**Shipped — Derek-owned V1 slice complete + V1.5 polish:**

- Persona schema + crypto + scan-and-decrypt cache (PR #1)
- NIP-49 at-rest layer + UnlockGate (PR #1)
- Persona Edit + Delete (NIP-09 tombstone) (PR #3)
- Two-step onboard wizard with profile picture upload / PPQ generate (PR #3)
- Stable `persona.dTag` in encrypted plaintext (PR #3)
- Settings page: Account (Lock / Forget / Change passphrase / Download backup) + Relays (NIP-65 manager) + Personas (PR #3)
- AuthDialog NIP-49 import — kill-and-resurrect ready (PR #3)
- Verify page with real client-side signature checks (PR #3)
- Phoenix → Feniksi rebrand (PR #3); Feniksi → Zuka rebrand (PR #5)
- Modern Rwandan flag accents (sky / gold / green) (PR #3)
- NostrSync resets relay/Blossom on user change + invalidates persona caches (PR #3)
- Spike C Part 1 deliverable — `docs/spike-nostr.md` (PR #1)
- PWA install prompt + manifest + relay-set expansion to 7 (PR #4)
- NIP-92 imeta image rendering on PostCard (PR #4)
- Settings → Media: BUD-03 Blossom server manager (PR #4)
- MyPersonas + Settings card stats (post count + last-active) (PR #5)
- NIP-92 imeta video rendering on PostCard (PR #5)
- Cross-post webhook scaffold (schema + `useCrossPost` hook + EditPersona UI) (PR #5)
- Composer reframe: video-first with text-only fallback (PR #5)

**Outstanding (Derek-owned, not blocked):**
- Real-device mobile QA pass — iPhone Safari + Android Chrome at 360 / 414 / 768 px (needs a phone)
- Live-relay verification runbook (5 min with Anaïse)
- Mobile NIP-49 latency measurement on Anaïse's phone
- Phase 5 demo prep: kill-and-resurrect rehearsal, persona nsec backups multi-device, demo-laptop sign-in tests
- Optional: Dashboard "no persona resolves" → redirect to `/my-personas` instead of empty state
- Optional: `extractImetaVideos` unit test coverage
- Optional refactor (defer to V2): extract `useCreatePersona` hook

**Outstanding (waiting on others — not Derek's lane):**
- Compose AI styling (Jim — PPQ `useStyle` hook)
- Video generation pipeline end-to-end: prompt build + `usePpqVideo` call + Blossom mirror + imeta on publish (Jim — owns the wiring)
- Inline post-image generation in compose (Jim)
- Wallet UI: balance / receive / send / tx history (Jim)
- `mintPersonaWallet` seam in Onboard publish flow (Jim)
- Settings → per-task model picker reading PPQ `/v1/models` (Jim)
- **Cross-post advanced paths — Twitter/X PKCE direct, Meta/TikTok/YouTube OAuth (Jim)**
- Voice sample generation in wizard (Topher)
- Donate button on PersonaFeed + zap receipt rendering (Topher)
- Imigongo palette / pattern / type pairing sign-off (Anaïse)
- Real PWA icon artwork (Anaïse)

**V2 (deferred per PROJECT.md §6, §8):**
- Agent-driven character creator (`pi-agent-core` interview)
- Multi-operator-per-device

---

## Capacitor Android wrapper (planned — not yet started)

> Plan locked, awaiting return-to-branch. `appId` decision: **`live.zuka.app`** (reverse-DNS of `zuka.live`). Locked once published — don't change after first store submission.

Wraps the existing PWA in a Capacitor WebView for Android (and iOS later) without touching React. The skill in `.agents/skills/capacitor/` provides the templates; ditto's setup at `~/Projects/ditto/` is a working production reference.

### Phase 1 — Scaffold

- Install Capacitor 8.x deps (matches ditto): `@capacitor/core`, `@capacitor/app`, `@capacitor/filesystem`, `@capacitor/haptics`, `@capacitor/keyboard`, `@capacitor/share`, `@capacitor/local-notifications`, `capacitor-secure-storage-plugin`, plus dev deps `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `tailwindcss-safe-area`
- `capacitor.config.ts` at project root with `appId: "live.zuka.app"`, `appName: "Zuka"`, `backgroundColor: "#1a0f08"` (charcoal hero-mat), `scheme: "Zuka"`, `SystemBars.insetsHandling: "css"` (Android Chromium <140 fallback)
- Copy from `.agents/skills/capacitor/files/`:
  - `lib/haptics.ts`, `lib/downloadFile.ts`, `lib/secureStorage.ts`, `lib/nativeBootstrap.ts`
  - `hooks/useSecureLocalStorage.ts`
  - `components/DeepLinkHandler.tsx`
  - `safe-area-shim.css` (only if WebView <140 testing surfaces issues)
- Wire `bootstrapNative()` at top of `main.tsx` (before React mounts)
- Mount `<DeepLinkHandler />` inside `<BrowserRouter>` (in `AppRouter.tsx`)
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">` in `index.html`
- Add `@import "tailwindcss-safe-area";` to `src/index.css`
- `npx cap add android` — generates `android/` directory; commit it
- Verify `npm test` passes + `npx cap sync` runs clean

### Phase 2 — Zuka-specific native integration

- **Migrate `nip49Storage.ts` ncryptsec to OS Keychain/KeyStore.** Currently lives in localStorage as `zuka:user:ncryptsec`. On native, swap to `secureStorage.setItem`/`getItem`. Provide a one-shot migration: on boot, if localStorage has the key but secureStorage doesn't, copy across then clear localStorage.
- **Migrate `DownloadBackupDialog` `<a download>` → `downloadTextFile()`.** Writes the `.ncryptsec` to the app Documents directory on native; falls back to anchor-click on web.
- **Haptics** on publish (`impactLight`), Lock now (`notificationWarning`), persona switch (`selectionStart`), wallet receive/send confirmations (`notificationSuccess`).
- **Hide PWA install prompt natively.** `<InstallBanner />` should early-return when `Capacitor.isNativePlatform()` is true — we're already a native app.
- **Hide "Install Zuka" UX from native builds.** Same logic.
- **App icons + splash screen** from existing brand assets — favicon SVG + Imigongo seal as base.
- **Status-bar icon style** is auto-synced by `bootstrapNative()` (light/dark text based on theme).

### Phase 3 — Verification before ship

- **SharedArrayBuffer / Spark SDK in Capacitor WebView.** The COEP=credentialless we set in `vite.config.ts` is for the Vite dev server. Production-built static files don't carry headers — Capacitor WebView serves locally and won't get them. Need to either:
  - Configure WebView via `android/app/src/main/AndroidManifest.xml` to set the relevant headers
  - Or use Capacitor's HTTP plugin to inject headers
  - Or accept that wallet won't work in WebView and degrade gracefully (wallet UI shows "wallet unavailable on this device — use the web version")
  - Test on a real Android device to determine which path applies.
- **Cross-origin Blossom images.** Same headers concern. Likely worse on native than web because there's no service worker layer to massage requests. May need `crossOrigin="anonymous"` everywhere AND server-side CORS, OR proxy media through a known-good origin.
- **End-to-end kill-and-resurrect on a real Android device.** Sign up, mint persona, force-stop the app via Android system, reopen, verify ncryptsec → unlock → personas hydrate → wallet reconnects.
- **`.apk` build for distribution.** Initial signed APK for sideload-testing. Production AAB for Play Store later.

### Risks / open questions

- **Spark SDK WASM threading** — biggest unknown. The SDK requires `crossOriginIsolated`, which requires the COEP/COOP headers. WebView serves files locally, no HTTP layer to set headers on. Will need experimentation.
- **Background tasks** — Spark wallet should keep running in the background to receive zaps. Capacitor's `BackgroundTask` plugin provides ~30 seconds of background time per event; not enough for a persistent wallet. Hosted-key zap-receive might be the answer.
- **Push notifications for zaps** — needs Topher's NIP-57 zap-receipt detection + a server to push notifications (FCM). Out of scope for Phase 1.
- **iOS port** — Phase 1 should add iOS too (`npx cap add ios`) but the Spark/SharedArrayBuffer story is even more uncertain on iOS WKWebView.

---

## Cross-post + video composer (V1.5 — JIM owns ongoing; Derek did the scaffold)

> **Ownership note (post PR #5):** the architectural plan, the
> webhook scaffold (`cross_post` schema, `useCrossPost` hook,
> EditPersona UI, Dashboard wiring), and the composer brief-shape
> reframe shipped in PR #5 as the V1.5 starting point. **Jim is
> picking up the rest of the cross-post + video pipeline from here**
> — direct OAuth paths (Twitter/X PKCE, Meta), the
> `usePpqVideo` → Blossom → imeta wiring, and the empty-wallet UX
> on the composer. Derek's lane now is read-only on this section
> (touch only on Jim's request).

**Why this exists.** The product positioning is shifting: AI personas
publish primarily as *short-form video* and the value prop is
"one brief → one persona-signed video published everywhere at once."
The marketing surfaces (homepage SpeakVisual, HowItWorks Chapter 02
body copy) are updated to reflect this. The implementation lands in
phases.

### The composer pivot (Derek + Jim seam)

The current Dashboard composer is text-only. The new composer takes:

- **Idea** — short prompt describing the post
- **Sources** — list of URLs to ground the message
- **Style hints** — free-form tags (`measured`, `first-person`,
  `cite sources`, `vertical 9:16`, etc.)

Multi-step preview: text caption draft → video preview → platform
selection → publish. Cost estimator surfaces the total bill (text
styling + video gen + cross-post API calls). Empty-wallet UX gates.

### Video generation (Topher / Jim seam)

PPQ exposes Veo 3, Kling, Runway via `pi-ai`. The wiring already
exists (`src/hooks/usePpqVideo.ts`); the composer just needs to call
it. Output: PPQ URL → fetch → re-upload to Blossom → reference
Blossom URL via NIP-92 imeta on the kind 1 publish.

Cost concern: Veo 3 is $0.50–$2 per generation. Demo budget needs to
fund this (Topher's `docs/spike-ppq.md` should track this; my own
demo persona pre-fund needs ~10–15 video gens).

### Blossom video upload

Pattern matches the existing PersonaPictureField (PPQ → fetch → re-
upload). Two extensions needed:

- **Pick a Blossom server that accepts video/mp4 + reasonable size
  limits** (5–50 MB typical). The current default set may need
  curation.
- **Extend `PostCard` imeta render** to handle videos (currently
  images-only — `extractImetaImages()` rejects video MIME types). A
  parallel `extractImetaVideos()` + `<video>` element with poster,
  controls, lazy loading.

### Cross-posting via OAuth — the architectural decision

OAuth flows for Twitter/X/Facebook/Instagram all require a
`client_secret` on the token-exchange step that **cannot live in a
browser PWA**. This collides with PROJECT.md §4's "no Phoenix-owned
backend" principle.

**Four paths considered:**

| Path | What | Cost |
|---|---|---|
| (a) Phoenix backend | Stand up an OAuth proxy service | Breaks PROJECT.md §4. Single point of failure that contradicts the entire pitch ("the voice doesn't depend on us"). **Rejected.** |
| (b) Twitter PKCE only | OAuth 2.0 PKCE with no secret. Twitter v2 supports it. | Twitter-only. Per-user rate limits painful. ✅ for V1.5 power-user path. |
| (c) BYO tokens in encrypted backup | User authenticates on platform's mobile/desktop app, pastes refresh tokens into Zuka. Tokens stored in `cross_post_tokens` field of the kind 30078 plaintext. Browser uses tokens directly to publish. | Privacy-preserving, no backend. UX brutal — token expiry, refresh per platform. Long tail. |
| (d) Webhook to a third-party aggregator | User signs up at Buffer / Hootsuite / Zapier / Make.com, creates a webhook for cross-posting, pastes the webhook URL into Zuka. On publish, Zuka POSTs to the webhook with the post payload. Aggregator handles cross-posting. | **No backend. No tokens stored. User owns the aggregator account.** Cleanest no-backend path. ✅ **Recommended for V1.5 default.** |

**Recommended cross-post architecture:**

- **V1.5 default:** option (d). User pastes a webhook URL in Settings
  → Cross-posting. Each persona has its own webhook (or shared per
  user). On publish, Zuka POSTs `{caption, video_url, platforms[]}`
  to the webhook. Aggregator does the platform fan-out.
- **V1.5 power-user path:** option (b). For users who want a more
  direct route, Twitter PKCE OAuth flow lets them post to X without
  a third-party aggregator. PKCE flow runs entirely in the browser.
  Refresh token stored in `cross_post_tokens.x` inside the kind 30078
  plaintext.
- **V2:** Meta (Facebook + Instagram) + TikTok + YouTube. Requires the
  no-backend principle to be revisited at the team level OR a
  user-signed proxy pattern (NIP-46-style "borrow my tokens").

### Schema additions

Encrypted persona payload (`persona.ts`) gains:

```ts
cross_post: {
  // Webhook (option d) — the cleanest path
  webhook_url?: string;       // POSTed on publish
  webhook_platforms?: string[]; // labels: "twitter", "facebook", "instagram"
  // Direct PKCE tokens (option b) — power-user only
  x_refresh_token?: string;
  // Future: facebook, instagram, tiktok, youtube
}
```

`useCrossPost` hook on the composer dispatches to whichever paths are
configured for the active persona. Failures per platform are
non-fatal (the Nostr publish has already succeeded by then).

### Roadmap entry

| Item | Phase | Owner | Status |
|---|---|---|---|
| Marketing copy + homepage SpeakVisual showing video + cross-post | done | Derek | ✅ PR #4 |
| Composer brief-shape UI (idea + sources + hints) | done | Derek | ✅ PR #5 |
| `extractImetaImages` + `<img>` grid render in PostCard | done | Derek | ✅ PR #4 |
| `extractImetaVideos` + `<video>` element in PostCard | done | Derek | ✅ PR #5 |
| Cross-post webhook (option d) — schema + `useCrossPost` hook + EditPersona UI + Dashboard dispatch | done | Derek | ✅ PR #5 |
| Composer reframe: video-first with text-only fallback | done | Derek | ✅ PR #5 |
| `usePpqVideo` → Blossom → imeta on publish (the actual video gen pipeline) | V1.5 | **Jim** | — |
| Blossom video size-aware server selection | V1.5 | **Jim** | — |
| Twitter/X PKCE direct (option b) | V1.5 | **Jim** | — |
| Meta / TikTok / YouTube full OAuth | V3 — needs backend decision first | **Jim / TBD** | — |

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
- [x] Render `imeta` images on posts (PR #4 — `extractImetaImages` + responsive grid)
- [x] Render `imeta` videos on posts (PR #5 — `extractImetaVideos` + `<video controls>`)
- [ ] Zap-receipt strip: query kind 9735, decode bolt11, render — Topher seam mostly

### Verify page — ✅ shipped (PR #3)
- [x] Persona npub, kind 0 signature client-side check, post count, profile + first/latest timestamps
- [x] AI-disclosure badge from kind 0 `bot: true`
- [x] All checks happen in the browser; no server trust

### Persona event load on dashboard mount
- [x] `usePersona(npub)` per-mount works correctly
- [ ] Optional: if no persona resolves, redirect to `/my-personas` instead of showing the empty state

### Relay set
- [x] Finalize 7+ relays in `AppContext` defaults (PR #4 — currently 7: damus, primal, nos.lol, ditto, nostr.band, nostr.wine, nostr.bg).

---

## Phase 3 — Polish — partially complete

### Settings page wired — Jim seam
- [x] Settings page shell with Account + Relays + Personas (PR #3)
- [ ] Models section: per-task pickers reading PPQ `/v1/models`, persists into `model_prefs` via kind 30078 republish — Jim seam

### MyPersonas polish — partial
- [x] Profile-picture avatar on each card (PR #3 follow-up)
- [x] 3-dot Edit/Delete menu with confirm dialog (PR #3)
- [x] "New persona" CTA prominent in cover band
- [x] Post count per card (PR #5 — `usePersonaActivityStats` batched query + `<PersonaStatsBadge>`)
- [x] Last-active timestamp per card (PR #5 — same)
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

### Brand history — Phoenix → Feniksi → Zuka (✅ shipped across PRs #3 and the current PR)

**On-wire policy (locked):** the NIP-78 payload discriminator stays
`phoenix-persona` regardless of brand changes. Rebrands shouldn't
break parser compatibility — they're a UI concern, not a protocol
concern. The `PHOENIX_PAYLOAD_APP` constant is a private wire-format
detail; the function name `encryptPhoenixEnvelope` is similarly an
internal API identifier.

**What changes per rebrand:** user-visible strings (`useSeoMeta`
titles, AppHeader wordmark, hero/footer copy, dialog copy, toast
copy), `package.json` `name`, `index.html` titles, PWA manifest
name/short_name, app cache name, localStorage keys (e.g.
`zuka:user:ncryptsec`).

**What stays:** all on-wire identifiers, the `phoenix-persona`
discriminator, the GitHub repo URL (`Phoenix-Persona/phoenix-pwa`),
internal function/type names that reference the protocol concept.

### PWA — current branch (`derek/phase-3-polish`)
- [x] `vite-plugin-pwa` manifest with 192 / 512 / maskable icons (PR #4 — placeholder Imigongo glyph; final artwork pending Anaïse)
- [x] Service worker shell-caching via Workbox runtime (PR #4 — `feniksi-shell` → renamed `zuka-shell`)
- [x] Install prompt — fires once the browser fires `beforeinstallprompt`, gated on signed-in user, dismissible for 30 days (PR #4)
- [ ] App shortcuts manifest entry for "New persona" / "My personas"
- [ ] Offline-mode messaging in service worker fallback

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
