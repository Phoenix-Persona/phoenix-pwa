# Persona Schema

Zuka stores persona state in Nostr events and Blossom media. The source of
truth is the code in `src/lib/persona.ts`, `src/lib/personaProfile.ts`,
`src/lib/personaPost.ts`, and `src/lib/personaCrypto.ts`.

## kind 0: Public Profile

Signed by the persona keypair. Uses standard Nostr metadata fields plus a
Zuka-specific `phoenix` namespace that generic clients can ignore.

```json
{
  "name": "voice-of-rwanda",
  "display_name": "Voice of Rwanda",
  "about": "Press freedom, civil society, and the long memory.",
  "picture": "https://blossom.example/<sha256>.png",
  "bot": true,
  "lud16": "voice-of-rwanda@breez.tips",
  "phoenix": {
    "reference_image": "https://blossom.example/<sha256>.png",
    "version": 1
  }
}
```

`lud16` is present only when persona Lightning Address registration succeeds.
Operator wallets do not publish or configure Lightning Addresses.

## kind 30078: Encrypted Persona Backup

Signed by the operator. One addressable event is published per persona. Updates
reuse the same stable `d` tag so relays keep the latest event for each persona.

### Tags

| Tag | Purpose |
| --- | --- |
| `["d", "<opaque random uuid>"]` | Required addressable-event identifier. Generated once, stored as `persona.dTag`, and reused on update. |

No `t`, `alt`, app, operator, or persona-identifying tags are published on the
backup event. Discovery is scan-and-decrypt over the operator's own kind 30078
events.

### Content

NIP-44 ciphertext encrypted to the operator's own pubkey. The plaintext is a
JSON envelope with an app discriminator:

```json
{
  "app": "phoenix-persona",
  "version": 1,
  "persona": {
    "pubkey": "<persona pubkey, hex>",
    "nsec": "nsec1...",
    "dTag": "<opaque random uuid>",
    "name": "Voice of Rwanda",
    "username": "voice-of-rwanda",
    "display_name": "Voice of Rwanda",
    "system_prompt": "...full persona system prompt...",
    "reference_image_url": "https://blossom.example/<sha256>.png",
    "created_at": 1715212800,
    "bio": "Public bio",
    "tone": "Direct and calm",
    "sources": [{ "kind": "url", "url": "https://example.com" }],
    "cross_post": {
      "webhook_url": "https://hooks.example/zuka",
      "webhook_platforms": ["x", "facebook"]
    }
  },
  "wallet": {
    "kind": "spark",
    "seed": "<bip39 mnemonic>",
    "lightning_address": "voice-of-rwanda@breez.tips",
    "lnurl": "lnurl1...",
    "auto_topup": {
      "enabled": true,
      "threshold_usd": 1,
      "topup_amount_usd": 5,
      "funding_source": "persona"
    }
  },
  "ppq": {
    "credit_id": "credit_...",
    "api_key": "ppq_..."
  },
  "model_prefs": {
    "agent": "anthropic/claude-sonnet-4.5",
    "image": "openai/gpt-image-1",
    "tts": "openai/tts-1-hd",
    "video": null
  },
  "settings": {
    "default_relays": ["wss://relay.damus.io"]
  }
}
```

`ppq` stores the persona's own PPQ credit account. Persona AI actions
such as composer styling, AI Assist, research, image generation, post wizard,
and video generation use this account instead of the operator's PPQ
credentials. If a persona backup does not have `ppq`, the first persona AI
action mints a PPQ account and republishes the same encrypted backup with the
new field.

Validation happens after decrypting:

1. Parse JSON.
2. Check discriminator, version, field shapes, and length limits.
3. Decode `persona.nsec`.
4. Derive the persona pubkey and ensure it matches `persona.pubkey`.

Invalid or non-Zuka kind 30078 events are discarded.

## kind 1: Persona Posts

Signed by the persona keypair. Zuka deliberately avoids app-identifying tags.

| Tag | Purpose |
| --- | --- |
| `r` | Source attribution URL. |
| `imeta` | NIP-92 media metadata for Blossom-hosted images or videos. |

The post builder omits `client`, `phoenix`, operator pubkey, and persona-name
tags to avoid fingerprinting the app or linking the persona to the operator.

## Media

| Asset | Storage | Reference |
| --- | --- | --- |
| Profile picture | Blossom | kind 0 `picture`, kind 0 `phoenix.reference_image`, encrypted backup `persona.reference_image_url` |
| Post image | Blossom | kind 1 `imeta` |
| Generated video | Blossom | kind 1 `imeta`, URL appended to content for clients that do not render `imeta` |

Voice/audio fields are not part of the current persisted persona schema. They
can be added later without changing existing backups.
