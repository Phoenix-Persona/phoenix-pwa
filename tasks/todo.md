# Phoenix Persona — Hackathon Build Plan

**Project:** Phoenix Persona — Anonymity-preserving AI personas, sustained by Lightning donations
**Event:** HRF AI Hack for Freedom
**Timeline:** 36 hours
**Team:** Anaïse (Captain + Product), Derek (Frontend + Nostr + PWA), Jim (LLM + Agent), Topher (Wallet + PPQ + Infrastructure)

> The authoritative design is [`PROJECT.md`](../dev/PROJECT.md). This file is the active build plan against the V1 scope in PROJECT.md §8. When the plan and this file disagree, **PROJECT.md wins** — update this file to match.

---

## Locked Decisions (carried in from PROJECT.md)

- Persona-is-the-account identity model. No separate operator key. (§3)
- Per-persona Breeze Lightning wallet; seed embedded in the encrypted kind 30078 backup. (§7.1)
- AI inference exclusively via PPQ; agent harness via `pi-mono` (`pi-agent-core`, `pi-ai`, `pi-web-ui`). (§4, §6)
- Voice samples and images stored on Blossom; URLs referenced from kind 0 / kind 30078. (§5.4)
- Persona keypair stored locally as NIP-49 (passphrase-encrypted). (§3)
- No Phoenix-owned backend. The PWA talks directly to PPQ, Nostr, Blossom, and Lightning. (§4)
- Donations: NIP-57 zaps + LNURL/Lightning Address. The donation flow is the demo's emotional headline. (§7.2, §9)
- Settings page: per-task model override, persisted in the encrypted backup. (§6)

---

## Phase 0 — Lock Contracts (Hours 0–2)

All four in a room. Parallel where possible.

- [ ] **(All)** Read PROJECT.md end-to-end together
- [ ] **(All)** Confirm role split, schedule, sleep windows, demo slot time
- [ ] **(Topher)** Decide Breeze SDK variant (Liquid SDK vs Greenlight vs Nodeless); document the trade-off in `docs/`
- [ ] **(Topher)** Decide LNURL-pay hosting strategy: which domain, who hosts the JSON, single-tenant vs multi-tenant
- [ ] **(Topher)** Spike — PPQ: list `/v1/models`, run a chat completion, an image gen, and a TTS request, all paid in sats
- [ ] **(Topher)** Spike — Breeze: create wallet from seed, generate invoice, receive payment, send payment
- [ ] **(Jim)** Spike — pi-mono: install, wire `pi-agent-core` + `pi-ai` to PPQ, run a one-tool agent loop in the PWA
- [ ] **(Derek + Topher)** Lock the persona event schema (PROJECT.md §5) — final field list before anyone writes encrypt/decrypt
- [ ] **(Derek + Jim)** Lock the wizard agent tool set (PROJECT.md §6) — final tool names and signatures
- [ ] **(All)** Pick default models for each task from PPQ's `/v1/models` (PROJECT.md §6 table)
- [ ] **(All)** Demo arc agreed: cold open → build live → fund and post → donation moment → kill-and-resurrect → vision

---

## Phase 1 — Skeleton (Hours 2–8)

### Derek (Frontend + Nostr + PWA)
- [ ] Adapt `src/lib/persona*` and `src/hooks/usePersona*` to PROJECT.md §5.2 (per-persona d-tag `phoenix-persona:<pubkey>`, `phoenix-persona` t-tag, embedded Breeze wallet seed, `model_prefs`)
- [ ] Delete `src/lib/styleClient.ts` (replaced by `src/lib/ppq.ts` later this phase)
- [ ] User keypair onboarding: support both bring-your-own (NIP-07/NIP-46/paste) and fresh-Phoenix-generated (NIP-49 passphrase-encrypted local)
- [ ] Persona keypair generation utility (fresh nsec, never written to disk; held in memory only when persona is active)
- [ ] Multi-persona load: query by user pubkey + `phoenix-persona` t-tag, decrypt via user's signer
- [ ] Multi-persona account switcher hooked into existing `useLoggedInAccounts`
- [ ] Wizard scaffold (`Onboard.tsx`): stage layout, progress indicator, navigation state, `pi-web-ui` chat shell
- [ ] Dashboard shell: composer textarea, preview pane, publish button, wallet badge
- [ ] PersonaFeed page shell: header, post list (mock data first), zap-receipt placeholder
- [ ] Settings page shell: per-task model picker (data not wired yet)

