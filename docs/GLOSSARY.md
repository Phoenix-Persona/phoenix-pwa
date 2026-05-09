# Glossary

> Mirrors `dev/PROJECT.md` §13, with corrections where §13 contradicts §3.
> Source of truth is `dev/PROJECT.md`; if this disagrees, that wins —
> update this file.

- **User keypair** *(PROJECT.md §3)* — the human's Nostr identity.
  Signs encrypted persona backups (kind 30078) and nothing else under
  Phoenix. Never publishes kind 0 or kind 1 under Phoenix; to outside
  observers it's just a publisher of opaque ciphertext events. Can be a
  pre-existing Nostr identity (NIP-07 / NIP-46 / pasted nsec) or a
  fresh Phoenix-generated keypair (stored locally as NIP-49 ncryptsec).

- **Persona keypair** *(PROJECT.md §3)* — a separate Nostr keypair
  generated per persona. Publishes the persona's kind 0 (profile) and
  kind 1 (posts). The nsec is stored only inside the user keypair's
  kind 30078 backup; never written to disk by Phoenix.

- **Operator** — earlier name for the user keypair. The codebase
  (`src/lib/persona*.ts`) uses "operator"; the master plan uses "user".
  Same role. PROJECT.md §13 calls this term "deprecated" but §3 still
  describes the role under the new name — it was renamed, not removed.

- **Persona** — an AI-driven public identity with its own Nostr keypair,
  Lightning wallet, profile image, and voice. Owned and operated by one
  user keypair.

- **PPQ** — `ppq.ai`. OpenAI-compatible inference API priced in sats over
  Lightning. The persona's wallet pays it directly. See `docs/guides/ppq.md`.

- **pi-mono** — `github.com/earendil-works/pi`. Agent toolkit. Phoenix
  plans to use `pi-agent-core` (runtime), `pi-ai` (LLM API), `pi-web-ui`
  (chat UI). Agent-harness wiring is currently deferred — see
  `docs/guides/pi-mono.md`.

- **Breeze** — Lightning wallet SDK (`@breeztech/breez-sdk-liquid`).
  Per-persona wallets, seed phrase recoverable from the encrypted kind
  30078 backup. Integration still pending. See `docs/guides/breeze-sdk.md`.

- **NIP-44** — Nostr encrypted-payload spec. Used for the persona's
  encrypted backup event (self-encrypted to the user keypair).

- **NIP-49** — passphrase-encrypted nsec format (`ncryptsec`). Used for
  at-rest local storage of the user keypair when the user wants a fresh
  Phoenix-generated identity rather than bringing their own.

- **NIP-57** — Lightning zaps. The native Nostr donation mechanism, used
  for sustaining the persona.

- **NIP-78** — Application-specific data (kind 30078). Used as the carrier
  for the encrypted persona backup.

- **NIP-92 / NIP-94** — `imeta` / file metadata tags on kind-1 posts that
  reference media on Blossom.

- **Blossom** — content-addressed media server protocol used by Nostr
  clients. Voice samples and images live here. See `docs/guides/blossom.md`.

- **Nostrify** — `@nostrify/nostrify` and `@nostrify/react`. The Nostr
  framework already wired into the scaffold. See `docs/guides/nostrify.md`.

- **MKStack** — the React/Vite/Tailwind/Nostrify boilerplate that Phoenix
  was scaffolded from.

- **Imigongo** — traditional Rwandan geometric art style. Visual motif
  carried forward from the existing scaffold for V1.5 polish.

## Source

- `dev/PROJECT.md` §3 (identity model — canonical for the user/persona
  vocabulary)
- `dev/PROJECT.md` §13 (canonical for everything else)
