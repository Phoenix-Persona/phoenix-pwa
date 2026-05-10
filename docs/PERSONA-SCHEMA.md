# Persona schema

Three Nostr events per persona, plus media on Blossom. **Source of truth:
`dev/PROJECT.md` §5.** This doc is a cheat-sheet — if it disagrees with
§5, §5 wins; update this file.

## kind 0 — public profile (signed by *persona*, NIP-01)

Standard kind-0 metadata, plus a Zuka-specific namespace generic
clients can ignore.

```json
{
  "name": "Imani",
  "display_name": "Imani Uwase",
  "about": "Voice of Rwanda. Press freedom, civil society, the long memory.",
  "picture": "https://blossom.example/<sha256>.png",
  "lud16": "imani@spark.money",
  "lud06": "lnurl1...",
  "nip05": "imani@example.com",
  "phoenix": {
    "voice_sample": "https://blossom.example/<sha256>.mp3",
    "reference_image": "https://blossom.example/<sha256>.png",
    "version": 1
  }
}
```

Replaceable event — only the latest is kept by relays. The `lud16`
Lightning Address is provided natively by the Spark SDK (Breez's
hosted `spark.money` LNURL server) — no Zuka-hosted endpoint needed.

## kind 30078 — encrypted persona backup (signed by *operator*, one per persona)

Addressable replaceable event published by the **operator** (the human
keypair, see §3). One event per persona; updates to a persona republish
its event with the **same** `d` tag, so addressable-event semantics
apply and relays keep only the latest version.

### Tags (per `dev/PROJECT.md` §5.2)

| Tag | Value                          | Purpose                                                                  |
| --- | ------------------------------ | ------------------------------------------------------------------------ |
| `d` | `<random opaque uuid>`, stable | Required for addressable-event addressing (NIP-01, kind 30078 ∈ 30000–39999). Generated once at persona creation, stored inside the encrypted plaintext as `persona.dTag`, reused on every update. The value is **opaque** — no Zuka signal, no link to the persona pubkey. |

**No other tags.** A `t` or `alt` tag would help relay observers
fingerprint Zuka events. Externally a Zuka backup is
indistinguishable from any other NIP-78 application-data event.

### Content

NIP-44 ciphertext encrypted to the **operator's own pubkey**
(self-encryption: author and conversation key derive from the same
keypair).

### Plaintext payload

```json
{
  "version": 1,
  "persona": {
    "pubkey": "<persona pubkey, hex>",
    "nsec": "<persona private key, hex>",
    "dTag": "<opaque random uuid; generated once at creation>",
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
    "tts": null,
    "video": null
  },
  "settings": {
    "default_relays": ["wss://relay.damus.io", "..."]
  }
}
```

This is the **single source of truth** for persona state. A fresh
device holding only the operator nsec can fully restore every persona
under that operator from these events alone.

### Loading personas on a fresh device (per §5.2)

1. Operator logs in with their operator nsec (NIP-07 / NIP-46 / paste).
2. App queries:
   ```js
   { kinds: [30078], authors: [operator_pubkey] }
   ```
   No Zuka-specific filter — adding one would leak app usage. The
   query may surface kind-30078 events from other apps; those fail
   decryption or schema validation and are discarded.
3. For each event, decrypt content via the operator's signer (NIP-44
   self-decrypt) and validate against Zuka's payload schema.
4. Surviving events are already deduplicated by relay (addressable
   semantics: one event per `(operator_pubkey, kind, d-tag)`), so
   each persona is represented exactly once. Group by
   `persona.pubkey` from the decrypted plaintext.
5. The decrypted payload yields the persona keypair, wallet seed,
   reference image URL, `persona.dTag`, etc.
6. Persona nsec is held in memory for the session; never written to
   disk.

### Updating a persona

Republish a kind 30078 event with the **same** d-tag as the prior
event (read from the decrypted `persona.dTag`) and the new ciphertext.
Relays replace the prior version per addressable-event semantics; only
the latest is stored. The d-tag never changes for the lifetime of a
persona.

## kind 1 — posts (signed by *persona*, NIP-01)

Public, signed by the persona keypair. **No Zuka-identifying tags.**
A Zuka-published persona post is indistinguishable on the wire from
any other kind-1 note.

| Tag        | Value                                            | Notes                              |
| ---------- | ------------------------------------------------ | ---------------------------------- |
| `t`        | region, e.g. `rwanda`                            | Topical discovery only             |
| `t`        | cause, e.g. `press-freedom`                      | Topical discovery only             |
| `r`        | source URL (repeatable)                          | Source attribution                 |
| `imeta`    | per-attachment metadata (NIP-92)                 | For posts with media on Blossom    |

Deliberately omitted: `t=phoenix`, `client=phoenix`, operator pubkey
tags, persona name in `alt`, any other Zuka-fingerprinting tag. The
persona's kind 0 bio is the right place to disclose AI usage;
individual posts stay metadata-clean. See `src/lib/personaPost.ts:1-19`.

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

| Aspect           | Spec (`dev/PROJECT.md` §5.2)                    | Code (`src/lib/persona.ts`)                                    |
| ---------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `model_prefs.tts`| **deferred to V2**; `null` when unset           | required `z.string().min(1).max(120)`; default `"openai/tts-1-hd"`. To reconcile, relax the field to `nullable().optional()` when voice flows are removed/postponed. |

The `app:` discriminator and `persona.dTag` field are aligned with the
spec in current code (`PHOENIX_PAYLOAD_APP = "phoenix-persona"`,
`persona.dTag` stored at creation and reused on update).

## Source

- `dev/PROJECT.md` §5 (canonical for the planned schema)
- `src/lib/persona.ts`, `src/lib/personaCrypto.ts` (canonical for what
  the code actually does today)
- `docs/guides/nostr-nips.md` (NIP-01, NIP-44, NIP-78, NIP-92, NIP-94)
- `docs/guides/blossom.md` (media storage)