### Jim (LLM + Agent)
- [ ] `pi-ai` client wired to PPQ with model-pref override
- [ ] `pi-agent-core` wired with the wizard tool set: `propose_name`, `propose_bio`, `propose_system_prompt`, `generate_profile_image`, `generate_voice_sample`, `finalize_persona`
- [ ] Wizard interview system prompt v1
- [ ] Persona-styling prompt template parameterized by persona config
- [ ] Local test rig: 10 sample raw thoughts → styled outputs

### Topher (Wallet + PPQ + Infrastructure)
- [ ] Breeze SDK wired into the PWA: create wallet from seed, get balance, generate invoice
- [ ] Wallet UI shell: balance, receive (invoice + LNURL), send, tx history (read-only ok at this stage)
- [ ] PPQ payment plumbing in `pi-ai`: how a request gets paid (per-request invoice or account credit)
- [ ] Empty-wallet UX hook: `useWallet().canAfford(actionCost)` returns a boolean
- [ ] LNURL-pay endpoint stub (statically served per persona OR per-domain resolver — implementer's call)

### Anaïse (Captain + Product)
- [ ] Persona system prompt template for the Rwanda hero persona
- [ ] 10 example raw thoughts ready to feed the dashboard during demo
- [ ] Demo opening script v1 (30 seconds, real names, real stakes)
- [ ] Imigongo moodboard, palette, type pairing finalized for V1.5 polish handoff

---

## Phase 2 — Real Integration (Hours 8–18)

### Derek
- [ ] Wizard end-to-end: agent interview → persona generation → image gen → voice gen → wallet mint → encrypted backup published → kind 0 published
- [ ] Dashboard composer wired to `pi-ai` PPQ for styling
- [ ] Post image generation in compose flow, always passing the reference image for likeness
- [ ] Sign-and-publish kind 1 with attribution tags (`t:phoenix`, `t:<region>`, `client:phoenix`, `alt:`)
- [ ] PersonaFeed page reads real events from relays via Nostrify
- [ ] Verify page rebuilt against the new schema (persona pubkey, signature provenance, post count)
- [ ] Persona event load on dashboard mount (re-hydrate from relays)
- [ ] Relay set finalized (7–10 relays mixing Damus, Ditto, nostr.band, regional)

### Jim
- [ ] Production wizard agent — full system prompt, multilingual support (English + at least one second language)
- [ ] Production styling prompt iterated based on first sample outputs
- [ ] Image gen prompt template that leverages the reference image effectively
- [ ] TTS sample generation flow finalized; voice picker exposed in the wizard
- [ ] Output guards: hashtag/length appropriate for kind 1; fallback message if PPQ fails

### Topher
- [ ] PPQ payment flow fully wired in production (no mocks)
- [ ] Cost estimation surfaced in the UI: every AI-gated button shows estimated sats before commit
- [ ] Zap receipts (NIP-57 kind 9735) visible on PersonaFeed
- [ ] Empty-wallet UX: disabled buttons, sticky top-up banner with one-tap invoice sheet
- [ ] LNURL-pay endpoint hosted and resolving; persona's Lightning Address tested from an external wallet

### Anaïse
- [ ] First persona created end-to-end live (Anaïse runs the wizard)
- [ ] First 5 real posts composed and published via the dashboard
- [ ] First persona's wallet funded from Anaïse's personal wallet, end-to-end

### All
- [ ] **End-to-end smoke test:** Anaïse runs the wizard on Device A, posts a thought, an audience member zaps from a third device, content + zap appear on Device B's persona feed within seconds

---

## Phase 3 — Polish + Content (Hours 18–26)

### Derek
- [ ] Settings page wired: per-task model picker reads from PPQ `/v1/models`, selections persist into kind 30078
- [ ] MyPersonas page polished for multi-persona UX
- [ ] Public PersonaFeed polish: profile header, bio, donate button prominent (QR + Lightning Address), zap receipts inline
- [ ] Download-backup flow in wizard (NIP-49 bundle the user can save)
- [ ] Imigongo visual polish: palette, pattern, type pairing, splash page
- [ ] PWA manifest with Imigongo-themed icons (192, 512, maskable)
- [ ] PWA install prompt after first successful post; service worker caches shell + last fetched feed
- [ ] Mobile responsive QA pass (iPhone + Android)

### Jim
- [ ] Sample post quality review with Anaïse; prompt iteration based on her feedback
- [ ] Wizard interview transcripts reviewed; awkward turns patched in the system prompt

### Topher
- [ ] LNURL-pay endpoint reliability hardened; rate limit tested
- [ ] Wallet send/receive UX polish; transaction list shows zaps with persona attribution

### Anaïse
- [ ] 5–10 seed posts published to make the demo feed look alive
- [ ] Second persona stubbed for the directory (npub + 3 posts + funded wallet)
- [ ] One-pager for judges drafted
- [ ] Demo deck slides drafted

---

## Phase 4 — V1.5 / V2 Stretch (Hours 26–30)

**Skip if behind schedule. Polish V1 instead.**

- [ ] **(Jim + Derek)** TTS audio rendering of published posts — stored on Blossom, embedded in kind 1
- [ ] **(Topher)** Video generation spike (model selection via PPQ)
- [ ] **(Jim)** Multi-language wizard interview (Kinyarwanda + English at minimum)
- [ ] **(Topher)** RSS ingestion + brainstorm flow — only if everything else is locked

---

## Phase 5 — Demo Prep (Hours 30–34)

- [ ] **(Anaïse)** Slide deck final, 8–10 slides max
- [ ] **(All)** Practice run #1 — full demo, find breakages
- [ ] **(All)** Fix breakages
- [ ] **(All)** Practice run #2 — timed
- [ ] **(Derek)** Kill-and-resurrect staging: laptop closes, second device picks up the persona via nsec restore
- [ ] **(Topher)** Live-zap setup tested: QR on screen → audience scans → zap lands on feed within seconds
- [ ] **(Topher)** Persona wallet pre-funded for the demo so styling/image gen never blocks on funds
- [ ] **(All)** Persona nsec backups saved to multiple devices (so if any laptop dies, persona survives)
- [ ] **(Anaïse)** One-pager finalized, printed copies for judges
- [ ] **(All)** Pre-load demo browser tabs, sign-ins tested on demo laptop
- [ ] **(All)** Demo network plan: hotspot backup if venue WiFi fails

---

## Phase 6 — Buffer (Hours 34–36)

- [ ] Sleep
- [ ] Fix the thing that broke at 3am
- [ ] Final demo run
- [ ] Ship it

---

## Definition of Done — V1

- [ ] User can complete the character-creator wizard end-to-end (interview → name/bio → image → voice → wallet → backup published)
- [ ] User can fund a persona's wallet from an external wallet via Lightning Address or invoice
- [ ] Dashboard accepts raw thought → AI styles → preview → publish kind 1 with attribution tags
- [ ] User can generate a post image with consistent likeness via the reference image
- [ ] Posts appear on persona feed page within seconds, on a separate device
- [ ] Donations (NIP-57 zaps) to a persona land in the persona's wallet and are visible on the feed
- [ ] AI-gated features disable gracefully when wallet balance is insufficient
- [ ] Settings page lets the user pick a different model for any AI task
- [ ] Persona can be backed up (download NIP-49 bundle) and restored on a fresh device from nsec + relays
- [ ] PWA installable on Android (Anaïse's phone)

## Definition of Done — Demo

- [ ] 5–7 minute demo runs cleanly on practice run #2
- [ ] Live persona creation on stage works end-to-end without intervention
- [ ] Live audience zap during the demo lands on the persona's feed visibly
- [ ] Kill-and-resurrect moment lands logistically
- [ ] Anaïse's opening 30 seconds is rehearsed and tight
- [ ] One-pager in judges' hands

---

## Review Section

_To be filled in post-demo. Lessons captured to `tasks/lessons.md`._
