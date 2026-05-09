# Phase 0 — Coordinated Spikes

**Time-box:** 2–4 hours.
**Purpose:** retire the highest-risk unknowns before Phase 1 so all four workstreams can run in parallel without blocking each other.

This document briefs the AI agents helping each spike owner. Each agent reads only its own section plus the working agreement and dependency map, and produces the deliverable named there.

Required prior reading for every owner: [`PROJECT.md`](./PROJECT.md) §3 (identity), §5 (data model), §6 (AI capabilities), §7 (wallet).

---

## Working agreement

- **Working dirs.** Each spike owns one directory under `spikes/<name>/`. Don't touch other spikes' dirs.
- **Deliverable.** Each spike produces one ~1-page markdown file at `docs/spike-<name>.md`. The spike code is reference; the deliverable note is the actual handoff to Phase 1. **Phase 1 reads the note, not the code.**
- **Branching.** Trunk-based. Commit straight to `main`. Prefix commits with `[spike-<name>]` so the timeline reads cleanly.
- **No premature integration.** Spikes are throwaway. Don't import one spike's code into another.
- **Sync points.**
  - Hour +2: each owner posts a one-line status to the team channel.
  - Hour +4: all spike notes committed; 15-min sync to align Phase 1 scope before anyone writes Phase 1 code.
- **Definition of done** (every spike):
  1. `docs/spike-<name>.md` committed
  2. Note ends with a "Recommended Phase 1 approach" subsection actionable without reading the spike code
  3. Owner ticks their Phase 0 checkbox in `tasks/todo.md`
  4. Any open-research-item resolutions (PROJECT.md §10) are propagated back into PROJECT.md, not just the spike note

---

## Spike A — PPQ integration

**Owner:** Jim
**Working dir:** `spikes/ppq/`
**Deliverable:** `docs/spike-ppq.md`
**Time-box:** 3 hours

### Goal

Make working calls to all three PPQ endpoints we plan to use, paid in sats, from a TypeScript client that could plausibly run in a browser PWA.

### What to build

A minimal Node or Vite TypeScript script in `spikes/ppq/` that:

