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

Phoenix uses a **two-level identity** model.

**Operator.** A single Nostr keypair owned by the human running the
app. It never posts publicly under Phoenix. Its only job is to sign
encrypted backups (kind 30078, §5.2) for the personas this operator
has created. The operator keypair can be:

- An existing Nostr identity (NIP-07 extension, NIP-46 remote signer, or
  pasted nsec) — useful for operators who already have a Nostr account
  and want one place to manage everything.
- A fresh Phoenix-generated keypair — useful for operators who want
  their Phoenix activity unlinkable from any other Nostr identity. In
  this case Phoenix never publishes a kind 0 profile under the operator
  keypair, so to outside observers the operator pubkey is just a
  publisher of opaque ciphertext.

**Persona keypairs.** Each persona is a separate Nostr keypair generated
during the character-creator wizard. The persona's nsec publishes kind 0
(profile) and kind 1 (posts). Personas are publicly visible; they are the
voices.

**The relationship is encrypted-only.** A persona's nsec is stored only
inside the operator's encrypted kind 30078 backup event (NIP-44'd to the
operator keypair). To outside observers, relays show:

- N persona pubkeys posting publicly, each independently
- The operator pubkey publishing N opaque ciphertext events

Linking a specific persona to its operator requires the operator's nsec.
As long as the operator keypair is safe, *which* personas are this
operator's is unknowable.

**What does leak: the persona count.** A relay observer can see that
`operator_pubkey` has authored N kind-30078 events with N distinct
d-tag values, and infer "this operator runs N addressable items."
Phoenix backup events carry no Phoenix-identifying tags (no `t`, no
`alt`), so the observer cannot tell those items are Phoenix backups
specifically — they look identical to any other NIP-78
application-data event. Phoenix participation is only knowable to
anyone who already has the operator's nsec.

**Compartmentalization.** All personas under a single operator share
one fate: anyone who compromises that operator nsec can decrypt every
persona's backup and operate every voice. For activists who need
persona groups that can't fall together, the answer is **separate
operator keypairs per group** — but multi-operator complexity is V2.
For V1, Phoenix is **one operator per device**.

**Multi-persona UX.** When the operator is logged in, the app fetches
all kind 30078 events authored by the current operator pubkey,
attempts NIP-44 self-decryption on each, keeps the ones whose
plaintext validates as a Phoenix envelope (events from other apps
fail decryption or schema validation and are discarded), and presents
the persona list. Switching personas swaps which persona nsec the
composer signs with — no separate "login" per persona.

**Key custody.**

- *Operator nsec*. For operators bringing an existing Nostr identity,
  custody is whatever signer they use (NIP-07, NIP-46, etc.). For
  fresh Phoenix-generated operator keypairs, stored locally as NIP-49
  (passphrase-encrypted) — **one passphrase per device**, applied to
  the operator nsec.
- *Persona nsec*. Never written to disk by Phoenix. Lives only inside
  the operator's encrypted kind 30078 backup. When the operator opens
  a persona, Phoenix fetches the event from relays, decrypts it via
  the operator's signer (NIP-44 self-decrypt), holds the persona nsec
  in memory, and uses it to sign that session's posts.
- *Recovery on a new device*. Operator logs in with the operator nsec;
  app re-fetches all kind 30078 events authored by them, decrypts
  each, filters to valid Phoenix envelopes; every persona is
  re-hydrated in one step.
- *Loss of operator nsec*. Every persona under that operator is
  unrecoverable. The wizard surfaces a one-time "download operator
  backup" affordance.

**Why two-level rather than persona-only.** A persona-only model would
mean each persona has its own root nsec the operator must safeguard
separately, multi-device sync requires copying every persona's nsec to
every device, and losing one persona's nsec loses that persona's
wallet entirely. The two-level model collapses safekeeping to one
root secret while preserving the public unlinkability of personas.
The trade-off is shared fate among personas under the same operator;
mitigated (V2) with separate operator keypairs per unlinkable group.

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
│  │   - Breez Spark SDK (Lightning wallet, LN address, zaps)   │  │
│  │   - Blossom client  (media uploads — voice, images)        │  │
│  └──┬──────────────┬───────────────┬───────────────┬──────────┘  │
└─────┼──────────────┼───────────────┼───────────────┼─────────────┘
      │              │               │               │
      ▼              ▼               ▼               ▼
  ┌────────┐   ┌──────────┐   ┌──────────────┐  ┌──────────────┐
  │  PPQ   │   │  Nostr   │   │   Lightning  │  │   Blossom    │
  │ ppq.ai │   │  relays  │   │   network    │  │   servers    │
  │        │   │          │   │  (via Spark) │  │              │
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
| Lightning wallet | `@breeztech/breez-sdk-spark` (Breez SDK — Spark / Nodeless variant) | Per-persona wallet, BIP-39 seed inside the encrypted backup. WASM in browser; needs `await init()` before any SDK call. Native Lightning Address (no self-hosted LNURL endpoint). API key via `VITE_BREEZ_API_KEY`. |
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

