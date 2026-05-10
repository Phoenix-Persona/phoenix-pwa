# Phoenix Persona — Hackathon Build Plan

**Project:** Phoenix Persona — Anonymity-preserving AI personas, sustained by Lightning donations
**Event:** HRF AI Hack for Freedom
**Timeline:** 36 hours
**Team:** Anaïse (Captain + Product), Derek (Frontend + Nostr + PWA), Jim (PPQ + Wallet + Payments), Topher (Agent + LLM Consumers + Donations)

> The authoritative design is [`PROJECT.md`](../dev/PROJECT.md). The parallel-work coordination doc is [`STREAMS.md`](../dev/STREAMS.md). When the plan and this file disagree, **PROJECT.md wins** — update this file to match.

---

## Locked decisions (carried in from PROJECT.md and STREAMS.md)

- Two-level user/persona identity; user signs encrypted kind 30078 with a random per-publish d-tag and no app-specific tags (discovery is scan-and-decrypt for stronger anti-fingerprinting)
- Per-persona Breez Spark Lightning wallet (`@breeztech/breez-sdk-spark`); seed inside the encrypted backup
- AI inference via PPQ exclusively, paid in sats; agent harness via `pi-mono`
- All persistent code lives in main app paths (`src/lib/<feature>`, `src/components/<feature>`); demo surfaces are `/dev/<feature>` routes
- Compartmentalize first, integrate later — see `dev/STREAMS.md` for the harness inventory
- **Stream A (Jim) owns the wallet → PPQ end-to-end demo** — PPQ + Wallet + Payments + Settings together, single owner so the seam can be debugged in one head

---

## Phase guideposts

| Phase | Hours | What |
|-------|-------|------|
| 0 — Spikes | 0–4 | PPQ, pi-mono, Nostr+Spark decisions made |
| 1 — Independent harnesses | 4–20 | 13 `/dev/*` routes demoable in isolation |
| 2 — Composite harnesses | 20–28 | persona-create + persona-restore |
| 3 — Main UI integration | 28–34 | Onboard, Dashboard, MyPersonas, PersonaFeed, Verify wired |
| 4 — Demo prep | 34–36 | Practice runs, fixes, ship it |

---

## Cross-cutting kickoff (Hours 0–1)

- [ ] **(All)** Read PROJECT.md and STREAMS.md end-to-end
- [ ] **(All)** Confirm role split, schedule, sleep windows, demo slot time
- [ ] **(All)** Lock the persona event schema (PROJECT.md §5) — final field list before anyone writes code
- [ ] **(All)** Lock the wizard agent tool set (PROJECT.md §6) — final tool names and signatures
- [ ] **(All)** Pick default models for each task from PPQ's `/v1/models` (PROJECT.md §6)
- [ ] **(All)** Demo arc agreed: cold open → build live → fund and post → donation moment → kill-and-resurrect → vision

Sync at ~hour +1 — kick streams off in parallel.

---

## Stream A — Jim (PPQ + Wallet + Payments)

**Owns:** `/dev/ppq`, `/dev/wallet`, `/dev/ppq-pay`, `/dev/settings` (specs in `dev/STREAMS.md` §A1–A4)

The wallet → PPQ end-to-end demo lives entirely in this stream.

### Phase 0 — Spike (3h, partly already shipped)
- [ ] PPQ from a TS client (chat, image, TTS) paid in sats (in flight: commits `96c0f98`, `b7b45d4`, `d06adeb`)
- [ ] Document payment flow, model availability, costs, latency in `docs/spike-ppq.md`
- [ ] Pre-fund demo wallet seed (~50 chats / 10 images / 5 TTS / live-zap cushion) → `docs/demo-funding.md`
- [x] Wallet SDK locked to Breez Spark (`@breeztech/breez-sdk-spark`) — see commit `287c091`; no separate decision doc needed