1. Lists `/v1/models`
2. Runs a chat completion (claude-sonnet-4-5 if available, else closest)
3. Generates one image (`gpt-image-1` or PPQ's closest)
4. Generates one TTS audio sample (`tts-1-hd` or PPQ's closest)

For each call, observe and document how PPQ accepts payment.

### Open questions to answer in the deliverable

- **Payment model:** L402 macaroon, prepaid account credit, or per-request invoice + retry? Document the actual flow.
- **Auth:** API key, macaroon, or per-request? Long-lived?
- **Available models:** which match PROJECT.md §6 defaults? List the closest match per task.
- **Pricing:** sats/request for a 500-token chat completion, a 1024×1024 image, a 15-second TTS sample.
- **Latency:** end-to-end time per request, including any payment round-trip.
- **Browser-friendliness:** does the API work directly from a PWA (CORS), or do we need a proxy?

### Out of scope

- Wiring PPQ into `pi-ai` — that's Phase 1
- Wiring a real Breeze wallet — use any test wallet you have; we just need to learn the flow
- Production error handling, retries, rate limits

---

## Spike B — pi-mono in a Vite/React PWA

**Owner:** Topher
**Working dir:** `spikes/pi-mono/`
**Deliverable:** `docs/spike-pi-mono.md`
**Time-box:** 3 hours

### Goal

Embed a `pi-agent-core` agent loop in a Vite + React + TypeScript PWA with one custom tool, and confirm that the wizard interview pattern from PROJECT.md §6 is buildable in a browser.

### What to build

A minimal Vite app in `spikes/pi-mono/` (separate from the main app — don't pollute the root `package.json` yet) that:

1. Installs `pi-agent-core`, `pi-ai`, and `pi-web-ui` from [github.com/earendil-works/pi](https://github.com/earendil-works/pi)
2. Wires `pi-ai` to PPQ — or, if Spike A's payment flow isn't ready, OpenAI direct with an API key for the spike only
3. Renders a `pi-web-ui` chat surface
4. Defines one custom tool, e.g. `propose_name(name: string, rationale: string)`
5. Runs an interview where the agent calls the tool at least once and the user can intervene

### Open questions to answer in the deliverable

- **Bundle compatibility:** does `pi-agent-core` work in the browser, or is it Node-only? If Node-only, what's the path to browser support?
- **Tool calling shape:** how does the agent invoke a tool, and how does the host respond? Sync, async, streaming?
- **Chat UI integration:** how do `pi-web-ui` components surface tool calls so the user can intercept/edit before the agent continues?
- **State and resumption:** can the agent loop be paused and resumed across React renders?
- **Provider and model switching:** how does `pi-ai` swap providers/models at runtime per-task, given our settings page requirement?

### Out of scope

- The full Phoenix wizard tool set — one tool is enough to prove the pattern
- Persona schema, encryption, wallet integration
- Visual polish

---

## Spike C — Nostr crypto + Breeze wallet

**Owner:** Derek
**Working dir:** `spikes/nostr-breeze/`
**Deliverable:** `docs/spike-nostr-breeze.md`
**Time-box:** 3 hours (split roughly 1h Nostr + 2h Breeze)

### Goal

Round-trip the cryptographic flows the persona system depends on, and stand up a Breeze Lightning wallet in the browser end-to-end.

### Part 1 — Nostr crypto (~1 hour)

In `spikes/nostr-breeze/nostr/`:

1. Generate a fresh **user** keypair with `nostr-tools`
2. Generate a fresh **persona** keypair
3. NIP-44 encrypt a JSON payload (containing the persona nsec) **to the user's own pubkey**; decrypt it back; assert equality
4. NIP-49 encrypt the user nsec with a passphrase; decrypt with the passphrase; assert equality
5. Build a kind 30078 event with `d` = `phoenix-persona:<persona-pubkey>` and `t` = `phoenix-persona`, signed by the user. Publish to a relay; query it back filtering by `authors: [user_pubkey], '#t': ['phoenix-persona']`; decrypt the content.

### Part 2 — Breeze wallet (~2 hours)

In `spikes/nostr-breeze/wallet/`:

1. Pick the Breeze SDK variant (Liquid SDK / Greenlight / Nodeless) and document why
2. Initialize a wallet from a generated BIP-39 seed in the browser
3. Generate an invoice
4. Receive a small payment from an external wallet (use Breeze's test mode if available; mainnet with a tiny amount otherwise)
5. Display balance
6. Pay an outbound invoice

### Open questions to answer in the deliverable

- **Browser compatibility.** Which Breeze SDK variant runs in a PWA without a backend? Bundle size impact?
- **Seed UX.** Can we keep the BIP-39 seed entirely inside the encrypted kind 30078 event and never show it to the user, or are there flows where the user needs to see it?
- **Reconnect.** How long does wallet startup take from a known seed on a fresh page load? Does it need a sync window?
- **Cost.** Any chain fees / setup fees per persona that the user has to pay before the persona can transact?
- **NIP-44 to self.** Confirm the Nostrify / nostr-tools API for self-encryption (author == recipient pattern).
- **Relay query for persona discovery.** Does `{kinds:[30078], authors:[user_pubkey], '#t':['phoenix-persona']}` work as expected on the relays we're targeting (Damus, Ditto, primal, nostr.band)?

### Out of scope

- The full persona schema beyond what's needed to test encrypt/decrypt
- Wallet UI polish — a console log of balance is fine
- Paying PPQ from the wallet — that's Phase 1, where Spike A meets Spike C

---

## Anaïse — parallel product track (not a spike)

Phase 0 product work runs alongside the technical spikes; see `tasks/todo.md` Phase 0 + Phase 1 lines tagged Anaïse. Headline items:

- Persona system prompt template for the Rwanda hero persona
- 10 example raw thoughts ready for demo
- Demo opening script v1 (30 seconds)
- Imigongo moodboard, palette, type pairing locked for V1.5

---

## Unowned Phase 0 work — assign at kickoff

Two infrastructure decisions in PROJECT.md §10 don't fit into the three named spikes. Assign an owner during the Phase 0 kickoff:

- **`docs/spike-lnurl-hosting.md`.** Where does the persona Lightning Address endpoint live? Static JSON per persona on a chosen domain (Vercel/Netlify), a small dynamic resolver, or piggybacking on an existing service. Must be decided early because the wallet UI and persona profiles render Lightning Addresses as soon as Phase 1 starts.
- **`docs/demo-funding.md`.** Pre-fund a demo wallet with enough sats to cover ~50 chat completions, ~10 image generations, ~5 TTS samples, and a live-zap audience cushion. Capture seed in a secure place.

---

## Cross-spike dependencies

```
Spike A (PPQ, Jim) ─────────┐
                            ├──▶ Phase 1: pi-ai → PPQ wiring
Spike B (pi-mono, Topher) ──┴──▶ Phase 1: agent loop pattern (all owners)
Spike C (Nostr+Breeze, Derek) ──▶ Phase 1: persona schema (Derek), wallet UI (Topher)
LNURL hosting (TBD) ────────────▶ Phase 1: Lightning Address rendering (Derek)
```

If a spike runs over time, only the dependent Phase 1 stream is partially blocked; other streams can still start. Spike B (pi-mono) is the most likely critical path because the entire wizard depends on it.

---

## Hand-off into Phase 1

At the hour-+4 sync, each owner walks the team through their `docs/spike-*.md` "Recommended Phase 1 approach" subsection. The team confirms — or amends — the relevant Phase 1 lines in `tasks/todo.md` before any of them are picked up. PROJECT.md §10 is updated for any open research items the spikes resolved.