### 5.2 kind 30078 — encrypted persona backup (signed by *operator*, one per persona)

Addressable replaceable event published by the **operator** (the human
keypair, see §3). One event per persona; updates to a persona republish
its event with the **same** `d` tag, so addressable-event semantics
apply and relays keep only the latest version.

Tags:

- `["d", "<random opaque uuid>"]` — **stable per persona**, generated
  once at persona creation, stored inside the encrypted plaintext as
  `persona.dTag`, and reused on every update. The `d` tag is required
  by NIP-01 for kind 30078 (addressable range 30000–39999); its value
  here is **opaque** — it carries no Phoenix-identifying signal and
  no link to the persona pubkey. Each persona under an operator gets
  its own d-tag, so the relay sees N distinct addressable items
  (= the operator's persona count); this count leak is acknowledged
  in §3.

**No other tags.** A `t` tag would advertise Phoenix usage; an `alt`
tag would advertise "encrypted backup"; both would help observers
fingerprint Phoenix events. Externally a Phoenix kind-30078 event is
indistinguishable from any other NIP-78 application-data event
(Coracle settings, Damus prefs, etc.).

Content: NIP-44 ciphertext encrypted to the **operator's own pubkey**
(self-encryption: author and conversation key derive from the same
keypair).

Plaintext payload:

```json
{
  "version": 1,
  "persona": {
    "pubkey": "<persona pubkey, hex>",
    "nsec": "<persona private key, hex>",
    "dTag": "<opaque random uuid; generated once at creation, reused on every update>",
    "name": "Imani Uwase",
    "system_prompt": "...full persona system prompt...",
    "voice_id": "thalia",
    "voice_sample_url": "https://blossom.example/<sha256>.mp3",
    "reference_image_url": "https://blossom.example/<sha256>.png",
    "languages": ["en", "rw"],
    "tags": ["rwanda", "press-freedom"],
    "created_at": 1715212800
  },
  "wallet": {
    "kind": "spark",
    "seed": "<bip39 mnemonic>",
    "lightning_address": "imani@spark.money",
    "lnurl": "lnurl1..."
  },
  "model_prefs": {
    "styling": "claude-sonnet-4.5",
    "image": "gpt-image-1",
    "tts": "deepgram-aura-2",
    "video": null
  },
  "settings": {
    "default_relays": ["wss://relay.damus.io", "..."]
  }
}
```

**Loading personas on a fresh device.**

1. Operator logs in with their operator nsec (NIP-07 / NIP-46 / paste).
2. App queries `{ kinds: [30078], authors: [operator_pubkey] }` — no
   Phoenix-specific filter, since adding one would leak app usage. The
   query may surface kind-30078 events from other apps (Coracle
   settings, Damus prefs, etc.); they fail decryption (different
   conversation key) or fail Phoenix's payload schema and are
   discarded.
3. For each event, decrypt content via the operator's signer (NIP-44
   self-decrypt) and validate against Phoenix's payload schema.
4. Surviving events are already deduplicated by relay (addressable
   semantics: one event per `(operator_pubkey, kind, d-tag)` triple),
   so each persona is represented exactly once. Group by
   `persona.pubkey` from the decrypted plaintext.
5. The decrypted payload yields the persona keypair, wallet seed,
   reference image URL, `persona.dTag`, etc.
6. Persona nsec is held in memory for the session; never written to
   disk by Phoenix.

**Updating a persona.** Republish a kind 30078 event with the **same**
d-tag as the prior event (read from the decrypted `persona.dTag`) and
the new ciphertext. Relays replace the prior version per
addressable-event semantics; only the latest is stored. The d-tag
never changes for the lifetime of a persona.

**Why one event per persona instead of one event holding all personas.**
Per-persona events keep updates surgical (changing one persona's wallet
balance reference doesn't republish the entire user's persona set), and
they let the discovery query stream in as relays return them, instead of
blocking on a single large payload.

