# Persona schema

Three Nostr events per persona, plus media on Blossom. **Source of truth:
`dev/PROJECT.md` §5.** This doc is a cheat-sheet — if it disagrees with
§5, §5 wins; update this file.

## kind 0 — public profile (signed by *persona*, NIP-01)

Standard kind-0 metadata, plus a Phoenix-specific namespace generic
clients can ignore.

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

Replaceable event — only the latest is kept by relays.

## kind 30078 — encrypted persona backup (signed by *user*, one per persona)

Addressable replaceable event published by the **user keypair** (not the
persona). One event per persona; updates to one persona republish only
its own event.

### Tags (per `dev/PROJECT.md` §5.2)

| Tag | Value                       | Purpose                                                                  |
| --- | --------------------------- | ------------------------------------------------------------------------ |
| `d` | `<random uuid>` per publish | Required for addressable-event addressing (NIP-01, kind 30078 ∈ 30000–39999). The value carries no semantics. |

**No other tags.** A `t` or `alt` tag would help relay observers
cluster a user's kind-30078 events. The app finds and dedups personas
by reading the **decrypted** `persona.pubkey`, so no tag-level
discovery is needed. Externally a Phoenix backup is indistinguishable
from any other app's encrypted-app-data event.

### Content

NIP-44 ciphertext encrypted to the **user's own pubkey** (self-encryption:
author and conversation key derive from the same keypair).

### Plaintext payload

```json
{
  "version": 1,
  "persona": {
    "pubkey": "<persona pubkey, hex>",
    "nsec": "<persona private key, hex>",
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
    "agent": "claude-sonnet-4.5",
    "image": "gpt-image-1",
    "tts": "tts-1-hd",
    "video": null
  },
  "settings": {
    "default_relays": ["wss://relay.damus.io", "..."]
  }
}
```

This is the **single source of truth** for persona state. A fresh device
holding only the user nsec can fully restore every persona under that
user from these events alone.

### Loading personas on a fresh device (per §5.2)

1. User logs in with their user nsec (NIP-07 / NIP-46 / paste).
2. App queries:
   ```js
   { kinds: [30078], authors: [user_pubkey] }
   ```
   No Phoenix-specific filter — adding one would leak app usage. The
   query may surface kind-30078 events from other apps the user uses;
   those fail decryption or schema validation and are discarded.
3. For each event, decrypt content via the user's signer (NIP-44
   self-decrypt) and validate against Phoenix's payload schema.
4. Group surviving events by `persona.pubkey` from the decrypted
   plaintext; keep the newest event per persona pubkey. (Each
   persona-update creates a new event with a fresh d-tag; relays do
   not replace.)
5. The decrypted payload yields the persona keypair, wallet seed, voice
   URL, etc.
6. Persona nsec is held in memory for the session; never written to disk.

### Updating a persona

Publish a new kind 30078 event with a fresh random d-tag and the new
ciphertext. Old versions remain on relays as opaque ciphertext; the
discovery loop above groups by decrypted `persona.pubkey` and surfaces
only the newest event per persona, so the app sees only the current
state. Trade-off: relay storage grows over time — fine for hackathon
scale; revisit if it becomes a problem.

## kind 1 — posts (signed by *persona*, NIP-01)

Public, signed by the persona keypair. Standard kind-1 with these tags
(per §5.3):

| Tag        | Value                                            |
| ---------- | ------------------------------------------------ |
| `t`        | `phoenix` — discoverability                      |
| `t`        | region/cause, e.g. `rwanda`, `press-freedom`     |
| `client`   | `phoenix` (auto-added by `useNostrPublish`)      |
| `alt`      | Short summary for accessibility / preview        |
| `imeta`    | Per-attachment metadata (NIP-92)                 |

Posts with images use NIP-92 / NIP-94 `imeta` tags pointing at Blossom
URLs.

## Media

| Asset             | Where it lives | Referenced from                       |
| ----------------- | -------------- | ------------------------------------- |
| Profile picture   | Blossom        | kind 0 `picture` + kind 30078         |
| Reference image   | Blossom        | kind 30078 (seeds future image gens)  |
| Voice sample      | Blossom        | kind 0 `phoenix.voice_sample`         |
| Post images       | Blossom        | kind 1 `imeta` tags                   |
| Post audio (V1.5) | Blossom        | kind 1 `imeta` tags                   |

Voice samples are public — no encryption on Blossom.

## Code-vs-doc divergence

The kind-30078 tag scheme above (random-UUID d-tag, no other tags) now
matches both `dev/PROJECT.md` §5.2 and the code in `src/lib/persona.ts`.
The remaining divergence is the plaintext payload shape:

| Aspect    | `dev/PROJECT.md` §5.2                              | `src/lib/persona.ts` (code)                                   |
| --------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Discriminator | `app: "phoenix-persona"` (in nested envelope) | `app: "phoenix"` on `main`; `app: "phoenix-persona"` on `topher` |
| Shape     | `persona`/`wallet`/`model_prefs`/`settings` blocks | flatter shape on `main`; nested `config` block on `topher`    |

The code's payload predates §5.2's expansion (wallet seed,
`model_prefs`). When the persona schema is next touched, the
`persona.ts` Zod schema should be updated to match §5.2.

## Source

- `dev/PROJECT.md` §5 (canonical for the planned schema)
- `src/lib/persona.ts`, `src/lib/personaCrypto.ts` (canonical for what
  the code actually does today)
- `docs/guides/nostr-nips.md` (NIP-01, NIP-44, NIP-78, NIP-92, NIP-94 details)
- `docs/guides/blossom.md` (media storage)
