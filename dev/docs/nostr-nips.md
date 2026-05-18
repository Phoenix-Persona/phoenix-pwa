# Nostr NIPs used by Zuka

One-paragraph summary of every NIP Zuka touches, plus the event-kind
cheat sheet. For the full text, fetch the NIP from
`github.com/nostr-protocol/nips`.

## NIPs

### NIP-01 — Basic protocol
Defines the `event` object (id, pubkey, created_at, kind, tags, content,
sig), the wire protocol (`EVENT`, `REQ`, `CLOSE` from clients;
`EVENT`, `OK`, `EOSE`, `CLOSED`, `NOTICE` from relays), and filter syntax.
Kind ranges:

- `0`–`2`, `4`–`44`, `1000`–`9999` — **regular** (stored)
- `0`, `3`, `10000`–`19999` — **replaceable** (only latest kept)
- `20000`–`29999` — **ephemeral** (not stored)
- `30000`–`39999` — **addressable** (latest by `kind`+`pubkey`+`d` tag)

Zuka's kind 30078 is addressable; kind 0 is replaceable; kind 1 is regular.

### NIP-44 — Encrypted Payloads (Versioned)
Used for encrypted operator and persona backups (kind 30078, encrypted to the
operator's own pubkey). Version 2 uses secp256k1 ECDH -> HKDF ->
ChaCha20 + HMAC-SHA256, base64-encoded. Plaintext is padded to obscure
length. **Audited by Cure53 (Dec 2023).**

Use the signer's NIP-44 helpers (Nostrify exposes these on the signer
class) — do not roll your own.

### NIP-49 — Private Key Encryption (`ncryptsec`)
At-rest passphrase encryption for fresh Zuka-generated operator nsecs.
Format: `scrypt(password, salt, log_n, r=8, p=1)` → 32-byte symmetric
key → XChaCha20-Poly1305 over the raw 32-byte private key, bech32-encoded
with prefix `ncryptsec`. Output before bech32 is 91 bytes.

`log_n` controls difficulty (16 ≈ 100ms / 64MiB; 20 ≈ 2s / 1GiB).

Zuka uses one passphrase per device for fresh generated operator keys.

### NIP-57 — Lightning Zaps
Donation flow. Two events:

- **kind 9734** — *zap request*, signed by sender, **not published**;
  POSTed via GET to the recipient's LNURL-pay `callback` as a `nostr=`
  query parameter. The recipient's lnurl server returns a BOLT11 invoice
  whose description hash commits to this event.
- **kind 9735** — *zap receipt*, published by the recipient's lnurl
  server after the invoice is paid. Surfaced on the public persona feed.

For Zuka to **receive** zaps natively, persona kind 0 must advertise `lud16`
(Lightning Address). Zuka uses Breez's hosted `breez.tips` LNURL server rather
than a Zuka-hosted LNURL endpoint.

### NIP-78 — Application-specific data (kind 30078)
Used for the persona's encrypted backup. `d` tag = an opaque random UUID
**stable per persona** (generated once at creation, stored inside the
encrypted plaintext as `persona.dTag`, reused on every update so
addressable-event semantics replace the prior version). No other tags.
Content is NIP-44 ciphertext encrypted to the user's own pubkey. The lack of any Zuka-identifying tag means a
backup is externally indistinguishable from any other NIP-78 app data;
discovery is scan-and-decrypt. Schema lives in `docs/PERSONA-SCHEMA.md`.

### NIP-92 — Media Attachments (`imeta` tag)
Adds inline metadata to a media URL referenced in event content. Zuka
uses it on kind 1 posts that include images or audio. Each `imeta` tag is
variadic, space-delimited:

```json
["imeta",
  "url https://blossom.example/<sha256>.jpg",
  "m image/jpeg",
  "x <sha256>",
  "alt <description>",
  "dim 1024x1024"]
```

### NIP-94 — File Metadata (kind 1063)
Companion to NIP-92. Defines the field set used inside `imeta`: `url`, `m`
(MIME), `x` (sha256), `ox` (original sha256), `size`, `dim`, `blurhash`,
`thumb`, `image`, `summary`, `alt`, `fallback`, etc.

## Event-kind cheat sheet

| Kind   | Purpose                  | NIP   | Zuka uses              |
| ------ | ------------------------ | ----- | ------------------------- |
| `0`    | User metadata            | 01    | Persona public profile    |
| `1`    | Short text note          | 01/10 | Persona posts             |
| `1063` | File metadata            | 94    | Companion to imeta        |
| `9734` | Zap request              | 57    | Sender → lnurl server     |
| `9735` | Zap receipt              | 57    | Donations on persona feed |
| `24242`| Blossom auth token       | Blossom | Upload auth             |
| `30078`| Application data         | 78    | Encrypted persona backup  |

## Tags Zuka uses

| Tag       | Where         | Value                                            |
| --------- | ------------- | ------------------------------------------------ |
| `d`       | kind 30078    | opaque UUID, stable per persona (`persona.dTag`) |
| `t`       | kind 1        | Optional topical discovery tags. Zuka does not add app-identifying `t` tags. |
| `imeta`   | kind 1        | Per attachment (NIP-92)                          |
| `p`       | kind 9734/5   | Recipient pubkey                                 |
| `e`       | kind 9734/5   | Event being zapped (optional)                    |
| `bolt11`  | kind 9735     | The invoice that was paid                        |
| `amount`  | kind 9734     | Millisats, stringified                           |

## Source

- `github.com/nostr-protocol/nips`
- `docs/PERSONA-SCHEMA.md`
- `docs/THREAT-MODEL.md`
