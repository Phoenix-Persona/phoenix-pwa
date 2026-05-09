# Phoenix — Hackathon Build Plan

**Project:** Phoenix — Uncensorable Voices
**Event:** HRF AI Hack for Freedom
**Timeline:** 36 hours
**Team:** Anaïse (Captain), Derek (Frontend + Nostr), Jim (LLM), Toffer (Backend/Sources)

---

## Locked Decisions

- Product: V1 operator-assisted (must ship), V2 autonomous brainstorm (stretch)
- Branding: Rwandan-rooted (Imigongo patterns, ochre/black/cream/red palette)
- App shell: PWA (Vite + vite-plugin-pwa)
- Identity model: Operator signs in with own Nostr key; persona has separate generated keypair
- LLM: OpenRouter, Claude Sonnet 4.5
- Persona event: kind 30078, `d:phoenix-persona`
- Posts: kind 1 with `t:phoenix`, `t:<region>`, `r:<source>`, `operator:<pubkey>`, `alt:` tags
- Hot nsec for persona key (NIP-46 = stretch)
- Frontend build: Shakespeare / mkstack
- Style endpoint: Vercel serverless functions
- Sources captured in V1 wizard but unused in V1 dashboard (future-proofs schema)
- Sample post in wizard step 4: preview-only, not published

---

## Phase 0 — Lock Contracts (Hours 0-2)

All four in a room. Parallel where possible.

- [ ] **(All)** Confirm role split, schedule, demo slot time
- [ ] **(Derek + Toffer)** Lock persona event schema — 20 min
  - kind 30078, d-tag, region/cause/lang/source tags, content JSON shape
- [ ] **(Derek + Jim)** Lock `/style` endpoint contract — 10 min
  - Request: `{ text, personaConfig }` → Response: `{ styled, sources?, tokensUsed }`
- [ ] **(Anaïse + Jim)** System prompt voice spec for Rwanda persona — 60-90 min
  - Cultural register, what to avoid, genocide memory handling, press freedom framing
  - Languages: English + Kinyarwanda
  - Output: a system prompt template + 5 example outputs Anaïse signs off on
- [ ] **(Derek + Anaïse)** Imigongo moodboard, palette, type pairing — 30 min (parallel)
- [ ] **(Toffer)** Vercel project spun up; stub `/style` returning mock data
- [ ] **(Derek)** Initialize project in `/home/raven/Projects/phoenix`
  - mkstack template cloned
  - vite-plugin-pwa wired
  - Tailwind tokens for Imigongo palette
  - Routes scaffolded
- [ ] **(All)** Demo arc agreed: opening, build-live, compose, kill-it, resurrect, scale vision

---

## Phase 1 — Skeleton (Hours 2-8)

### Derek (Frontend + Nostr)
- [ ] Splash route — operator sign-in (NIP-07 + NIP-46 + nsec paste)
- [ ] Wizard scaffold: 5 steps with router, progress indicator, navigation state
- [ ] Persona keypair generation utility
- [ ] Persona event schema implementation (build + parse)
- [ ] Dashboard shell: compose box, preview pane, post button
- [ ] Feed page shell: persona header, post list (mock data first)
- [ ] Directory page shell: persona cards grid

### Jim (LLM)
- [ ] `/style` endpoint stub returning real OpenRouter call (Claude Sonnet 4.5)
- [ ] System prompt template parameterized by persona config
- [ ] Local test rig: input → styled output, 10 sample inputs
- [ ] Multilingual smoke test (English + Kinyarwanda)

### Toffer (Backend / Sources)
- [ ] Vercel deployment confirmed working with secrets (OpenRouter key)
- [ ] Persona config parsing utility (shared with Derek if helpful)
- [ ] CORS configured for the PWA origin
- [ ] Health check endpoint
- [ ] Logging/metrics for the demo (request count, latency)

### Anaïse (Captain)
- [ ] Rwanda persona system prompt v1 finalized with Jim
- [ ] Source list curated: BBC Africa, HRW, RSF, RFI Kinyarwanda, +5-10 more
- [ ] Demo opening script written (30 seconds, real names, real stakes)
- [ ] 10 example raw thoughts ready to feed the dashboard during demo

---

## Phase 2 — Real Integration (Hours 8-18)

### Derek
- [ ] Wizard ↔ persona event publishing wired end-to-end
- [ ] Dashboard ↔ `/style` endpoint wired
- [ ] Sign-and-publish kind 1 with full tag set (t, r, operator, alt, client)
- [ ] Feed page reads from relays via Nostrify, shows real posts
- [ ] Source attribution UI: each post shows source domains as pills, click → article
- [ ] Verification page: persona npub, signature chain, "operated by" link, post count
- [ ] Persona event load on dashboard mount (re-hydrate from relays)
- [ ] localStorage/IndexedDB encrypted persona nsec
- [ ] Relay set finalized (7-10 relays mixing Damus, Ditto, nostr.band, regional)

