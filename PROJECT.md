# Phoenix Persona — Master Plan

> **Status:** Authoritative design document. This plan **supersedes** the
> current code in the repository. The existing files are MKStack boilerplate
> plus an early sketch of an operator/persona scheme — they will be reshaped
> (or discarded) to match this plan rather than the other way around.

---

## 1. Mission

Phoenix Persona helps a person publish on social media as an AI-driven persona
that is cryptographically separate from their real identity. The persona has
its own face, voice, writing style, Nostr identity, and Lightning wallet. It
can accept donations and use those donations to pay for its own AI inference,
so the voice continues to live as long as anyone in the world is willing to
sustain it.

**Primary audience — political activists and dissidents.** People who need to
speak publicly without putting themselves, their families, or their
communities at risk of retaliation. The HRF AI Hack for Freedom framing leads
the demo and the pitch.

**Secondary audience — anyone who wants a public voice that isn't tied to
their legal identity.** Writers, whistleblowers, survivors, public commenters
on sensitive topics, people in jurisdictions where their identity itself is a
liability.

Same product. Two stories.

---

## 2. Product overview

### The user journey

```
1. Open Phoenix → "Create a new persona"
2. Character-creator wizard, guided by an embedded AI agent:
   - Interview (values, voice, region, languages, what this persona stands for)
   - Generate name + bio + system prompt
   - Generate profile picture (canonical reference image)
   - Generate voice sample
   - Mint Nostr keypair + Breeze Lightning wallet
   - Publish encrypted backup event
3. Persona dashboard:
   - Compose: write/dictate raw thoughts → agent styles them into the
     persona's voice → preview → publish to Nostr
   - Generate images for posts (consistent likeness via reference image)
   - Generate audio of posts in the persona's voice (V1.5)
   - Generate video (V2 stretch)
4. Wallet panel:
   - Lightning balance
   - Receive (invoice / Lightning Address / LNURL QR)
   - Send (pay AI services automatically; manual send for top-ups)
   - Transaction history
   - Donations received are visible on the public persona feed
5. Public persona pages (anyone can view):
   - Profile + posts + media
   - Donate button (zap or LNURL)
   - "Verify" page showing cryptographic provenance
```

### What ships in V1

A user can sign up, complete the character-creator wizard, fund the persona's
wallet from their own wallet, and publish text and image posts under the
persona. Donations flow back to the persona's wallet. AI-gated features
gracefully disable when the wallet is empty.

---

## 3. Identity model

**The persona is the Nostr account.** There is no separate "operator"
identity. A user creates one or more personas; each persona is a fresh
Nostr keypair the user controls.

**Multi-persona UX.** Phoenix is a multi-account Nostr client. Users can
create, switch between, and back up several personas. The MKStack
`LoginArea` / `useLoggedInAccounts` flow already supports the multi-account
shape we need.

**Threat model.** The user's *device* and the user's *real identity* are
the things to protect. The persona's nsec is the only secret on the device
that links the user to the voice. We never log it remotely, we never derive
it from anything tied to the user's real identity, and we encrypt anything
on-device with a user passphrase.

**Key custody.**

- Persona nsec: generated locally, encrypted at rest with a user passphrase
  via NIP-49, kept in `localStorage`.
- Encrypted backup (kind 30078, see §5): published to Nostr relays,
  NIP-44-encrypted to the persona's own pubkey. Contains the full persona
  config, the Breeze wallet seed, and references to off-chain assets.
- Recovery: on a new device, the user pastes the persona nsec (or restores
  from a downloaded NIP-49 bundle), the app fetches the kind 30078 event
  from relays, decrypts it, and re-hydrates the wallet and persona config.
- Loss: if the nsec is lost, the persona and its wallet are gone. The
  wizard surfaces a one-time "download backup" affordance and asks the
  user to confirm they have stored it.

