# Phoenix Persona — Hackathon Build Plan

**Project:** Phoenix Persona — Anonymity-preserving AI personas, sustained by Lightning donations
**Event:** HRF AI Hack for Freedom
**Timeline:** 36 hours
**Team:** Anaïse (Captain + Product), Derek (Frontend + Nostr + PWA), Jim (LLM + Agent), Topher (Wallet + Infra)

> The authoritative design is [`PROJECT.md`](../dev/PROJECT.md). The parallel-work coordination doc is [`dev/streams.md`](../dev/streams.md). When the plan and this file disagree, **PROJECT.md wins** — update this file to match.

---

## Locked decisions (carried in from PROJECT.md and streams.md)

- Two-level user/persona identity; user signs encrypted kind 30078 with `d=phoenix-persona:<pubkey>`, `t=phoenix-persona`
- Per-persona Breeze Lightning wallet; seed inside the encrypted backup
- AI inference via PPQ exclusively, paid in sats; agent harness via `pi-mono`
- All persistent code lives in main app paths (`src/lib/<feature>`, `src/components/<feature>`); demo surfaces are `/dev/<feature>` routes
- Compartmentalize first, integrate later — see `dev/streams.md` for the harness inventory

---

## Phase guideposts

| Phase | Hours | What |
|-------|-------|------|
| 0 — Spikes | 0–4 | PPQ, pi-mono, Nostr+Breeze decisions made |
| 1 — Independent harnesses | 4–20 | 13 `/dev/*` routes demoable in isolation |
| 2 — Composite harnesses | 20–28 | persona-create + persona-restore |
| 3 — Main UI integration | 28–34 | Onboard, Dashboard, MyPersonas, PersonaFeed, Verify wired |
| 4 — Demo prep | 34–36 | Practice runs, fixes, ship it |

---

## Cross-cutting kickoff (Hours 0–1)

- [ ] **(All)** Read PROJECT.md and dev/streams.md end-to-end
- [ ] **(All)** Confirm role split, schedule, sleep windows, demo slot time
- [ ] **(All)** Lock the persona event schema (PROJECT.md §5) — final field list before anyone writes code
- [ ] **(All)** Lock the wizard agent tool set (PROJECT.md §6) — final tool names and signatures
- [ ] **(All)** Pick default models for each task from PPQ's `/v1/models` (PROJECT.md §6)
- [ ] **(All)** Demo arc agreed: cold open → build live → fund and post → donation moment → kill-and-resurrect → vision

Sync at ~hour +1 — kick streams off in parallel.

---

## Stream A — Jim (LLM + Agent)

**Owns:** `/dev/ppq`, `/dev/agent`, `/dev/styling`, `/dev/image-gen`, `/dev/voice-gen` (specs in `dev/streams.md` §H1–H5)

### Phase 0 — Spike (3h)
- [ ] Spike: PPQ from a TS client (chat, image, TTS) paid in sats
- [ ] Document payment flow, model availability, costs, latency in `docs/spike-ppq.md`

### Phase 1 — Independent harnesses (12h)
- [ ] **`/dev/ppq`** (~1h) — formalize spike code into a `pi-ai` PPQ client + harness page
- [ ] **`/dev/agent`** (~3h) — `pi-agent-core` + `pi-web-ui` chat with one wizard tool
- [ ] **`/dev/styling`** (~2h) — system prompt + raw thought → styled output via PPQ
- [ ] **`/dev/image-gen`** (~3h) — `gpt-image-1` with reference-image input for likeness
- [ ] **`/dev/voice-gen`** (~2h) — TTS sample with voice picker
- [ ] 1h buffer

### Phase 2 — Composite contributions (4h)
- [ ] Wire `agent`, `image-gen`, `voice-gen` libs into Derek's `/dev/persona-create`
- [ ] Production wizard system prompt (multilingual: English + one second language)
- [ ] Output guards: kind-1 length norms, fallback message on PPQ failure

### Phase 3 — Main UI integration (4h)
- [ ] Wire `styling` into Dashboard composer
- [ ] Wire `image-gen` into Dashboard image button
- [ ] Voice rendering of published posts (V1.5 if time)

### Phase 4 — Demo prep (1h)
- [ ] Lock model defaults; verify prompt voices in 5 sample inputs each persona
- [ ] Standby for live tweaks during practice run

