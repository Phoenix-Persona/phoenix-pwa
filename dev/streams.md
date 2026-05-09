# Parallel Build Streams

This is the master coordination document for the three parallel build streams (Jim, Topher, Derek) plus the product track (Anaïse). Supersedes the prior `phase-0-spikes.md`.

> **Required prior reading for everyone:** [`PROJECT.md`](./PROJECT.md).
> **Each developer's AI agent reads:** the working agreement, their stream section, and the harness specs the stream references.
> **Active task list:** [`../tasks/todo.md`](../tasks/todo.md).

---

## Working agreement

### File layout

Every persistent piece of code lives in the main app under standard paths so integration into the main UI is a no-op:

- `src/lib/<feature>/` — domain logic, types, helpers
- `src/components/<feature>/` — reusable UI components
- `src/hooks/use<Feature>.ts` — TanStack Query / React hooks
- `src/dev/<Feature>Harness.tsx` — the demo page (single file, route at `/dev/<feature>`)

Demo pages are wired into `AppRouter.tsx` under `/dev/*`. They share the main app's providers (`NostrProvider`, `AppProvider`). They have no design polish — the purpose is a developer test surface.

`src/dev/` and the `/dev/*` routes ship in the production bundle for now. Phase 4 decides whether to gate them behind `import.meta.env.DEV`.

### Branching and commits

Trunk-based. Commit straight to `main` (or your stream branch with rebase before merge). Prefix commits with the harness name: `[ppq]`, `[wallet]`, `[persona-crypto]`, `[persona-create]`, etc.

### Definition of done — per harness

A harness is "done" when:

1. The route renders on `/dev/<name>` and exercises the feature end-to-end.
2. Persistent code (in `src/lib/`, `src/components/`, `src/hooks/`) is structured so the main UI can import it without changes.
3. Edge cases for the demo are handled or visibly stubbed (a TODO in the harness page is fine).
4. The harness can be demoed to the team in under 60 seconds with the demo on screen.

### Sync points

- **+1h** — kickoff complete; streams begin
- **+4h** — end of Phase 0; spike notes committed; mini-sync
- **+12h** — mid-Phase-1 demo (each stream shows one harness)
- **+20h** — start of Phase 2 composites
- **+28h** — start of Phase 3 main UI integration
- **+34h** — start of Phase 4 demo prep
- **+36h** — demo

---

## The arc

| Phase | Hours | Output |
|-------|-------|--------|
| 0 — Spikes | 0–4 | `docs/spike-<name>.md` × 3; PPQ, pi-mono, Nostr+Breeze decisions made |
| 1 — Independent harnesses | 4–20 | 13 `/dev/*` routes demoable in isolation |
| 2 — Composite harnesses | 20–28 | `/dev/persona-create`, `/dev/persona-restore` |
| 3 — Main UI integration | 28–34 | Onboard, Dashboard, MyPersonas, PersonaFeed, Verify, Wallet, Settings |
| 4 — Demo prep | 34–36 | Practice runs, fixes, demo wallet pre-fund, kill-and-resurrect staging |

---

## Stream A — Jim (LLM + Agent)

**Spike:** PPQ → `docs/spike-ppq.md`
**Independent harnesses:** ppq, agent, styling, image-gen, voice-gen (specs §H1–H5)
**Composite contributions:** image-gen + voice-gen → `/dev/persona-create`
**Main UI:** Dashboard composer (styling), Dashboard image button, voice rendering

Sequence:

1. **Phase 0 (3h):** PPQ spike — chat / image / TTS, sat-paid, model availability, costs, latency.
2. **Phase 1 (12h):** harnesses §H1–H5.
3. **Phase 2 (4h):** wire `agent`, `image-gen`, `voice-gen` libs into Derek's `/dev/persona-create`; production wizard system prompt.
4. **Phase 3 (4h):** styling into Dashboard composer; image-gen button; voice rendering of posts (V1.5 if time).
5. **Phase 4 (1h):** lock model defaults; standby for prompt tweaks during practice runs.

---

## Stream B — Topher (Wallet + Infra)

