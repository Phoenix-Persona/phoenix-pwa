# PPQ (PayPerQ)

Pay-per-query, OpenAI-compatible inference API. Phoenix routes **all** AI
inference through PPQ (text, image, TTS) and the persona's Lightning wallet
pays for it.

> Phoenix usage: see PROJECT.md §6 for the per-task model defaults.

## Endpoint

- **Base URL:** `https://api.ppq.ai`
- **Auth:** `Authorization: Bearer ppq_<token>` (issue and rotate from your
  PPQ account dashboard)
- **Compatibility:** Fully OpenAI-compatible. Any OpenAI client SDK works;
  just override `baseURL` and `apiKey`.

## Endpoints we use

| Endpoint                | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `POST /chat/completions`| Text generation (Claude, GPT, etc.)       |
| `POST /images`          | Image generation (`gpt-image-1`)          |
| `POST /audio/speech`    | TTS for voice sample + post audio (V1.5)  |
| `GET  /models`          | List available models — used by Settings  |

The Settings page reads `/models` at runtime (§6) so we never have to hard-code
a list.

## Payment model

- Pre-paid account credit, topped up via Lightning, crypto, or card.
- Per-request billing; no subscription. Average ~2¢ per text query at
  hackathon-scale traffic.
- Minimum top-up: 10¢.

**Open question (PROJECT.md §10 #3):** the exact payment surface Phoenix
will use — L402 macaroon, account credit, or per-request invoice — is not
yet decided. Topher owns this.

## Default models per task

From PROJECT.md §6. Users override per-persona; selections persist in the
encrypted kind 30078 backup under `model_prefs`.

| Task                    | Default            |
| ----------------------- | ------------------ |
| Character-creator agent | `claude-sonnet-4.5`|
| Persona text styling    | `claude-sonnet-4.5`|
| Profile / post image    | `gpt-image-1`      |
| Voice sample / TTS      | `tts-1-hd`         |
| Video (V2)              | TBD                |

## Open items to verify

- §10 #4: `tts-1-hd` availability on PPQ — confirm before locking the voice
  generation tool.
- §10 #5: image-gen token cost at demo traffic — budget exercise before
  the demo.

## Source

- ppq.ai — main site, account dashboard, full API docs at `/api-docs`
- PROJECT.md §6 (AI capabilities), §10 (open research items)