### 5.3 kind 1 — posts (NIP-01, signed by persona)

Public, signed by the persona keypair. **No Phoenix-identifying tags.**
A Phoenix-published persona post is indistinguishable on the wire from
any other kind-1 note. Tags are limited to content-discovery and
attribution:

- `["t", "<region>"]` — e.g. `rwanda` (topical discovery only).
- `["t", "<cause>"]` — e.g. `press-freedom` (topical discovery only).
- `["r", "<source-url>"]` (repeatable) — source attribution.
- `["imeta", ...]` — per-attachment metadata for posts with media
  (NIP-92, pointing at Blossom URLs).

Deliberately omitted: `t=phoenix`, `client=phoenix`, operator pubkey
tags, persona name in `alt`, any other Phoenix-fingerprinting tag. The
persona's kind 0 bio is the right place to disclose AI usage;
individual posts stay metadata-clean. See `src/lib/personaPost.ts:1-19`.

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
via `pi-ai`. Phoenix uses PPQ's **credits system**: each persona has
its own `credit_id` (PPQ account), funded via Lightning from the
persona's Spark wallet. NIP-47 NWC keeps the credit_id topped up
hands-off — Phoenix hands PPQ the wallet's NWC URL once at persona
creation, and PPQ pulls the next chunk of credit whenever the balance
dips below a threshold. Every API request authenticates with the
bearer token tied to that credit_id; one auth surface for the whole
PPQ API. (PPQ also supports L402 per-request, but only on a subset of
endpoints; credits are simpler and complete.) See
`docs/guides/ppq.md` for the PPQ surface and `docs/guides/pi-mono.md`
for how `pi-ai` is configured against it.

| Task                    | Default model    | Notes                                                       |
| ----------------------- | ---------------- | ----------------------------------------------------------- |
| Persona text styling    | claude-sonnet-4.5 | Raw thought → polished post in persona's voice             |
| Profile picture         | upload OR `gpt-image-1` | User uploads an image OR generates one via PPQ during the wizard. The chosen image is saved to Blossom and referenced as the canonical likeness for subsequent post-image generation. |
| Post images             | gpt-image-1      | Always pass the reference image as input for likeness      |
| Voice sample            | `deepgram-aura-2` (or ElevenLabs) | One-shot during creation, ~10–20 s, saved to Blossom. PPQ exposes DeepGram Aura 2 (named voices: `arcas`, `thalia`, `andromeda`, `helena`, `apollo`, `aries`) and ElevenLabs (`eleven_multilingual_v2`, `eleven_flash_v2_5`) at `/v1/audio/speech`. `tts-1-hd` is no longer the default — PPQ migrated. |
| Post audio (V1.5)       | `deepgram-aura-2` (or ElevenLabs) | TTS each published post in the persona's voice            |
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

**Agent harness — deferred to V2.** V1 ships a **form-based**
character-creator wizard. The operator fills in name, region, cause,
languages, system prompt, and source URLs through ordinary form
inputs; Phoenix calls `pi-ai` for sample-post styling and image
generation, plus `/v1/audio/speech` directly for the one-shot voice
sample — but does not run an LLM-driven interview.

The agent harness below is the V2 design: `pi-agent-core` would run
the wizard with a small tool set (`propose_name(name, rationale)`,
`propose_bio(bio)`, `propose_system_prompt(prompt)`,
`generate_profile_image(prompt)`, `generate_voice_sample(text, voice_id)`,
`finalize_persona()`), with `pi-web-ui` rendering the conversation
surface. See `docs/guides/pi-mono.md` for the integration shape when
we revisit.

---

## 7. Wallet & economics

### 7.1 Wallet model

One Spark Lightning wallet **per persona**, via the Breez Spark SDK
(`@breeztech/breez-sdk-spark`). The wallet seed is a BIP-39 mnemonic
generated at persona creation time and stored only inside the
encrypted kind 30078 backup (and ephemerally in memory while the
persona is active). The SDK runs in the browser as WebAssembly —
`await init()` is required once at app boot, after which each
persona's wallet is reconstituted by passing its seed to the SDK's
`SdkBuilder` config.

### 7.2 Receive

Each persona surfaces:

- A **Lightning Address** (e.g. `imani@spark.money`) — provided
  natively by the Spark SDK via Breez's hosted LNURL server. **No
  self-hosted LNURL endpoint required.** Phoenix calls
  `sdk.registerLightningAddress({ username, description })` at persona
  creation; the resulting address is published in the persona's kind
  0 `lud16` field and stored in the encrypted backup under
  `wallet.lightning_address`.
