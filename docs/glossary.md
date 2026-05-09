# Glossary

> Lifted from PROJECT.md §13. If this disagrees with §13, §13 wins —
> update this file.

- **Persona** — an AI-driven public identity with its own Nostr keypair,
  Lightning wallet, profile image, and voice. Owned and operated by one user.

- **Operator (deprecated)** — earlier scaffold concept of a separate human
  Nostr identity that signed for the persona. Removed in the current plan.

- **PPQ** — `ppq.ai`. OpenAI-compatible inference API priced in sats over
  Lightning. The persona's wallet pays it directly. See `docs/ppq.md`.

- **pi-mono** — `github.com/earendil-works/pi`. Agent toolkit by
  earendil-works. Phoenix uses `pi-agent-core` (runtime), `pi-ai` (LLM API),
  `pi-web-ui` (chat UI). The repo was previously named `pi-mono` and the
  npm `homepage` metadata still points at the old URL — both redirect to
  the same place. See `docs/pi-mono.md`.

- **Breeze** — Lightning wallet SDK (`@breeztech/breez-sdk-liquid`).
  Per-persona wallets, seed phrase recoverable from the encrypted kind
  30078 backup. See `docs/breeze-sdk.md`.

- **NIP-44** — Nostr encrypted-payload spec. Used for the persona's
  encrypted backup event (kind 30078).

- **NIP-49** — passphrase-encrypted nsec format (`ncryptsec`). Used for
  at-rest local storage of the persona's private key.

- **NIP-57** — Lightning zaps. The native Nostr donation mechanism, used
  for sustaining the persona.

- **NIP-78** — Application-specific data (kind 30078). Used as the carrier
  for the encrypted persona backup.

- **NIP-92 / NIP-94** — `imeta` / file metadata tags on kind-1 posts that
  reference media on Blossom.

- **Blossom** — content-addressed media server protocol used by Nostr
  clients. Voice samples and images live here. See `docs/blossom.md`.

- **Nostrify** — `@nostrify/nostrify` and `@nostrify/react`. The Nostr
  framework already wired into the scaffold. See `docs/nostrify.md`.

- **MKStack** — the React/Vite/Tailwind/Nostrify boilerplate that Phoenix
  was scaffolded from.

- **Imigongo** — traditional Rwandan geometric art style. Visual motif
  carried forward from the existing scaffold for V1.5 polish.

## Source

- PROJECT.md §13 (canonical)
