# Glossary

- **Operator** — the human's Nostr identity. Signs
  encrypted persona backups (kind 30078) and nothing else under
  Zuka. Never publishes kind 0 or kind 1 under Zuka; to outside
  observers it's just a publisher of opaque ciphertext events. Can be
  a pre-existing Nostr identity (NIP-07 / NIP-46 / pasted nsec) or a
  fresh Zuka-generated keypair (stored locally as NIP-49 ncryptsec,
  one passphrase per device).

- **Persona keypair** — a separate Nostr keypair
  generated per persona. Publishes the persona's kind 0 (profile) and
  kind 1 (posts). The nsec is stored only inside the operator's
  encrypted kind 30078 backup; never written to disk by Zuka.

- **User keypair** — synonym for "operator" used in some passing prose;
  prefer "operator." Codebase (`src/lib/persona*.ts`) and design doc
  use "operator" canonically.

- **Persona** — an AI-driven public identity with its own Nostr keypair,
  Spark Lightning wallet, profile image, and voice. Owned and operated
  by one operator.

- **PPQ** — `ppq.ai`. OpenAI-compatible inference API. Zuka uses
  PPQ's credits system through encrypted credentials and wallet-funded
  topups. Operator-level actions use the operator envelope credentials;
  persona AI actions use credentials stored in that persona's encrypted
  backup. See `../dev/docs/ppq.md`.

- **pi-mono** — `github.com/earendil-works/pi`. Agent toolkit investigated
  for a future agent-driven wizard. It is not part of the current runtime
  dependency graph.

- **Spark / Breez Spark SDK** — `@breeztech/breez-sdk-spark`. Breez's
  wrapping of Lightspark's Spark protocol. Per-persona Lightning
  wallets, with a hosted Lightning Address at `breez.tips` (no
  self-hosted LNURL endpoint). BIP-39 seed recoverable from the
  encrypted kind 30078 backup. See `../dev/docs/breez-spark.md`.

- **NIP-44** — Nostr encrypted-payload spec. Used for the persona's
  encrypted backup event (self-encrypted to the operator).

- **NIP-49** — passphrase-encrypted nsec format (`ncryptsec`). Used for
  at-rest local storage of the operator nsec when the operator wants a
  fresh Zuka-generated identity rather than bringing their own.

- **NIP-57** — Lightning zaps. The native Nostr donation mechanism, used
  for sustaining the persona.

- **NIP-78** — Application-specific data (kind 30078). Used as the
  carrier for the encrypted persona backup.

- **NIP-92 / NIP-94** — `imeta` / file metadata tags on kind-1 posts that
  reference media on Blossom.

- **L402** — Lightning HTTP 402 protocol. Pay-per-request flow:
  unauthenticated request → `402 Payment Required` + `WWW-Authenticate:
  Payment` + Lightning invoice → pay → replay with
  `Authorization: L402 <token>:<preimage>`. PPQ supports L402 on a
  subset of endpoints (image / video gen). **Zuka does not use
  L402** — the credits system covers everything; included here for
  completeness only.

- **Blossom** — content-addressed media server protocol used by Nostr
  clients. Profile pictures and post media live here. See
  `../dev/docs/blossom.md`.

- **Nostrify** — `@nostrify/nostrify` and `@nostrify/react`. The Nostr
  framework already wired into the scaffold. See `../dev/docs/nostrify.md`.

- **MKStack** — the React/Vite/Tailwind/Nostrify boilerplate that Zuka
  was scaffolded from. The current app build uses explicit esbuild,
  Tailwind CLI, node:test, and Biome tooling.

- **Imigongo** — traditional Rwandan geometric art style. Visual motif
  carried forward from the existing scaffold for V1.5 polish.

## Source

- [`PRODUCT.md`](./PRODUCT.md)
- [`THREAT-MODEL.md`](./THREAT-MODEL.md)
- [`PERSONA-SCHEMA.md`](./PERSONA-SCHEMA.md)
