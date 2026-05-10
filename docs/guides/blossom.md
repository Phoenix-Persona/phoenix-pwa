# Blossom

Content-addressed media protocol for Nostr. Blobs are addressed by their
sha256 hash and served over HTTP. Auth uses Nostr-signed events instead of
traditional credentials.

> Zuka usage: profile picture, reference image, voice sample, post
> images, post audio (PROJECT.md §5.4). Voice samples are public — no
> encryption needed at rest on Blossom.

## Endpoints

| Method | Path                  | Purpose                                          |
| ------ | --------------------- | ------------------------------------------------ |
| `GET`  | `/<sha256>`           | Retrieve blob (optional file extension allowed)  |
| `HEAD` | `/<sha256>`           | Existence check                                  |
| `PUT`  | `/upload`             | Upload a new blob                                |
| `DELETE`| `/<sha256>`          | Delete (owner only)                              |
| `PUT`  | `/mirror`             | Mirror a blob from another server                |
| `GET`  | `/list/<pubkey>`      | List a user's blobs (per BUDs, "unrecommended")  |
| `HEAD`/`PUT` | `/media`        | Media optimization endpoints                     |

## Authentication

Uploads and other authenticated requests use **Nostr event kind `24242`**
as an authorization token (BUD-11). The client signs a kind 24242 event
describing the action (`upload`, `delete`, etc.) and the blob's sha256, then
includes it as base64 in an `Authorization` header.

This means the persona signs its own uploads — no separate Blossom account.

## BUD specs (Blossom Upgrade Documents)

- **BUD-01** — server requirements, retrieval
- **BUD-02** — upload and management
- **BUD-11** — Nostr-based authorization (kind 24242)

Full list: `github.com/hzrd149/blossom`.

## How Zuka uses it

| Asset             | Where it lives | Referenced from                          |
| ----------------- | -------------- | ---------------------------------------- |
| Profile picture   | Blossom        | kind 0 `picture` + kind 30078            |
| Reference image   | Blossom        | kind 30078 (seeds future image gens)     |
| Voice sample      | Blossom        | kind 0 `phoenix.voice_sample`            |
| Post images       | Blossom        | kind 1 `imeta` tags (NIP-92)             |
| Post audio (V1.5) | Blossom        | kind 1 `imeta` tags                      |

The scaffold already wraps uploads via `useUploadFile`
(`src/hooks/useUploadFile.ts`) and `src/lib/appBlossom.ts`. The reference-image
flow (PROJECT.md §6 "Likeness consistency") needs the **upload sha256
preserved** so subsequent image generations can pass the canonical reference
image as input.

## Related Nostr events

- **kind 24242** — auth tokens (BUD-11)
- **kind 10063** — user's preferred Blossom server list
- **NIP-92 / NIP-94** — `imeta` tags pointing at Blossom URLs in posts.
  See `docs/guides/nostr-nips.md`.

## Source

- `github.com/hzrd149/blossom` — protocol spec and BUDs
- PROJECT.md §5.4 (media), §6 (likeness consistency), §11 (existing
  `appBlossom.ts`, `useUploadFile.ts`)
