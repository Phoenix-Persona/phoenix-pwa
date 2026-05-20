# Zuka

[![CI](https://github.com/zuka-org/zuka-pwa/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/zuka-org/zuka-pwa/actions/workflows/ci.yml)
[![Security](https://github.com/zuka-org/zuka-pwa/actions/workflows/security.yml/badge.svg?branch=dev)](https://github.com/zuka-org/zuka-pwa/actions/workflows/security.yml)

Zuka is a Nostr-native PWA for creating and operating AI personas with their
own public identity, Lightning wallet, media, and posting voice.

It is built for activists, dissidents, writers, and anyone who needs a public
voice that is not tied to their legal identity. The operator manages personas
privately; each persona publishes publicly under its own Nostr keypair.

## What Zuka Does

- Creates independent persona Nostr keypairs and public profiles.
- Stores persona configuration, persona keys, wallet seeds, and PPQ credentials
  in encrypted Nostr kind 30078 backups.
- Gives each persona a Breez Spark Lightning wallet for donations and AI
  funding.
- Uses PPQ for AI-assisted writing, image generation, research, and video
  workflows.
- Publishes text and media posts to Nostr, with optional webhook-based
  cross-posting.
- Runs without a Zuka-owned backend for user data or funds.

## Stack

- React 19, TypeScript, React Router, TanStack Query
- esbuild, Tailwind CSS 4, Biome, node:test, Playwright smokes
- Nostrify, nostr-tools, NIP-44, NIP-49, NIP-57, NIP-65, NIP-78, NIP-92
- Breez Spark SDK, Blossom, PPQ
- Capacitor for native Android/iOS shells

## Quickstart

```bash
npm install
npm run dev
npm test
npm run build
```

For the full release validation suite:

```bash
npm run test:ci
```

Android builds use Capacitor:

```bash
npm run cap:sync
npm run cap:build:android
npm run cap:build:android:release
```

Release signing is configured in the Android project/keystore environment, not
by the npm script itself.

## Documentation

- [`docs/INDEX.md`](./docs/INDEX.md) — documentation map for users and agents.
- [`docs/PRODUCT.md`](./docs/PRODUCT.md) — product model, release scope, and
  non-goals.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — source map and route table.
- [`docs/CURRENT-STACK.md`](./docs/CURRENT-STACK.md) — build, test, lint, and
  bundle policy.
- [`AGENTS.md`](./AGENTS.md) — coding and security rules for agents.
- [`CHANGELOG.md`](./CHANGELOG.md) — release history.

## Security Model

Zuka separates the human operator from public personas. Operator-owned data is
scoped to the active operator pubkey. Persona keys and wallet seeds are kept in
encrypted Nostr backups and runtime memory, not plaintext persistent storage.
Fresh Zuka-generated operator keys are stored as NIP-49 `ncryptsec` backups.

See [`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md) and
[`docs/AUTH-SESSION-MODEL.md`](./docs/AUTH-SESSION-MODEL.md).
