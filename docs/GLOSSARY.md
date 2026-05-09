# Glossary

> Mirrors `dev/PROJECT.md` §13. Source of truth is `dev/PROJECT.md`; if
> this disagrees, that wins — update this file.

- **Operator** *(PROJECT.md §3)* — the human's Nostr identity. Signs
  encrypted persona backups (kind 30078) and nothing else under
  Phoenix. Never publishes kind 0 or kind 1 under Phoenix; to outside
  observers it's just a publisher of opaque ciphertext events. Can be
  a pre-existing Nostr identity (NIP-07 / NIP-46 / pasted nsec) or a
  fresh Phoenix-generated keypair (stored locally as NIP-49 ncryptsec,
  one passphrase per device).

- **Persona keypair** *(PROJECT.md §3)* — a separate Nostr keypair
  generated per persona. Publishes the persona's kind 0 (profile) and
  kind 1 (posts). The nsec is stored only inside the operator's
  encrypted kind 30078 backup; never written to disk by Phoenix.

- **User keypair** — synonym for "operator" used in some passing prose;
  prefer "operator." Codebase (`src/lib/persona*.ts`) and design doc
  use "operator" canonically.

- **Persona** — an AI-driven public identity with its own Nostr keypair,
  Spark Lightning wallet, and profile image. Owned and operated by one
  operator.

- **PPQ** — `ppq.ai`. OpenAI-compatible inference API. Supports L402
  (`Authorization: L402 <token>:<preimage>` with `WWW-Authenticate:
  Payment` challenge-pay-replay) and account-credit bearer tokens; the
  persona's Spark wallet pays either way. See `docs/guides/ppq.md`.

- **pi-mono** — `github.com/earendil-works/pi`. Agent toolkit. V1 uses
  **`pi-ai`** (LLM client) only. `pi-agent-core` (agent runtime) and
  `pi-web-ui` (chat surface) are reserved for the V2 agent-driven
  wizard. See `docs/guides/pi-mono.md`.

- **Spark / Breez Spark SDK** — `@breeztech/breez-sdk-spark`. Breez's
  wrapping of Lightspark's Spark protocol. Per-persona Lightning
  wallets, with a hosted Lightning Address at `spark.money` (no
  self-hosted LNURL endpoint). BIP-39 seed recoverable from the
  encrypted kind 30078 backup. See `docs/guides/breeze-sdk.md`.

- **NIP-44** — Nostr encrypted-payload spec. Used for the persona's
  encrypted backup event (self-encrypted to the operator).

- **NIP-49** — passphrase-encrypted nsec format (`ncryptsec`). Used for
  at-rest local storage of the operator nsec when the operator wants a
  fresh Phoenix-generated identity rather than bringing their own.

- **NIP-57** — Lightning zaps. The native Nostr donation mechanism, used
  for sustaining the persona.

- **NIP-78** — Application-specific data (kind 30078). Used as the
  carrier for the encrypted persona backup.

- **NIP-92 / NIP-94** — `imeta` / file metadata tags on kind-1 posts that
  reference media on Blossom.

- **L402** — Lightning HTTP 402 protocol. Pay-per-request flow:
  unauthenticated request → `402 Payment Required` + `WWW-Authenticate:
  Payment` + Lightning invoice → pay → replay with
  `Authorization: L402 <token>:<preimage>`. Phoenix uses this against
  PPQ for image / video generation.

- **Blossom** — content-addressed media server protocol used by Nostr
  clients. Profile pictures and post media live here. See
  `docs/guides/blossom.md`.

- **Nostrify** — `@nostrify/nostrify` and `@nostrify/react`. The Nostr
  framework already wired into the scaffold. See `docs/guides/nostrify.md`.

- **MKStack** — the React/Vite/Tailwind/Nostrify boilerplate that Phoenix
  was scaffolded from.

- **Imigongo** — traditional Rwandan geometric art style. Visual motif
  carried forward from the existing scaffold for V1.5 polish.

## Source

- `dev/PROJECT.md` §3 (identity model — canonical)
- `dev/PROJECT.md` §13 (canonical for everything else)