**Why not split operator/persona keys.** An operator key feels safer in
theory (encrypted persona config sealed to the operator), but it requires
the user to manage *two* identities, and the operator key becomes a
single-point-of-failure linkage between every persona that user has ever
created — exactly the linkage we are trying to avoid. Collapsing to one
keypair per persona keeps the threat model clean.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Phoenix PWA  (React 19 + Vite + TailwindCSS 4 + shadcn/ui)      │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Character   │  │ Dashboard /  │  │ Wallet UI               │  │
│  │ creator     │  │ composer     │  │ (balance, recv, send)   │  │
│  │ (pi-web-ui) │  │              │  │                         │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────────┘  │
│         │                │                     │                 │
│  ┌──────▼────────────────▼─────────────────────▼──────────────┐  │
│  │  Phoenix runtime                                           │  │
│  │   - pi-agent-core   (agent loop, tool calling)             │  │
│  │   - pi-ai           (LLM client → PPQ)                     │  │
│  │   - Nostrify        (Nostr publish/query, NIP-44, NIP-49)  │  │
│  │   - Breeze SDK      (Lightning wallet, LNURL, zap pay)     │  │
│  │   - Blossom client  (media uploads — voice, images)        │  │
│  └──┬──────────────┬───────────────┬───────────────┬──────────┘  │
└─────┼──────────────┼───────────────┼───────────────┼─────────────┘
      │              │               │               │
      ▼              ▼               ▼               ▼
  ┌────────┐   ┌──────────┐   ┌──────────────┐  ┌──────────────┐
  │  PPQ   │   │  Nostr   │   │   Lightning  │  │   Blossom    │
  │ ppq.ai │   │  relays  │   │   network    │  │   servers    │
  │        │   │          │   │ (via Breeze) │  │              │
  └────────┘   └──────────┘   └──────────────┘  └──────────────┘
   AI infer.   Identity,        Donations,        Voice sample,
   paid in     publishing,      AI payments,      profile image,
   sats        backup           top-ups           post media
```

**Key dependencies.**

| Layer            | Library                              | Notes                                                        |
| ---------------- | ------------------------------------ | ------------------------------------------------------------ |
| Agent runtime    | `pi-agent-core`                      | Tool-calling, state, the character-creator interview loop    |
| LLM client       | `pi-ai`                              | OpenAI-compatible; pointed at PPQ. Model per task selectable |
| Agent chat UI    | `pi-web-ui`                          | Drop-in components for the wizard chat surface               |
| Nostr            | `@nostrify/nostrify`, `@nostrify/react` | Already in `package.json`                                 |
| Encryption       | `nostr-tools` (NIP-44, NIP-49)       | Already pulled in                                            |
| Lightning wallet | `@breeztech/breeze-sdk` (Liquid SDK or Greenlight; choice TBD — see §10) | Per-persona wallet, seed phrase backup     |
| Media            | Blossom upload (`useUploadFile`)     | Already in scaffold                                          |

There is no Phoenix-owned backend. Everything runs in the PWA against
public services (PPQ, Nostr relays, Blossom, Lightning). This is a
deliberate choice so the project survives loss of any one piece of
infrastructure — including loss of the original developers.

---

## 5. Persona data model

Three Nostr events per persona, plus media on Blossom.

### 5.1 kind 0 — public profile (NIP-01, signed by persona)

Standard kind-0 metadata, plus the additions Phoenix needs to be useful in
generic Nostr clients without breaking them.

```json
{
  "name": "Imani",
  "display_name": "Imani Uwase",
  "about": "Voice of Rwanda. Press freedom, civil society, the long memory.",
  "picture": "https://blossom.example/<sha256>.png",
  "lud16": "imani@phoenix.example",
  "lud06": "lnurl1...",
  "nip05": "imani@phoenix.example",
  "phoenix": {
    "voice_sample": "https://blossom.example/<sha256>.mp3",
    "reference_image": "https://blossom.example/<sha256>.png",
    "version": 1
  }
}
```

`phoenix.*` is a Phoenix-specific namespace clients can ignore. Everything
above it is standard.

### 5.2 kind 30078 — encrypted backup (NIP-78 application data, signed by persona)

Addressable replaceable event. `d` tag = `"phoenix-persona"`. Content is a
NIP-44 ciphertext encrypted to the persona's own pubkey.

Plaintext payload:

```json
{
  "version": 1,
  "persona": {
    "name": "Imani Uwase",
    "system_prompt": "...full persona system prompt...",
    "voice_id": "alloy",
    "voice_sample_url": "https://blossom.example/<sha256>.mp3",
    "reference_image_url": "https://blossom.example/<sha256>.png",
    "languages": ["en", "rw"],
    "tags": ["rwanda", "press-freedom"],
    "created_at": 1715212800
  },
  "wallet": {
    "kind": "breeze",
    "seed": "<bip39 mnemonic>",
    "lnurl": "lnurl1..."
  },
  "model_prefs": {
    "agent": "claude-sonnet-4-5",
    "image": "gpt-image-1",
    "tts": "tts-1-hd",
    "video": null
  },
  "settings": {
    "default_relays": ["wss://relay.damus.io", "..."]
  }
}
```

This is the single source of truth for persona state. A fresh device with
the persona nsec can fully restore the persona from this event alone.

### 5.3 kind 1 — posts (NIP-01, signed by persona)

Public, signed by the persona keypair. Standard kind-1 with attribution
tags:

- `["t", "phoenix"]` — discoverability
- `["t", "<region or cause>"]` — e.g. `rwanda`, `press-freedom`
- `["client", "phoenix"]` — client tag (auto-added by `useNostrPublish`)
- `["alt", "<short summary>"]` — accessibility/preview text

Posts with images use NIP-92 / NIP-94 `imeta` tags pointing at Blossom
URLs.

### 5.4 Media

| Asset             | Where it lives | Referenced from                      |
| ----------------- | -------------- | ------------------------------------ |
| Profile picture   | Blossom        | kind 0 `picture` + kind 30078        |
| Reference image   | Blossom        | kind 30078 (used to seed image gens) |
| Voice sample      | Blossom        | kind 0 `phoenix.voice_sample`        |
| Post images       | Blossom        | kind 1 `imeta` tags                  |
| Post audio (V1.5) | Blossom        | kind 1 `imeta` tags                  |

Voice samples are public (the persona's voice is its public asset), so no
encryption is needed on Blossom.

---

## 6. AI capabilities

All inference goes through **PPQ** (`https://api.ppq.ai`, OpenAI-compatible)
via `pi-ai`. PPQ accepts Lightning payment per request, paid by the
persona's Breeze wallet.