### Phase 1 — Independent harnesses (~10h)
- [ ] **`/dev/ppq`** (A1, ~1h) — formalize spike code into a `pi-ai` PPQ client + harness page
- [ ] **`/dev/wallet`** (A2, ~4h) — Breez Spark SDK init, balance, invoice, send/receive, tx history (headless code already in `src/lib/wallet/` per PR #2 — wire into `/dev/wallet` route)
- [ ] **`/dev/ppq-pay`** (A3, ~3h) — wallet pays a PPQ request end-to-end
- [ ] **`/dev/settings`** (A4, ~2h) — model picker reading PPQ `/v1/models`, persists to encrypted backup

### Phase 2 — Composite contributions (3h)
- [ ] Wire `mintPersonaWallet` into Derek's `/dev/persona-create`
- [ ] Confirm every AI-gated flow in Topher's stream routes through `ppq-pay` (no naked PPQ calls anywhere)
- [ ] Empty-wallet UX (sticky banner + disabled buttons) wired into Dashboard

### Phase 3 — Main UI integration (4h)
- [ ] Wallet page (uses `WalletPanel` from harness)
- [ ] Settings page (already built as harness; just routed)
- [ ] Wallet badge in Dashboard with empty-wallet sticky banner

### Phase 4 — Demo prep (2h)
- [ ] Pre-fund demo persona wallet; stash seed securely
- [ ] Live-zap dry run with Topher: QR on screen → external wallet → zap lands on feed within seconds
- [ ] Backup demo wallet seed on multiple devices

---

## Stream B — Topher (Agent + LLM Consumers + Donations)

**Owns:** `/dev/agent`, `/dev/styling`, `/dev/image-gen`, `/dev/voice-gen`, `/dev/zap` (specs in `dev/STREAMS.md` §B1–B5)

### Phase 0 — Spike (3h)
- [ ] Spike: pi-mono in a Vite/React PWA — install, agent loop, one tool
- [ ] Document bundle, tool-call shape, provider switching in `docs/spike-pi-mono.md`
- [ ] (Intra-stream — output feeds your own `/dev/agent`)

### Phase 0 — Parallel infrastructure decision (~1h)
- [ ] Decide LNURL-pay hosting strategy → `docs/lnurl-hosting.md` (your stream consumes via `/dev/zap`)

### Phase 1 — Independent harnesses (~13h, tight)
- [ ] **`/dev/agent`** (B1, ~3h) — `pi-agent-core` + `pi-web-ui` chat with one wizard tool
- [ ] **`/dev/styling`** (B2, ~2h) — system prompt + raw thought → styled output via PPQ
- [ ] **`/dev/image-gen`** (B3, ~3h) — `gpt-image-1` with reference-image input for likeness
- [ ] **`/dev/voice-gen`** (B4, ~2h) — TTS sample with voice picker
- [ ] **`/dev/zap`** (B5, ~3h) — LNURL/lud16 mechanics, donate button, zap receipt rendering

If pressed for time at hour +20, trim voice-gen to a hardcoded sample or push zap polish to Phase 3.

### Phase 2 — Composite contributions (4h)
- [ ] Wire `agent`, `image-gen`, `voice-gen` libs into Derek's `/dev/persona-create`
- [ ] Production wizard system prompt (multilingual: English + one second language)
- [ ] Output guards: kind-1 length norms, fallback message on PPQ failure

### Phase 3 — Main UI integration (4h)
- [ ] Wire `styling` into Dashboard composer
- [ ] Wire `image-gen` into Dashboard image button
- [ ] Voice rendering of published posts (V1.5 if time)
- [ ] Donate button on PersonaFeed

### Phase 4 — Demo prep (1h)
- [ ] Lock model defaults; verify prompt voices in 5 sample inputs each persona
- [ ] Verify zap UI during Jim's live-zap dry run
- [ ] Standby for live tweaks during practice run

---

## Stream C — Derek (Nostr + Frontend)

**Owns:** persona-crypto, user identity, publish, feed (originally specced as `/dev/*` harnesses in `dev/STREAMS.md` §C1–C4 — implemented directly as integrated UI; the harness step was bypassed in favor of shipping the real pages).
**Leads:** persona-create wizard, persona-restore (composite, §C5–C6).

### Phase 0 — Spike (3h)
- [x] Spike — Nostr crypto (NIP-44 self / NIP-49 / kind 30078) — `spikes/nostr-breeze/nostr/round-trip.test.ts`
- [x] Spike — Breez Spark SDK in browser (Jim's PR #2)
- [x] Nostr crypto spike documented in `docs/spike-nostr.md`
- [ ] Live-relay verification runbook (5 min with Anaïse — owed)
- [ ] Mobile NIP-49 latency on Anaïse's phone (owed; affects WebWorker decision)

### Phase 1 — Independent harnesses (skipped; built directly as integrated UI)
- [x] persona-crypto adapted to PROJECT.md §5.2 schema, full round-trip — `src/lib/persona*`, `src/hooks/usePersona*`
- [x] User identity: NIP-07 / NIP-46 / paste / fresh-Phoenix-NIP-49 — `AuthDialog.tsx` + `nip49Storage.ts` + `<UnlockGate>`
- [x] kind 1 publish with attribution tags — `personaPost.ts` + `usePersonaPublish`
- [x] Render persona profile + posts — `PersonaFeed.tsx` (zap receipts pending Topher's stream B5)

### Phase 2 — Composite (most of this is shipped as integrated UI; some parts depend on Jim/Topher)
- [x] persona-create flow — two-step Onboard wizard (Details → Picture → Mint) with PPQ image gen / Blossom upload
- [x] persona-restore flow — sign in fresh, scan-and-decrypt re-hydrates personas, NostrSync invalidates caches on user/relay change
- [ ] Wizard agent harness (`pi-agent-core` interview) — V2 per PROJECT.md §6, deferred
- [x] Composer brief shape (idea + sources + hints + cross-post indicator) — PR #5 (Derek shipped the scaffold; AI styling + video gen wiring is Jim's seam)
- [x] PostCard NIP-92 imeta image render — PR #4
- [x] PostCard NIP-92 imeta video render — PR #5
- [ ] Composer AI styling on publish — Jim seam (`useStyle` hook)
- [ ] Composer video generation pipeline (`usePpqVideo` → Blossom → imeta on kind 1) — **Jim** (took over from Derek post-PR #5)
- [ ] Inline post-image generation in compose — Jim seam
- [ ] Empty-wallet UX (sticky banner + disabled buttons) — Jim seam

### Phase 3 — Main UI integration
- [x] `Onboard.tsx` — two-step wizard with profile-picture step (PR #3)
- [x] `MyPersonas.tsx` — list with profile-picture avatars + 3-dot Edit/Delete menu + activity stats (PRs #3, #5)
- [x] `PersonaFeed.tsx` — public profile header + posts (zap receipts pending Topher)
- [x] `Verify.tsx` rebuilt — real client-side signature checks, post counts, profile timestamp (PR #3)
- [x] `Settings.tsx` — Account + Relays + Media (Blossom servers) + Personas (PRs #3, #4)
- [x] `EditPersona.tsx` — same-d-tag re-publish for name / bio / picture / system prompt / tags / languages / cross-post webhook (PRs #3, #5)
- [x] AuthDialog NIP-49 import — kill-and-resurrect inverse of download-backup (PR #3)
- [x] PWA install prompt + manifest + service worker (PR #4)
- [x] Persona Edit/Delete affordances: 3-dot card menu + inline dashboard buttons (PR #3)
- [x] Cross-post webhook scaffold (`cross_post` schema + `useCrossPost` hook + EditPersona UI + Dashboard dispatch) (PR #5)
- [x] Persona activity stats (post count + last-active) on every card (PR #5)
- [x] Composer reframe: video-first with text-only fallback (PR #5)
- [ ] Mobile QA: 360 / 414 / 768 px on iPhone Safari + Android Chrome (needs a real device)
- [ ] App shortcuts manifest entry for "New persona" / "My personas"

### Phase 4 — Demo prep
- [ ] Kill-and-resurrect rehearsal: Device A logs in, posts; Device B drops in `.ncryptsec` and resumes
- [ ] Persona nsec backups on multiple devices (exercises export/import round-trip)
- [ ] Live-relay verification runbook (5 min with Anaïse — `docs/spike-nostr.md`)
- [ ] Mobile NIP-49 latency measurement on Anaïse's phone
- [ ] PWA install demonstrated on Anaïse's phone
- [ ] Pre-load demo browser tabs + sign-ins on demo laptop

---

## Anaïse — product track (parallel)

### Phase 0–1 (kickoff + first build window)
- [ ] Persona system prompt template for the Rwanda hero persona
- [ ] 10 example raw thoughts ready for demo
- [ ] Demo opening script v1 (30 seconds, real names, real stakes)
- [ ] Imigongo moodboard, palette, type pairing locked

### Phase 1–2
- [ ] First persona created end-to-end through the wizard (Anaïse drives)
- [ ] First 5 real posts composed via the dashboard
- [ ] Sample post quality review with Topher

### Phase 3 — Polish content
- [ ] 5–10 seed posts for the demo feed
- [ ] Second persona stub (different region; npub + 3 posts + funded wallet)
- [ ] One-pager for judges drafted
- [ ] Demo deck slides drafted

### Phase 4 — Demo prep
- [ ] Slide deck final, 8–10 slides
- [ ] One-pager finalized + printed
- [ ] Cold open and vision close rehearsed

---

## Cross-stream sync points

- **+1h** — kickoff complete; streams begin
- **+4h** — end of Phase 0; spike notes committed; mini-sync
- **+12h** — mid-Phase-1 demo (each stream shows one harness)
- **+20h** — start of Phase 2; composite harnesses begin
- **+28h** — start of Phase 3 main UI integration
- **+30h** — practice run #1 (full demo); find breakages
- **+33h** — practice run #2 (timed)
- **+34h** — start of Phase 4 demo prep
- **+36h** — demo

---

## Definition of Done — V1

- [ ] User can complete the character-creator wizard end-to-end
- [ ] User can fund a persona's wallet via Lightning Address or invoice from any external wallet
- [ ] Dashboard accepts raw thought → AI styles → preview → publish kind 1 with attribution tags
- [ ] User can generate a post image with consistent likeness via reference image
- [ ] Posts appear on persona feed page within seconds, on a separate device
- [ ] Donations (NIP-57 zaps) land in the persona's wallet and are visible on the feed
- [ ] AI-gated features disable gracefully when wallet balance is insufficient
- [ ] Settings page lets the user pick a different model for any AI task
- [ ] Persona can be backed up (NIP-49 download) and restored on a fresh device from nsec + relays
- [ ] PWA installable on Android (Anaïse's phone)

## Definition of Done — Demo

- [ ] 5–7 minute demo runs cleanly on practice run #2
- [ ] Live persona creation on stage works end-to-end without intervention
- [ ] Live audience zap during the demo lands on the persona's feed visibly
- [ ] Kill-and-resurrect moment lands logistically
- [ ] Anaïse's opening 30 seconds is rehearsed and tight
- [ ] One-pager in judges' hands

---

## Review section

_To be filled in post-demo. Lessons captured to `tasks/lessons.md`._