**Spike:** pi-mono → `docs/spike-pi-mono.md` (output hands off to Jim's `/dev/agent`)
**Independent harnesses:** wallet, ppq-pay, zap, settings (specs §S1–S4)
**Composite contributions:** wallet mint → `/dev/persona-create`
**Main UI:** Wallet page, Settings page, Dashboard wallet badge, top-up sheet

Sequence:

1. **Phase 0 (3h):** pi-mono spike — install in Vite/React, agent loop, one custom tool, document tool-call shape and provider switching.
2. **Phase 0 parallel (~1h):** decide LNURL hosting (`docs/lnurl-hosting.md`); pre-fund demo wallet (`docs/demo-funding.md`); co-author Breeze variant decision with Derek (`docs/breeze-decision.md`).
3. **Phase 1 (12h):** harnesses §S1–S4.
4. **Phase 2 (3h):** wire wallet mint into `/dev/persona-create`; route every AI-gated flow through `ppq-pay`; empty-wallet UX wired into Dashboard.
5. **Phase 3 (4h):** Wallet page, Settings page, Dashboard wallet badge.
6. **Phase 4 (2h):** demo wallet pre-fund, live-zap dry run, seed backups on multiple devices.

---

## Stream C — Derek (Nostr + Frontend)

**Spike:** Nostr crypto + Breeze → `docs/spike-nostr-breeze.md` (Breeze part hands off to Topher)
**Independent harnesses:** persona-crypto, operator, publish, feed (specs §C1–C4)
**Composite leads:** persona-create, persona-restore (specs §C5–C6)
**Main UI:** Onboard wizard, MyPersonas, PersonaFeed, Verify

Sequence:

1. **Phase 0 (3h):** Nostr crypto spike (~1h: NIP-44 self / NIP-49 / kind 30078 round-trip) + Breeze browser spike (~2h: variant choice, init, invoice, pay).
2. **Phase 1 (12h):** harnesses §C1–C4.
3. **Phase 2 (8h):** composite harnesses §C5 + §C6.
4. **Phase 3 (5h):** Onboard ← `<CharacterCreator>` from C5; MyPersonas ← `<PersonaList>` from C6; PersonaFeed ← C4 + S3 components; Verify rebuilt against §5 schema; PWA polish.
5. **Phase 4 (1h):** kill-and-resurrect rehearsal; persona nsec backups on multiple devices.

---

## Anaïse — product track (parallel, not a build stream)

Headline items (full list in `tasks/todo.md`):

- Persona system prompt template for the Rwanda hero persona (Phase 0–1)
- 10 example raw thoughts for the demo (Phase 1)
- First persona created end-to-end through the wizard (Phase 1–2)
- 5–10 seed posts for the demo feed (Phase 3)
- Demo opening script + slide deck + one-pager (Phase 3–4)

---

## Cross-stream handoffs

| From | To | Artifact | When |
|------|----|----------|------|
| Topher (pi-mono spike) | Jim (`/dev/agent`) | `docs/spike-pi-mono.md` | End of Phase 0 |
| Derek (Nostr+Breeze spike) | Topher (`/dev/wallet`) | Breeze section of `docs/spike-nostr-breeze.md` | End of Phase 0 |
| Jim (`/dev/ppq`) | Topher (`/dev/ppq-pay`) | `src/lib/ppq/client.ts` | ~hour +6 |
| Topher (`/dev/wallet`) | Topher (`/dev/ppq-pay`) | `src/hooks/useWallet.ts` | ~hour +10 |
| Derek (`/dev/persona-crypto`) | Topher (`/dev/settings`) | `src/lib/persona/event.ts` | ~hour +10 |
| All independent harnesses | Derek (`/dev/persona-create`) | reusable libs/hooks/components | ~hour +20 |

If a handoff is late, the downstream consumer falls back to a stub (in-memory or hardcoded) and rewires once the real artifact lands. Don't block.

---

## Harness specs

Each spec: owner, goal, dependencies, files, demo flow, definition of done.

### H1 — `/dev/ppq`

- **Owner:** Jim
- **Goal:** Exercise PPQ chat / image / TTS / models endpoints from the PWA, paid in sats.
- **Dependencies:** `docs/spike-ppq.md`
- **Files:**
  - `src/lib/ppq/client.ts` — `pi-ai` wrapper pointed at PPQ, model-pref aware
  - `src/lib/ppq/types.ts`
  - `src/dev/PpqHarness.tsx`
- **Demo flow:** API key input (or env auto-load) → button row for "list models", "chat completion", "image gen", "TTS" → render output, cost in sats, latency for each.
- **DoD:** all four endpoints work; costs visible per call; errors render readably; code structured so `wallet.payInvoice` can plug in without refactor (for `/dev/ppq-pay`).

### H2 — `/dev/agent`

- **Owner:** Jim
- **Goal:** Run a `pi-agent-core` interview loop with one custom tool, in the PWA.
- **Dependencies:** `/dev/ppq`; `docs/spike-pi-mono.md`
- **Files:**
  - `src/lib/agent/runtime.ts` — `pi-agent-core` wiring
  - `src/lib/agent/tools.ts` — wizard tool set (initially one tool)
  - `src/components/agent/ChatSurface.tsx` — `pi-web-ui` wrapper
  - `src/dev/AgentHarness.tsx`
- **Demo flow:** chat surface; agent asks a question; user replies; agent calls `propose_name(...)`; harness logs the call as a card; user accepts/edits; loop continues.
- **DoD:** tool calls visible to the user as cards before the agent continues; user edits absorbed; conversation state persists across React renders; one tool today, structured to grow to the full §6 set.

### H3 — `/dev/styling`

- **Owner:** Jim
- **Goal:** Given a persona system prompt and a raw thought, produce a styled post via PPQ.
- **Dependencies:** `/dev/ppq`
- **Files:**
  - `src/lib/styling.ts`
  - `src/dev/StylingHarness.tsx`
- **Demo flow:** textareas for system prompt + raw thought; button → call PPQ → render styled output and cost.
- **DoD:** output respects kind-1 length norms; persona voice recognizable across 5 sample inputs; PPQ failure handled gracefully.

### H4 — `/dev/image-gen`

- **Owner:** Jim
- **Goal:** Generate an image with optional reference-image input for likeness consistency.
- **Dependencies:** `/dev/ppq`
- **Files:**
  - `src/lib/imageGen.ts`
  - `src/dev/ImageGenHarness.tsx`
- **Demo flow:** prompt + optional reference image (file upload or persona reference URL) → button → render generated image.
- **DoD:** reference-image input verifiably affects output (same prompt, with vs. without reference); output uploadable to Blossom from harness; cost shown.

### H5 — `/dev/voice-gen`

- **Owner:** Jim
- **Goal:** Generate a TTS sample with voice picker.
- **Dependencies:** `/dev/ppq`
- **Files:**
  - `src/lib/voiceGen.ts`
  - `src/dev/VoiceGenHarness.tsx`
- **Demo flow:** text input + voice picker → button → audio player.
- **DoD:** audio plays inline; sample uploadable to Blossom; voice ID round-trips (sample + voice id can be replayed by re-generating).

### S1 — `/dev/wallet`

- **Owner:** Topher
- **Goal:** Stand up a Breeze wallet in the PWA: generate seed → init → balance → invoice → send/receive → tx history.
- **Dependencies:** Breeze part of `docs/spike-nostr-breeze.md`
- **Files:**
  - `src/lib/wallet/breeze.ts` — SDK wrapper
  - `src/lib/wallet/types.ts`
  - `src/components/wallet/WalletPanel.tsx` — reusable balance + actions panel
  - `src/hooks/useWallet.ts`
  - `src/dev/WalletHarness.tsx`
- **Demo flow:** "Generate new wallet" → seed displayed → wallet initialized → balance shown → invoice button → QR + invoice text → "paste invoice to pay" optional.
- **DoD:** wallet creates from a generated seed in under ~5s on a fresh page load; invoice generation works; receive (from any external wallet) works end-to-end; send (paste invoice + pay) works; `useWallet` hook is the same one main app pages will import.

### S2 — `/dev/ppq-pay`

- **Owner:** Topher
- **Goal:** Wallet automatically pays a PPQ request end-to-end.
- **Dependencies:** `/dev/wallet`, `/dev/ppq`
- **Files:**
  - `src/lib/ppq/payment.ts` — orchestrates wallet ↔ PPQ payment flow
  - `src/dev/PpqPayHarness.tsx`
- **Demo flow:** wallet panel + "Run a paid PPQ chat completion" → invoice from PPQ → paid by wallet → response rendered.
- **DoD:** a request that would have failed with 402 succeeds after wallet payment; insufficient-balance case shows the empty-wallet UX; cost-estimate API surfaces an estimate before the click; all AI-gated flows in later harnesses route through `ppq.payment`.

### S3 — `/dev/zap`

- **Owner:** Topher
- **Goal:** LNURL-pay / Lightning Address mechanics for a persona, plus zap-receipt rendering.
- **Dependencies:** `/dev/wallet`, `docs/lnurl-hosting.md`
- **Files:**
  - `src/lib/zap/lnurl.ts` — Lightning Address + LNURL generation per persona pubkey
  - `src/components/zap/DonateButton.tsx`
  - `src/components/zap/ZapReceiptCard.tsx`
  - `src/dev/ZapHarness.tsx`
- **Demo flow:** generate Lightning Address for a stub persona → display QR/lud16 → external wallet zaps → harness shows zap receipt (kind 9735) on the persona's feed.
- **DoD:** Lightning Address resolves from outside (test with Wallet of Satoshi or similar); zap arrives in the persona's wallet; zap receipt event queryable by `{kinds:[9735], '#p':[persona_pubkey]}` and renders correctly.

### S4 — `/dev/settings`

- **Owner:** Topher
- **Goal:** Per-task model picker that reads PPQ `/v1/models` and persists into the persona's encrypted backup.
- **Dependencies:** `/dev/ppq`, `/dev/persona-crypto`
- **Files:**
  - `src/lib/settings/modelPrefs.ts`
  - `src/components/settings/ModelPicker.tsx`
  - `src/pages/Settings.tsx` (also serves the harness route)
  - `src/dev/SettingsHarness.tsx`
- **Demo flow:** picker per task (agent / styling / image / voice) populated from `/v1/models`; "save" updates the kind 30078 backup.
- **DoD:** picker pulls live model list; selections persist across page reloads (re-decrypting the kind 30078); defaults from PROJECT.md §6 apply when no preference is stored.

### C1 — `/dev/persona-crypto`

- **Owner:** Derek
- **Goal:** Round-trip the persona-backup crypto: NIP-44 self-encrypt + NIP-49 + kind 30078 publish/decrypt.
- **Dependencies:** Nostr part of `docs/spike-nostr-breeze.md`
- **Files:**
  - `src/lib/persona/schema.ts` — types matching PROJECT.md §5.2
  - `src/lib/persona/crypto.ts` — NIP-44 self-encrypt + NIP-49
  - `src/lib/persona/event.ts` — kind 30078 build/parse, query helpers
  - `src/dev/PersonaCryptoHarness.tsx`
- **Demo flow:** "Generate user keypair" → "Generate persona keypair" → "Build encrypted backup" → "Publish to relays" → "Query and decrypt" → show round-trip equality.
- **DoD:** existing `src/lib/persona*` adapted to the §5.2 schema; all three flows (encrypt-to-self, NIP-49, kind 30078 round-trip) work; decrypt failure modes (wrong key, malformed payload) handled.

### C2 — `/dev/operator`

- **Owner:** Derek
- **Goal:** User account creation surface — all four onboarding paths and NIP-49 backup/restore.
- **Dependencies:** `/dev/persona-crypto` (for the NIP-49 part)
- **Files:**
  - `src/lib/operator/account.ts` — fresh keypair gen, NIP-07 / NIP-46 / paste import, NIP-49 export/import
  - `src/components/operator/OnboardingPaths.tsx`
  - `src/components/operator/BackupDialog.tsx`
  - `src/dev/OperatorHarness.tsx`
- **Demo flow:** four buttons (fresh, NIP-07, NIP-46, paste) → each lands at a logged-in state → "Download backup" produces a NIP-49 file → "Restore" re-logs in.
- **DoD:** all four paths land at a logged-in state; backup file round-trips correctly; logged-in user is visible to the rest of the app via `useCurrentUser`.

### C3 — `/dev/publish`

- **Owner:** Derek
- **Goal:** Publish a kind 1 post signed by a persona keypair, with full attribution tags.
- **Dependencies:** none (operates on any keypair)
- **Files:**
  - `src/lib/persona/publish.ts` — kind 1 build with `t:phoenix`, `t:<region>`, `client:phoenix`, `alt:` tags
  - `src/dev/PublishHarness.tsx`
- **Demo flow:** paste a persona nsec → write content → publish → query relays → show the event.
- **DoD:** tags attached correctly; event verifies signature; round-trip through relays in seconds.

### C4 — `/dev/feed`

- **Owner:** Derek
- **Goal:** Render any persona's public feed (profile + posts + zap receipts) from a pubkey.
- **Dependencies:** none
- **Files:**
  - `src/components/persona/PersonaProfileHeader.tsx`
  - `src/components/persona/PersonaPostList.tsx`
  - `src/dev/FeedHarness.tsx`
- **Demo flow:** input a pubkey or npub → fetch kind 0, kind 1, kind 9735 → render.
- **DoD:** profile, posts, and zap receipts visible; missing kind 0 handled gracefully; reusable in `PersonaFeed.tsx` without modification.

### C5 — `/dev/persona-create` (composite)

- **Owner:** Derek (lead); Jim and Topher contribute
- **Goal:** Full character-creator wizard from start to encrypted backup published.
- **Dependencies:** `/dev/agent`, `/dev/wallet`, `/dev/persona-crypto`, `/dev/image-gen`, `/dev/voice-gen`
- **Files:**
  - `src/components/persona/CharacterCreator.tsx`
  - `src/lib/persona/wizard.ts` — orchestrates the agent + tool calls + persistence
  - `src/dev/PersonaCreateHarness.tsx`
- **Demo flow:** end-to-end wizard run — agent asks questions → name/bio proposed → profile image generated → voice sample generated → wallet minted → kind 30078 published → "Done!".
- **DoD:** a wizard run produces a queryable persona with public profile and a fundable wallet; all five sub-harnesses' code reused without modification; wizard is reusable as the body of `Onboard.tsx`.

### C6 — `/dev/persona-restore` (composite)

- **Owner:** Derek
- **Goal:** A user logs in from a fresh device and recovers all their personas.
- **Dependencies:** `/dev/operator`, `/dev/persona-crypto`
- **Files:**
  - `src/lib/persona/restore.ts` — query + bulk decrypt of kind 30078 events
  - `src/components/persona/PersonaList.tsx`
  - `src/dev/PersonaRestoreHarness.tsx`
- **Demo flow:** log in via operator harness → harness queries all kind 30078 events for that user pubkey → decrypts each → presents the persona list.
- **DoD:** recovery from a fresh page load works (clear localStorage first); each persona's wallet re-initializes correctly from the backup seed; `<PersonaList>` is reusable in `MyPersonas.tsx`.

---

## Integration phase (Phase 3)

The independent and composite harnesses already wrote the real code. Phase 3 is mostly assembly:

1. **Onboard.tsx** — replace its body with `<CharacterCreator>` from C5.
2. **Dashboard.tsx** — replace composer with styling + image-gen + publish trio (Jim's stream); add wallet badge and empty-wallet UX (Topher's stream).
3. **MyPersonas.tsx** — `<PersonaList>` from C6.
4. **PersonaFeed.tsx** — `<PersonaProfileHeader>` + `<PersonaPostList>` (C4) + `<ZapReceiptCard>` (S3).
5. **Verify.tsx** — read provenance from the §5 schema; small page.
6. **Settings.tsx** — already built as part of S4; just routed.
7. **Wallet page** — same; just routed.

Removing or gating `/dev/*` routes is a Phase 4 polish question, not a Phase 3 blocker.