| Task                    | Default model    | Notes                                                       |
| ----------------------- | ---------------- | ----------------------------------------------------------- |
| Character-creator agent | claude-sonnet-4-5 | Multi-turn tool calling; runs the wizard interview         |
| Persona text styling    | claude-sonnet-4-5 | Raw thought → polished post in persona's voice             |
| Profile image           | gpt-image-1      | One-shot during creation; saved as canonical reference     |
| Post images             | gpt-image-1      | Always pass the reference image as input for likeness      |
| Voice sample            | tts-1-hd         | One generation during creation, ~10–20 s, saved to Blossom |
| Post audio (V1.5)       | tts-1-hd         | TTS each published post in the persona's voice             |
| Video (V2 stretch)      | TBD              | Decide once we know what PPQ proxies                       |

**Likeness consistency.** During wizard step 4 we generate the profile
image and save it as the canonical reference. Every subsequent image
generation passes that reference image as input alongside the prompt
(`gpt-image-1` supports image+text input). Cheap, no fine-tuning, ships in
a hackathon.

**Settings page — model selection per task.** Users can override the
default model for any of the tasks above on a per-persona basis. Selections
are persisted in the persona's encrypted kind 30078 event under
`model_prefs`. The settings page reads the list of available models from
PPQ's `/v1/models` endpoint at runtime so we don't have to hard-code it.

**Agent harness.** `pi-agent-core` runs the wizard's interview loop with
a small tool set:

- `propose_name(name, rationale)` — agent proposes; user approves/edits
- `propose_bio(bio)` — agent proposes a one-paragraph bio
- `propose_system_prompt(prompt)` — agent generates the persona's voice spec
- `generate_profile_image(prompt)` — calls the image model
- `generate_voice_sample(text, voice_id)` — calls the TTS model
- `finalize_persona()` — persists everything

`pi-web-ui` chat components render the conversation. The user can interrupt
at any tool call, edit the proposal, and continue.

---

## 7. Wallet & economics

### 7.1 Wallet model

One Breeze Lightning wallet **per persona**. Wallet seed is generated at
persona creation time and stored only inside the encrypted kind 30078
backup (and ephemerally in memory while the persona is active).

### 7.2 Receive

Each persona surfaces:

- A **Lightning Address** (`<persona-handle>@phoenix.example` — implementation
  via LNURL-pay endpoint resolving to the Breeze wallet; mechanism TBD in §10)
- An **LNURL** QR for direct invoice generation
- **NIP-57 zaps** — kind 0 advertises `lud16`, so existing Nostr clients
  can zap the persona natively

The public persona feed surfaces zap receipts (NIP-57 kind 9735 events) so
visitors can see donations as they arrive. This is the headline emotional
beat of the demo.

### 7.3 Spend

The wallet pays for:

- PPQ inference, on demand, per request
- Blossom uploads, if the chosen Blossom server is paid
- Nothing else without explicit user action

Phoenix never custodies funds. The seed lives only in the persona's
encrypted backup. Phoenix UI never shows the seed except during the
"download backup" flow.

### 7.4 Empty-wallet UX

When `balance < estimated_cost(action)`:

- AI-gated buttons (compose/style, image gen, TTS) are disabled with a
  tooltip: "This persona needs sats to think. Top up the wallet."
- A sticky banner offers a one-tap "Generate top-up invoice" sheet.
- Already-published content stays public and readable; the wallet running
  dry only stops *new* AI-mediated work.