- An **LNURL** QR for direct invoice generation, also exposed by the
  SDK.
- **NIP-57 zaps** — kind 0 advertises `lud16`, so existing Nostr
  clients can zap the persona natively.

The public persona feed surfaces zap receipts (NIP-57 kind 9735
events) so visitors can see donations as they arrive. This is the
headline emotional beat of the demo.

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

- [ ] Form-based character-creator wizard (agent harness deferred to V2)
- [ ] Operator nsec via NIP-07 / NIP-46 / paste OR fresh local NIP-49 (one passphrase per device)
- [ ] Persona keypair + kind 30078 backup with stable per-persona d-tag
- [ ] Per-persona Spark wallet (Breez Spark SDK), BIP-39 seed inside the backup event
- [ ] Profile picture: user uploads OR generates via PPQ (`gpt-image-1`); saved as canonical reference
- [ ] Voice sample generation via PPQ (`/v1/audio/speech`, DeepGram Aura 2 or ElevenLabs), stored on Blossom
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
- [ ] Imigongo-rooted visual polish (palette, pattern, type pairing)
- [ ] PWA install prompt, service worker, offline shell

### V2 — stretch

- [ ] Agent-driven character-creator wizard (`pi-agent-core` interview)
- [ ] Video generation using persona likeness + voice
- [ ] NIP-46 remote signer support for power users
- [ ] Multi-operator-per-device (separate operator keypairs per persona group)
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

**Already resolved:**

- *Wallet SDK*: locked to **`@breeztech/breez-sdk-spark`** (Breez SDK
  Spark / Nodeless variant). Lightning Addresses are SDK-native via
  Breez's hosted `spark.money` LNURL server — no Phoenix-hosted
  endpoint required.
- *PPQ payment*: Phoenix uses PPQ's **credits system** — Lightning
  top-ups buy credit on a per-persona `credit_id`, and every API
  request authenticates with the bearer token tied to that credit_id.
  NWC (NIP-47) auto-topup from the persona's Spark wallet keeps the
  credit_id funded hands-off. PPQ also supports L402 per-request, but
  only on a subset of endpoints; the credits system covers the entire
  API and is what Phoenix uses everywhere.
- *Image-gen cost at demo scale*: affordable; budget enables ten image
  generations per persona during the demo without concern.
- *NIP-49 passphrase UX*: **one passphrase per device**, applied to the
  operator nsec only. Multi-operator-per-device is a V2 stretch.
- *Voice generation*: PPQ supports TTS via `/v1/audio/speech` with
  DeepGram Aura 2 (named voices: `arcas`, `thalia`, `andromeda`,
  `helena`, `apollo`, `aries`) and ElevenLabs
  (`eleven_multilingual_v2`, `eleven_flash_v2_5`). `tts-1-hd` is no
  longer the default — pick one of the above. Voice sample (V1) and
  post-audio TTS (V1.5) stay in scope.

| # | Question                              | Why it matters                                                                      |
| - | ------------------------------------- | ----------------------------------------------------------------------------------- |
| 1 | Strategy for AI safety / abuse        | An anonymous voice with a wallet is also an abuse vector. The judges' question to anticipate: "doesn't this enable mass disinformation / scam personas?" Answer combines (a) cost-throttling — bad actors burn sats; donations sustain real voices, (b) pseudonymous-not-anonymous — relay-level mute / block / labels still apply, (c) upstream LLM safety inherited via PPQ, (d) Verify page surfaces persona age / post count. Owner: Anaïse for demo positioning. |

---

## 11. Project structure

The repo today is MKStack's React/Vite/Tailwind/Nostrify boilerplate plus
an early sketch of the user-signs-encrypted-persona-event scheme — which
matches the architecture in §3 closely. Most of the persona files need
adaptation, not a full rewrite. Replace what the new stack obsoletes.

**Reuse as-is.**
- `src/App.tsx`, `src/AppRouter.tsx`, `src/main.tsx`, all of `src/components/ui/`
- `src/components/auth/*` (LoginArea / AccountSwitcher already implement
  the multi-account UX we need for both user and persona switching)
- `src/components/{AppProvider,NostrProvider,NostrSync,ScrollToTop,ErrorBoundary}.tsx`
- `src/hooks/{useNostr,useNostrPublish,useAuthor,useCurrentUser,useLoggedInAccounts,useLoginActions,useUploadFile,useAppContext,useTheme,useToast,useLocalStorage,useIsMobile}.ts`
- `src/lib/{appBlossom,appRelays,utils,polyfills,genUserName}.ts`