---

## Stream B — Topher (Wallet + Infra)

**Owns:** `/dev/wallet`, `/dev/ppq-pay`, `/dev/zap`, `/dev/settings` (specs in `dev/streams.md` §S1–S4)

### Phase 0 — Spike (3h)
- [ ] Spike: pi-mono in a Vite/React PWA — install, agent loop, one tool
- [ ] Document bundle, tool-call shape, provider switching in `docs/spike-pi-mono.md`
- [ ] Hand off result to Jim for `/dev/agent` harness construction

### Phase 0 — Parallel infrastructure decisions (~1h)
- [ ] Decide LNURL-pay hosting strategy → `docs/lnurl-hosting.md`
- [ ] Pre-fund the demo wallet seed (~50 chats / 10 images / 5 TTS / live-zap cushion) → `docs/demo-funding.md`
- [ ] Co-author `docs/breeze-decision.md` with Derek's Phase 0 Breeze findings

### Phase 1 — Independent harnesses (12h)
- [ ] **`/dev/wallet`** (~4h) — Breeze SDK init, balance, invoice, send/receive, tx history
- [ ] **`/dev/ppq-pay`** (~3h) — wallet pays a PPQ request end-to-end
- [ ] **`/dev/zap`** (~3h) — LNURL/lud16 mechanics, donate button, zap receipt rendering
- [ ] **`/dev/settings`** (~2h) — model picker reading PPQ `/v1/models`, persists to encrypted backup

### Phase 2 — Composite contributions (3h)
- [ ] Wire `mintPersonaWallet` into Derek's `/dev/persona-create`
- [ ] Confirm every AI-gated flow routes through `ppq-pay` (no naked PPQ calls)
- [ ] Empty-wallet UX (sticky banner + disabled buttons) wired into Dashboard

### Phase 3 — Main UI integration (4h)
- [ ] Wallet page (uses `WalletPanel` from harness)
- [ ] Settings page (already built as harness; just routed)
- [ ] Wallet badge in Dashboard with empty-wallet sticky banner

### Phase 4 — Demo prep (2h)
- [ ] Pre-fund demo persona wallet; stash seed securely
- [ ] Live-zap dry run: QR on screen → external wallet → zap lands on feed within seconds
- [ ] Backup demo wallet seed on multiple devices

---

## Stream C — Derek (Nostr + Frontend)

**Owns:** `/dev/persona-crypto`, `/dev/operator`, `/dev/publish`, `/dev/feed` (specs in `dev/streams.md` §C1–C4)
**Leads:** `/dev/persona-create`, `/dev/persona-restore` (composite, §C5–C6)

### Phase 0 — Spike (3h)
- [ ] Spike — Nostr crypto (NIP-44 self / NIP-49 / kind 30078) — ~1h
- [ ] Spike — Breeze SDK in browser (variant choice, init, invoice, pay) — ~2h
- [ ] Document both in `docs/spike-nostr-breeze.md`
- [ ] Hand off Breeze findings to Topher

### Phase 1 — Independent harnesses (12h)
- [ ] **`/dev/persona-crypto`** (~3h) — adapt existing `src/lib/persona*` to PROJECT.md §5.2 schema; full round-trip
- [ ] **`/dev/operator`** (~3h) — fresh keypair / NIP-07 / NIP-46 / paste; NIP-49 backup/restore
- [ ] **`/dev/publish`** (~3h) — kind 1 publish with full attribution tags
- [ ] **`/dev/feed`** (~3h) — render persona profile + posts + zap receipts from a pubkey

### Phase 2 — Composite harnesses (8h)
- [ ] **`/dev/persona-create`** (~5h) — full wizard composing agent + wallet + persona-crypto + image-gen + voice-gen
- [ ] **`/dev/persona-restore`** (~3h) — operator login → load all kind 30078 → present persona list

### Phase 3 — Main UI integration (5h)
- [ ] `Onboard.tsx` ← `<CharacterCreator>` from C5
- [ ] `MyPersonas.tsx` ← `<PersonaList>` from C6
- [ ] `PersonaFeed.tsx` ← `<PersonaProfileHeader>` + `<PersonaPostList>` + `<ZapReceiptCard>` (C4 + S3)
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
- [ ] Sample post quality review with Jim

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
