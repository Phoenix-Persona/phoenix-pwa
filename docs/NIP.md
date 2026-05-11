# Custom event kinds

This document tracks Nostr event kinds that Zuka defines for use cases not
covered by an existing NIP. Per AGENTS.md, every custom kind documented here
must:

- Be in the addressable, replaceable, regular, or ephemeral range as appropriate.
- Carry a NIP-31 `["alt", "..."]` tag in every published instance.
- Be the result of `nostr_generate_kind` (no arbitrary numbering).

---

## Kind 34011 — Audio asset set (addressable)

**Status:** Used internally by the Zuka project to publish curated background
audio for video composition. Not a draft NIP, not intended for general
ecosystem use; if a NIP-51 audio-curation set lands upstream we should migrate.

**Range:** Addressable (30000–39999). One set per `(pubkey, "d")`; replacement
on republish.

**Why a custom kind.** No existing NIP-51 list type covers a curated set of
audio files referenced by URL with inline labels:

- 30005 (NIP-51 video curation set) requires `e` tags pointing to kind-21
  video events — wrong media type and wrong tag shape.
- 30003 (NIP-51 bookmark set) only accepts `e` (kind-1 notes) and `a` (kind
  30023 articles); URLs aren't first-class.
- 1063 (NIP-94 file metadata) is one event per file, not a list. It would
  work as a backing layer if a future client wants per-file integrity proofs
  separately addressable, but the Zuka video composer wants a single
  addressable list with inline label+URL pairs.

### Required tags

| Tag | Format | Purpose |
|---|---|---|
| `d` | `["d", "<identifier>"]` | Set identifier (e.g. `"zuka-bg-music-v1"`). Combined with `pubkey` and `kind`, addresses the set. |
| `title` | `["title", "<human title>"]` | Display name (NIP-51 set convention). |
| `alt` | `["alt", "<short description>"]` | NIP-31 fallback description for clients that can't render the kind. |

### Optional tags

| Tag | Format | Purpose |
|---|---|---|
| `description` | `["description", "<longer text>"]` | Multi-sentence description (NIP-51 set convention). |
| `image` | `["image", "<url>"]` | Cover art URL (NIP-51 set convention). |
| `t` | `["t", "<topic>"]` | Topical tags. Recommended values: `"audio-set"`, plus content-specific topics (`"music"`, `"sfx"`, `"voiceover"`). Single-letter so relays index it. |

### `track` tag

Each member of the set is one `["track", url, label, mime, sha256, size]` tag:

| Position | Field | Notes |
|---|---|---|
| 1 | `url` | https-only. Blossom-hosted URL recommended (content-addressed, integrity-checkable against position 4). |
| 2 | `label` | Display name. UTF-8, ≤ 120 chars. Not unique. |
| 3 | `mime` | RFC 2046 MIME type (`audio/mpeg`, `audio/wav`, `audio/ogg`, etc.). |
| 4 | `sha256` | Hex SHA-256 of the file bytes at `url`. Clients SHOULD verify on download. |
| 5 | `size` | File size in bytes (decimal string). |

### Content

Free-form description of the set. Not required to be machine-parseable.

### Client behavior

- **Read.** Query for `kind: 34011, authors: [pubkey], "#d": ["<identifier>"]`.
  Iterate `track` tags in order; that order is the intended playback / display
  order.
- **Replace.** Republish kind 34011 with the same `d` tag to update the set.
  Relays apply NIP-01 addressable replacement semantics.
- **Verify.** SHOULD verify SHA-256 after download to detect Blossom mirrors
  serving stale/altered content.

### Example

```json
{
  "kind": 34011,
  "tags": [
    ["d", "zuka-bg-music-v1"],
    ["title", "Zuka background music"],
    ["description", "Background audio tracks shipped with Zuka video composition"],
    ["alt", "Zuka background music — 5 tracks"],
    ["t", "zuka"],
    ["t", "music"],
    ["t", "audio-set"],
    ["track", "https://blossom.ditto.pub/e99018fd…5095.mpga", "Afrobeat upbeat (30s)", "audio/mpeg", "e99018fd…5095", "481534"],
    ["track", "https://blossom.ditto.pub/c7fbac01…8c9d.mpga", "Afrobeats × lofi (30s)", "audio/mpeg", "c7fbac01…8c9d", "480698"]
  ],
  "content": "5 royalty-free background tracks for short-form video composition."
}
```