### 7.5 Pricing model surfaced to user

Each AI-gated action shows an estimated cost in sats before the user
commits. Estimates come from PPQ's published per-model pricing, multiplied
by token estimates from `pi-ai`.

---

## 8. Scope tiers

### V1 — must ship for the demo

- [ ] Character-creator wizard with embedded `pi-agent-core` agent
- [ ] Persona keypair + NIP-49 local storage + relay backup (kind 30078)
- [ ] Per-persona Breeze wallet, seed inside the backup event
- [ ] Profile image generation with reference image saved
- [ ] Voice sample generation, stored on Blossom
- [ ] Multi-persona UX: list, switch, back up, restore
- [ ] Compose flow: thought → styled → kind 1 publish (text only)
- [ ] Post-image generation in compose flow (with reference image)
- [ ] Wallet UI: balance, receive (invoice + Lightning Address), tx history
- [ ] Wallet UI: send (initially just to top up other personas / pay back out)
- [ ] Donations visible on public persona feed (zap receipts)
- [ ] Settings page: per-task model override
- [ ] Public persona profile + feed (anyone can view, zap)
- [ ] Verify page: shows persona pubkey, signature provenance, post count

### V1.5 — ship if V1 is solid by hour 24

- [ ] TTS audio rendering of published posts
- [ ] LNURL-pay endpoint hosted (so Lightning Addresses resolve)
- [ ] Imigongo-rooted visual polish (palette, pattern, type pairing)
- [ ] PWA install prompt, service worker, offline shell

### V2 — stretch

- [ ] Video generation using persona likeness + voice
- [ ] NIP-46 remote signer support for power users
- [ ] Multi-language interview (Kinyarwanda + English at minimum)
- [ ] Brainstorm-from-sources flow (RSS in, candidate posts out)

### Explicitly out of scope

- A Phoenix-owned backend service that holds user data
- Server-side persona storage or "account recovery via email"
- Custodial wallet
- Centralized moderation, content filtering, or safety classifier in front
  of the persona's voice

---

## 9. Demo arc

A 5–7 minute live demo for HRF judges.

1. **Cold open (30 s).** Anaïse names a real activist who can't post under
   their real name. Sets the stakes. No slides yet.
2. **Build a persona live (90 s).** On stage, run the character-creator
   wizard end-to-end. Audience sees the agent ask questions, name appear,
   face appear, voice play.
3. **Fund and post (60 s).** Send 5,000 sats from a personal wallet to the
   new persona's Lightning Address. Compose a thought; the persona
   publishes. The persona's voice reads it aloud (V1.5 if shipped).
4. **The donation moment (60 s).** Show that anyone watching the demo can
   scan the QR on screen and zap the persona right now. Live zaps land on
   the persona's feed during the demo. *This is the emotional pivot.*
5. **The kill-and-resurrect moment (60 s).** Close the demo laptop. On a
   second device, log in to the persona using its nsec. The persona is
   still there, still funded, still publishable. The voice does not depend
   on us.
6. **Vision (30 s).** A persona is sustained for as long as anyone in the
   world is willing to spend sats on its voice. That's the product.

The "donation sustains the voice" beat replaces the original "kill the
styling endpoint" beat as the headline. It's stronger because it's
constructive, not just resilient.

---

## 10. Open research items

These need answers before or during early implementation. Each has a named
owner; if no name is attached yet, the team should claim one.

| # | Question                                                               | Why it matters                                                  |
| - | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1 | Which Breeze SDK variant — Liquid SDK, Greenlight, or Nodeless?        | Affects custody, latency, and whether we run any infrastructure |
| 2 | How do we host LNURL-pay endpoints for the personas' Lightning Addresses? | A per-persona LN address requires a server that resolves it. Could be a single shared domain, statically hosting LNURL JSON pointers per persona, served by Vercel or a Nostr relay. |
| 3 | PPQ payment flow — L402 macaroon, account credit, or per-request invoice? | Determines how `pi-ai` is configured and whether we need a persistent PPQ session |
| 4 | Voice model on PPQ — is `tts-1-hd` available, or do we need an alternative? | Locks the voice generation tool                                |
| 5 | Image model token costs at hackathon-scale demo traffic                | We need to know if ten image gens/persona is affordable        |
| 6 | NIP-49 passphrase UX — single passphrase per device or per persona?    | Trade-off between convenience and blast radius                 |
| 7 | Voice sample format and size budget                                    | MP3 32 kbps × 15 s ≈ 60 KB; OGG/Opus may be smaller and avoids MP3 patent baggage |
| 8 | Strategy for AI safety / abuse                                         | An anonymous voice with a wallet is also an abuse vector. What's our minimum-viable answer for judges? |

