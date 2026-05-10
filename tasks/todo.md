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
- [x] PPQ from a TS client paid in sats — chat via credits + bearer + NWC auto-topup (in flight: commits `96c0f98`, `b7b45d4`, `d06adeb`); image via L402 per-request (verified 2026-05-09 — chat is NOT L402-supported on PPQ; TTS deferred to V2)
- [ ] Document payment flow, model availability, costs, latency in `docs/spike-ppq.md`
- [ ] Pre-fund demo wallet seed (~50 chats via credits + ~10 image gens via L402 + live-zap cushion) → `docs/demo-funding.md` (gitignored)
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
- [ ] ~~`/dev/voice-gen` (B4)~~ — **deferred to V2.** No L402-compatible TTS provider; we don't want to grow the credits surface for it. `model_prefs.tts` remains optional/null for V2; the `voice_id` / `voice_sample_url` persona fields were removed in V1 and would be re-added additively if a provider lands.
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

**Owns:** `/dev/persona-crypto`, `/dev/operator`, `/dev/publish`, `/dev/feed` (specs in `dev/STREAMS.md` §C1–C4)
**Leads:** `/dev/persona-create`, `/dev/persona-restore` (composite, §C5–C6)

### Phase 0 — Spike (3h)
- [ ] Spike — Nostr crypto (NIP-44 self / NIP-49 / kind 30078) — ~1h
- [x] Spike — Breez Spark SDK in browser (variant choice, init, invoice, pay) — landed via Jim's PR #2 (headless wallet shipped to `src/lib/wallet/`)
- [x] Nostr crypto spike documented in `docs/spike-nostr.md`

### Phase 1 — Independent harnesses (12h)
- [ ] **`/dev/persona-crypto`** (C1, ~3h) — adapt existing `src/lib/persona*` to PROJECT.md §5.2 schema; full round-trip
- [ ] **`/dev/operator`** (C2, ~3h) — fresh keypair / NIP-07 / NIP-46 / paste; NIP-49 backup/restore
- [ ] **`/dev/publish`** (C3, ~3h) — kind 1 publish with full attribution tags
- [ ] **`/dev/feed`** (C4, ~3h) — render persona profile + posts + zap receipts from a pubkey

### Phase 2 — Composite harnesses (8h)
- [ ] **`/dev/persona-create`** (C5, ~5h) — full wizard composing wallet + persona-crypto + image-gen (agent and voice-gen are V2; V1 wizard is form-based)
- [ ] **`/dev/persona-restore`** (C6, ~3h) — operator login → load all kind 30078 → present persona list

### Phase 3 — Main UI integration (5h)
- [ ] `Onboard.tsx` ← `<CharacterCreator>` from C5
- [ ] `MyPersonas.tsx` ← `<PersonaList>` from C6
- [ ] `PersonaFeed.tsx` ← `<PersonaProfileHeader>` + `<PersonaPostList>` + `<ZapReceiptCard>` (C4 + B5)
- [ ] `Verify.tsx` rebuilt against the §5 schema
- [ ] PWA polish: install prompt, service worker, manifest icons (if time)

### Phase 4 — Demo prep (1h)
- [ ] Kill-and-resurrect rehearsal: device A logs in, posts; device B picks up via nsec restore
- [ ] Persona nsec backups on multiple devices

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
