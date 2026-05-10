# PPQ (PayPerQ)

OpenAI-compatible inference API. Zuka routes **all** AI inference
through PPQ. Auth is via PPQ's **credits system**: a unique `credit_id`
per persona, funded with Lightning, auths every API request via a
bearer token tied to that credit_id.

> Zuka usage: `dev/PROJECT.md` §6 for per-task model defaults and §7
> for the wallet → PPQ payment story.

## Endpoint

- **Base URL:** `https://api.ppq.ai`
- **Compatibility:** Fully OpenAI-compatible. Any OpenAI client SDK
  works; override `baseURL` and `apiKey`.

## Authentication — Zuka uses credits

Zuka authenticates every PPQ request with a bearer token issued
when an account is created:

```
Authorization: Bearer ppq_<token>
```

The bearer is tied to a `credit_id` (the spending account). Lightning
top-ups buy credit on the credit_id; the bearer token is the proof of
ownership for the API.

**Flow:**

1. `POST /accounts/create` → `{ api_key, credit_id }`. Persist these.
2. `POST /topup/create/btc-lightning` → BOLT11 invoice. Pay it from
   the persona's Spark wallet to fund the credit_id.
3. `POST /nwc-auto-topup/connect` with the wallet's NIP-47 NWC URL →
   PPQ pulls the next chunk of credit on-demand whenever the balance
   dips below a configured threshold. Hands-off after this.
4. Use `Authorization: Bearer ppq_<token>` on every API request.

The credits system covers **the whole PPQ API surface** — chat,
image, audio, video, models list, etc.

### L402 — supported but not what Zuka uses

PPQ also supports L402 (`Authorization: L402 <token>:<preimage>` with
a `WWW-Authenticate: Payment` challenge-pay-replay) for per-request
Lightning auth. **L402 is only available on a subset of endpoints**
(image-gen, video-gen, image-edit, data-enrichment); the credits
system covers everything. Zuka uses credits across the board.

## Endpoints we use

| Endpoint                         | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `POST /chat/completions`         | Text generation (Claude, GPT, Gemini, etc.) — via `pi-ai`        |
| `POST /v1/images/generations`    | Image generation                                                 |
| `POST /v1/audio/speech`          | TTS — voice sample (V1) + post audio (V1.5)                      |
| `POST /v1/audio/transcriptions`  | STT (Deepgram Nova-3) — not used by Zuka yet                  |
| `POST /v1/videos`                | Video generation (V2 stretch)                                    |
| `GET  /v1/models`                | List available models (used by Settings)                         |
| `POST /accounts/create`          | Create a PPQ account (api_key + credit_id)                       |
| `POST /credits/balance`          | Read account balance                                             |
| `POST /topup/create/btc-lightning` | Get a Lightning invoice for credit top-up                      |
| `POST /nwc-auto-topup/connect`   | Wire a NIP-47 NWC URL for hands-off auto-topup                   |

## Default models per task

From `dev/PROJECT.md` §6. Operators override per-persona; selections
persist in the encrypted kind 30078 backup under `model_prefs`.

| Task                    | Default            | Endpoint                   |
| ----------------------- | ------------------ | -------------------------- |
| Persona text styling    | `claude-sonnet-4.5`| `/chat/completions`        |
| Profile / post image    | `gpt-image-1`      | `/v1/images/generations`   |
| Voice sample / TTS      | (deferred to V2)   | `/v1/audio/speech`         |
| Video (V2)              | TBD                | `/v1/videos`               |

### Voice models on PPQ (V2)

TTS is deferred to V2 per PROJECT.md §6 — no L402-compatible TTS
provider was identified, and V1 doesn't grow the credits surface for
voice features it isn't shipping. The notes below are reference for the
V2 work.

`/v1/audio/speech` is OpenAI-compatible. Two providers on PPQ:

- **DeepGram Aura 2** — named voices: `arcas`, `thalia`,
  `andromeda`, `helena`, `apollo`, `aries`. Max 2000 chars/request.
- **ElevenLabs** — `eleven_multilingual_v2`, `eleven_flash_v2_5`. Max
  5000 chars/request.

`tts-1-hd` is **not available** on PPQ — they migrated. The persona
schema in code currently has `model_prefs.tts` required with default
`"openai/tts-1-hd"`; this should be relaxed to `nullable().optional()`
when voice flows are explicitly punted to V2.

The Settings page reads `/v1/models` at runtime so we don't have to
hard-code the list.

## Pricing

- Pre-paid credit, topped up via Lightning (BOLT11), crypto, or card.
- Average ~2¢ per text query at hackathon-scale.
- Minimum top-up: 10¢.

## Already-resolved open items

- *Wallet variant*: Breez Spark SDK (locked).
- *PPQ payment*: credits system (above).
- *TTS availability*: DeepGram Aura 2 + ElevenLabs (above).
- *Image-gen cost at demo scale*: affordable.

## Source

- `ppq.ai` — site
- `ppq.ai/api-docs` — full API docs (credits, L402, model lists)
- `dev/PROJECT.md` §6 (AI capabilities), §7 (wallet → PPQ flow), §10
- `./pi-mono.md` — how `pi-ai` is configured against PPQ