**Reuse with adaptation.** Architecture matches §3; update to §5 schema:
- `src/lib/persona.ts`, `personaCrypto.ts`, `personaKey.ts`, `personaPost.ts`
  → align the persona Zod schema to the §5.2 plaintext payload (add
  `persona.dTag` field for the stable per-persona d-tag, switch
  `wallet.kind` from `breeze` to `spark`, drop voice fields, embed
  the Spark wallet seed, the `model_prefs` section). The current code
  uses a fresh random UUID per publish — switch to a stable d-tag
  stored inside the encrypted plaintext so addressable-event semantics
  apply on update. The no-other-tags scheme already matches.
- `src/hooks/usePersona.ts`, `usePersonaPublish.ts`
  → query by user pubkey + t-tag; multi-persona switching surfaces
- `src/pages/MyPersonas.tsx`, `PersonaFeed.tsx`, `Verify.tsx`
  → keep page shape; rewire to §5 schema

**Rewrite.**
- `src/pages/Onboard.tsx`
  → rebuild as the agent-driven character creator using `pi-web-ui`
- `src/pages/Dashboard.tsx`
  → integrate image generation, wallet status, model picker

**Replace.**
- `src/lib/styleClient.ts` → `src/lib/ppq.ts` (wraps `pi-ai`, no Vercel
  endpoint; persona's wallet pays PPQ directly)

**New.**
- `src/lib/wallet/{client,init,types,autoTopup}.ts`, `src/hooks/useWallet.ts` — Breez Spark SDK integration (already prototyped on `jc/add-spark-wallet`)
- `src/components/Wallet*.tsx` — wallet UI
- `src/lib/agent.ts`, `src/components/CharacterCreator.tsx` — `pi-agent-core` wiring
- `src/pages/Settings.tsx` — model selection per task, relays, danger zone
- `src/components/DonateButton.tsx`, `src/components/ZapFeed.tsx`

**Delete.**
- Any reference to OpenRouter and the Vercel `/style` endpoint plan

`tasks/todo.md` should be rewritten as a build plan for the scope in §8.
`AGENTS.md` should be amended with a "Phoenix-specific guidance" section
that points contributors at this document.

---

## 12. Team

Roles after the wallet → PPQ stream merge (see `STREAMS.md`):

- **Anaïse** — Captain, product voice, demo lead, persona sign-off
- **Derek** — Frontend, Nostr integration, PWA shell; persona harnesses
  (operator, persona-crypto, publish, feed) and composite leads
  (persona-create, persona-restore)
- **Jim** — PPQ + Wallet + Payments + Settings (Stream A; owns the
  wallet → PPQ end-to-end demo)
- **Topher** — Agent (`pi-mono` runtime), LLM consumers (styling,
  image-gen, voice-gen), donations (LNURL/zaps) — Stream B

Pair up across role boundaries on anything that crosses them — the
wallet/agent/Nostr/image-gen seams are where bugs will live.

---

## 13. Glossary

- **Persona** — an AI-driven public identity with its own Nostr keypair,
  Spark Lightning wallet, profile image, and voice. Owned and operated
  by one operator.
- **Operator** — the human's Nostr identity. Signs encrypted persona
  backups (kind 30078); never publishes kind 0 or kind 1 under
  Phoenix. See §3 for the full two-level identity model.
- **User keypair** — synonym for "operator" used in some passing prose;
  prefer "operator."
- **PPQ** — `ppq.ai`. OpenAI-compatible inference API. Phoenix uses
  PPQ's **credits system**: a per-persona `credit_id` funded by
  Lightning from the persona's Spark wallet (NWC auto-topup) auths
  every API request via a bearer token. (L402 per-request is also
  supported by PPQ but only on a subset of endpoints; not Phoenix's
  path.) See `docs/guides/ppq.md`.
- **pi-mono** — `github.com/earendil-works/pi`. Agent toolkit. V1 uses
  `pi-ai` (LLM client) only; `pi-agent-core` and `pi-web-ui` are
  reserved for the V2 agent-driven wizard.
- **Spark / Breez Spark SDK** — `@breeztech/breez-sdk-spark`,
  Breez's wrapping of Lightspark's Spark protocol. Provides per-persona
  Lightning wallets with a hosted Lightning Address at `spark.money`
  (no self-hosted LNURL endpoint).
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