---

## 11. Project structure

The repo today is MKStack's React/Vite/Tailwind/Nostrify boilerplate plus
~10 files of an early operator/persona sketch. Reuse what fits the new
plan; remove or rewrite the rest.

**Reuse.**
- `src/App.tsx`, `src/AppRouter.tsx`, `src/main.tsx`, all of `src/components/ui/`
- `src/components/auth/*` (the LoginArea / AccountSwitcher already implement
  the multi-account UX we want)
- `src/components/{AppProvider,NostrProvider,NostrSync,ScrollToTop,ErrorBoundary}.tsx`
- `src/hooks/{useNostr,useNostrPublish,useAuthor,useCurrentUser,useLoggedInAccounts,useLoginActions,useUploadFile,useAppContext,useTheme,useToast,useLocalStorage,useIsMobile}.ts`
- `src/lib/{appBlossom,appRelays,utils,polyfills,genUserName}.ts`

**Rewrite.**
- `src/lib/persona.ts`, `personaCrypto.ts`, `personaKey.ts`, `personaPost.ts`
  → drop the operator/persona split; rewrite around the schema in §5
- `src/hooks/usePersona.ts`, `usePersonaPublish.ts`
  → conform to the new schema and the model-prefs settings
- `src/lib/styleClient.ts`
  → replace with a `pi-ai` PPQ client; remove the Vercel `/style` round-trip
- `src/pages/Onboard.tsx`
  → rebuild as the agent-driven character creator using `pi-web-ui`
- `src/pages/Dashboard.tsx`
  → integrate image generation, wallet status, model picker
- `src/pages/MyPersonas.tsx`, `PersonaFeed.tsx`, `Verify.tsx`
  → keep the page shape, rewire to the new schema

**New.**
- `src/lib/wallet.ts`, `src/hooks/useWallet.ts` — Breeze SDK integration
- `src/components/Wallet*.tsx` — wallet UI
- `src/lib/ppq.ts` — `pi-ai` client wrapper, model-pref aware
- `src/lib/agent.ts`, `src/components/CharacterCreator.tsx` — `pi-agent-core` wiring
- `src/pages/Settings.tsx` — model selection per task, relays, danger zone
- `src/components/DonateButton.tsx`, `src/components/ZapFeed.tsx`

**Delete.**
- The Vercel `/style` endpoint plan; `tasks/todo.md` and `tasks/lessons.md`
  references to it (and the operator/persona model)
- Any reference to OpenRouter

`tasks/todo.md` should be rewritten as a build plan for the scope in §8.
`AGENTS.md` should be amended with a "Phoenix-specific guidance" section
that points contributors at this document.

---

## 12. Team

Roles from the existing whiteboard, carried forward:

- **Anaïse** — Captain, product voice, demo lead, persona sign-off
- **Derek** — Frontend, Nostr integration, PWA shell
- **Jim** — LLM, agent harness, prompt engineering, model selection
- **Topher** — Wallet, PPQ payment plumbing, infrastructure (LNURL endpoint,
  Blossom hosting choice)

Pair up across role boundaries on anything that crosses them — the
wallet/agent/Nostr/image-gen seams are where bugs will live.

---

## 13. Glossary

- **Persona** — an AI-driven public identity with its own Nostr keypair,
  Lightning wallet, profile image, and voice. Owned and operated by one user.
- **Operator (deprecated)** — earlier scaffold concept of a separate human
  Nostr identity that signed for the persona. Removed in this plan.
- **PPQ** — `ppq.ai`. OpenAI-compatible inference API priced in sats over
  Lightning. The persona's wallet pays it directly.
- **pi-mono** — `github.com/earendil-works/pi`. Agent toolkit. We use
  `pi-agent-core` (runtime), `pi-ai` (LLM API), `pi-web-ui` (chat UI).
- **Breeze** — Lightning wallet SDK. Per-persona wallets, seed phrase
  recoverable from the encrypted kind 30078 backup.
- **NIP-44** — Nostr encrypted-payload spec. Used for the persona's
  encrypted backup event.
- **NIP-49** — passphrase-encrypted nsec format. Used for at-rest local
  storage of the persona's private key.
- **NIP-57** — Lightning zaps. The native Nostr donation mechanism, used
  for sustaining the persona.
- **Blossom** — content-addressed media server protocol used by Nostr
  clients. Voice samples and images live here.
- **Imigongo** — traditional Rwandan geometric art style. Visual motif
  carried forward from the existing scaffold for V1.5 polish.
