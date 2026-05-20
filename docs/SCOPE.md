# Scope

What is in the release, what is deferred, and what Zuka should not build.

## Current Release

- Form-based persona creation.
- Operator login via generated nsec, pasted nsec, extension, bunker, or
  nostrconnect.
- Fresh Zuka-generated operator nsecs stored as NIP-49 `ncryptsec`, one
  passphrase per device.
- Operator-scoped encrypted kind 30078 state for operator wallet and PPQ
  credentials.
- Persona keypair plus encrypted kind 30078 backup with stable per-persona
  `d` tag.
- Per-persona Breez Spark wallet with BIP-39 seed inside the encrypted backup.
- Persona Lightning Address registration and public kind 0 `lud16`.
- Multi-persona list, dashboard, edit, delete, backup, and restore flows.
- Compose flow: idea to styled kind 1 post, signed by the persona.
- Post wizard, research assist, profile AI assist, and image generation through
  PPQ.
- Video pipeline: preview image, PPQ video chain, Blossom upload, caption, and
  kind 1 publish with NIP-92 `imeta`.
- Wallet UI: balance, receive invoice, Lightning Address for persona wallets,
  send invoice, payment history, PPQ credits, and auto-topup settings.
- Public persona profile/feed with replies, reactions, and zap receipt display.
- Settings page for account, relays, Blossom servers, and Nostr viewer.
- PWA shell, service worker, install prompt, and Capacitor native shells.
- Integration test suite with local relay and HTTP harnesses.

## Deferred

- Agent-driven character-creator interview.
- Multi-operator-per-device UX.
- Dedicated public attestation/verify page.
- First-class TTS/audio rendering of published posts.
- Multi-language interview flow.
- Brainstorm-from-sources flow beyond the current research panel.
- Removing the standing PPQ credits model in favor of pure L402, if PPQ exposes
  L402 for chat completions later.

## Explicitly Out Of Scope

Do not build these without a deliberate product decision:

- A Zuka-owned backend service that stores user data.
- Server-side persona storage.
- Account recovery through email, support, or any path that bypasses the
  operator key.
- Custodial wallet behavior.
- Centralized moderation or content filtering in front of persona speech.

## Agent Heuristics

- If a request adds a backend that stores user data, stop and flag the scope
  change.
- If a request adds account recovery that does not require the operator key,
  stop and flag the custody change.
- If a request weakens operator/persona unlinkability, review
  [`THREAT-MODEL.md`](./THREAT-MODEL.md) before implementation.
- If a request changes custom Nostr schemas, update [`NIP.md`](./NIP.md) and
  [`PERSONA-SCHEMA.md`](./PERSONA-SCHEMA.md).
