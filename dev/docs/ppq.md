# PPQ (PayPerQ)

OpenAI-compatible inference API. Zuka routes AI inference through PPQ. Auth is
via PPQ's credits system: a `credit_id` plus bearer token. Current production
credentials are stored in the encrypted operator envelope and topups are paid
from the selected Spark wallet.

> Current Zuka usage: see `docs/DATA-FLOW.md`, `docs/PRODUCT.md`, and
> `src/hooks/usePpqAccount.ts`.

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
2. `POST /topup/create/btc-lightning` -> BOLT11 invoice. Pay it from the
   selected Spark wallet to fund the credit_id.
3. Optional `POST /nwc-auto-topup/connect` with a wallet NIP-47 NWC URL wires
   PPQ-managed auto-topup. The current app-owned wallet path orchestrates
   topups through `useWallet` and `lib/wallet/autoTopup.ts`.
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
| `POST /chat/completions`         | Text generation (Claude, GPT, Gemini, etc.)        |
| `POST /v1/images/generations`    | Image generation                                                 |
| `POST /v1/audio/speech`          | TTS reference endpoint; not part of current release UX            |
| `POST /v1/audio/transcriptions`  | STT (Deepgram Nova-3) — not used by Zuka yet                  |
| `POST /v1/videos`                | Video generation                                                  |
| `GET  /v1/models`                | List available models                                             |
| `POST /accounts/create`          | Create a PPQ account (api_key + credit_id)                       |
| `POST /credits/balance`          | Read account balance                                             |
| `POST /topup/create/btc-lightning` | Get a Lightning invoice for credit top-up                      |
| `POST /nwc-auto-topup/connect`   | Wire a NIP-47 NWC URL for hands-off auto-topup                   |

## Default models per task

Defaults are defined in source and can be persisted in encrypted kind 30078
backups under `model_prefs`.

| Task                    | Default            | Endpoint                   |
| ----------------------- | ------------------ | -------------------------- |
| Persona text styling    | `claude-sonnet-4.5`| `/chat/completions`        |
| Profile / post image    | `gpt-image-1`      | `/v1/images/generations`   |
| Voice sample / TTS      | not exposed in release UX | `/v1/audio/speech` |
| Video                   | `seedance-2-fast` via pipeline code | `/v1/videos` |

### Voice models on PPQ (V2)

TTS is not exposed in the current release UX. The notes below are reference for
future work.

`/v1/audio/speech` is OpenAI-compatible. Two providers on PPQ:

- **DeepGram Aura 2** — named voices: `arcas`, `thalia`,
  `andromeda`, `helena`, `apollo`, `aries`. Max 2000 chars/request.
- **ElevenLabs** — `eleven_multilingual_v2`, `eleven_flash_v2_5`. Max
  5000 chars/request.

`tts-1-hd` availability should be verified before any future audio feature uses
it; PPQ model availability changes over time.

Model listing is available through the client for future model-picker work.

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
- `docs/PRODUCT.md` — product scope
- `docs/DATA-FLOW.md` — current PPQ call paths