### Jim
- [ ] Production `/style` with full system prompt template
- [ ] Sample-generation tuned for wizard step 4 (single-shot "hello world" post)
- [ ] Output format: ensures hashtag/length appropriate for kind 1
- [ ] Error handling: fallback message if LLM fails

### Toffer
- [ ] Endpoint hosting hardened (rate limits, error responses)
- [ ] Source URL parsing utility (extracts domain for attribution UI)
- [ ] Optional: simple RSS fetch endpoint stub for V2 prep

### Anaïse
- [ ] First real persona created end-to-end through the wizard
- [ ] First 5 real posts composed via dashboard
- [ ] Final review of system prompt voice with Jim — adjustments

### All
- [ ] **End-to-end smoke test:** Anaïse runs the wizard, posts via dashboard, content appears on feed page on a separate device

---

## Phase 3 — Imigongo + Content (Hours 18-26)

### Derek
- [ ] Imigongo geometric pattern as design motif (SVG, used in headers, dividers)
- [ ] Color palette applied: ochre, black, cream, red
- [ ] Typography pairing finalized
- [ ] Splash page polished — sets the emotional tone
- [ ] Persona feed page: persona avatar, bio, region badge, source pills, verification badge
- [ ] Directory page: search by region/cause/language, "Voice of Rwanda" card prominent
- [ ] PWA manifest with Imigongo-themed icons (192, 512, maskable)
- [ ] PWA install prompt after first successful post
- [ ] Service worker caches shell + last fetched feed
- [ ] Mobile responsive QA pass (iPhone + Android)

### Anaïse
- [ ] 5-10 seed posts published to make the demo feed look alive
- [ ] Stub second persona (Venezuela) for the directory — npub + 3 posts
- [ ] One-pager for judges drafted
- [ ] Demo deck slides drafted

### Jim
- [ ] Sample post quality review with Anaïse
- [ ] System prompt iteration based on Anaïse's seed-post feedback

### Toffer
- [ ] Endpoint reliability check; retry logic if needed
- [ ] Setup the "kill switch" — easy way to take the endpoint down on stage

---

## Phase 4 — V2 Stretch (Hours 26-30)

**Skip if behind schedule.** Polish V1 instead.

### Toffer
- [ ] RSS ingestion: fetch + parse + dedupe
- [ ] Source store (in-memory or KV): per-persona recent items
- [ ] `/brainstorm` endpoint stub: returns 3-5 candidate posts

### Jim
- [ ] `/brainstorm` LLM logic: takes recent sources + persona config → candidates
- [ ] Source attribution: each candidate carries source URLs

### Derek
- [ ] Brainstorm UI in dashboard: button → candidate list → pick → edit → post

---

## Phase 5 — Demo Prep (Hours 30-34)

- [ ] **(Anaïse)** Slide deck final, 8-10 slides max
- [ ] **(All)** Practice run #1 — full demo, find breakages
- [ ] **(All)** Fix breakages
- [ ] **(All)** Practice run #2 — timed
- [ ] **(Derek)** "Kill it" theatrical staging: laptop closes, phone reveals feed alive
- [ ] **(Toffer)** Resurrect script: laptop replacement runs single command
- [ ] **(Anaïse)** One-pager finalized, printed copies for judges
- [ ] **(Derek)** Persona nsec backup saved (so if laptop dies, persona survives)
- [ ] **(All)** Pre-load demo browser tabs, sign-ins tested on demo laptop
- [ ] **(All)** Demo network plan: hotspot backup if venue WiFi fails

---

## Phase 6 — Buffer (Hours 34-36)

- [ ] Sleep
- [ ] Fix the thing that broke at 3am
- [ ] Final demo run
- [ ] Ship it

---

## Definition of Done — V1

- [ ] Operator can sign in with NIP-07, NIP-46, or nsec paste
- [ ] Wizard creates a persona end-to-end (5 steps), publishes config to relays
- [ ] Dashboard accepts raw thought → AI styles → preview → publish kind 1
- [ ] Posts appear on persona feed page within seconds
- [ ] Source attribution visible on each post
- [ ] Verification page shows cryptographic provenance
- [ ] Directory shows ≥2 personas (Rwanda + Venezuela stub)
- [ ] PWA installable on Android (Anaïse's phone)
- [ ] Killing the styling endpoint does NOT remove past content
- [ ] Resurrection: another machine running the styling service resumes posting

## Definition of Done — Demo

- [ ] 5-7 minute demo runs cleanly on practice run #2
- [ ] "Kill it" moment lands emotionally
- [ ] Resurrection moment lands logistically
- [ ] Anaïse's opening 30 seconds is rehearsed and tight
- [ ] One-pager in judges' hands

---

## Review Section

_To be filled in post-demo. Lessons captured to `tasks/lessons.md`._
