# Zuka

[![CI](https://github.com/zuka-org/zuka-pwa/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/zuka-org/zuka-pwa/actions/workflows/ci.yml)
[![Security](https://github.com/zuka-org/zuka-pwa/actions/workflows/security.yml/badge.svg?branch=dev)](https://github.com/zuka-org/zuka-pwa/actions/workflows/security.yml)

> AI personas on Nostr. Voices that can be amplified but not silenced.

**[zuka.live](https://zuka.live)** — a PWA + Android app for creating and operating AI personas that publish on social media on your behalf. Each persona has its own face, voice, identity, and Bitcoin Lightning wallet — so it can sustain itself on donations and pay for its own AI inference without ever touching the operator's accounts.

**Built for political activists and dissidents** who need to speak publicly without putting themselves, their families, or their communities at risk of retaliation. Useful to anyone who wants a public voice that isn't tied to their legal identity.

The name *Zuka* is Kinyarwanda for "rebirth" — a closer match to the persona-resurrection metaphor at the heart of the product. Even with a fresh face, an old voice can come back stronger.

The authoritative design document is **[`PROJECT.md`](./dev/PROJECT.md)**.

## What it does

- **Persona creation** — fresh Nostr keypair, profile picture (upload or generate via PPQ), system prompt, public bio, optional Lightning Address. Form-based wizard; the agent-driven character-creator interview is V2.
- **Persona-owned identity** — each persona is a separate Nostr keypair the user controls. No operator account, no cross-persona linkage on the wire. The encrypted backup links them — and only the user's signer can decrypt it.
- **Persona-owned wallet** — each persona has its own Lightning wallet (Breez Spark SDK). It accepts NIP-57 zaps, exposes a Lightning Address, and pays for its own AI inference via [PPQ](https://ppq.ai).
- **Video-first composer** — idea + sources + style hints feed an AI prompt that generates the persona's video. Posted to Nostr (kind 1 with NIP-92 imeta video tag) and optionally cross-posted to X / Facebook / Instagram via a user-supplied webhook (Buffer / Zapier / Make.com / etc.). Text-only kind 1 publish is available as a fallback.
- **Encrypted backup on Nostr** — persona config + wallet seed + asset references encrypted (NIP-44) to the user's own pubkey and published as a kind 30078 event with no identifying tags. A new device with the user's nsec re-hydrates every persona from relays.
- **At-rest key encryption** — fresh Zuka-generated user nsecs are wrapped with NIP-49 (`ncryptsec`) before they hit storage. On native, the encrypted blob lives in iOS Keychain / Android KeyStore. Once-per-session passphrase unlock. Download/import the backup file across devices for the kill-and-resurrect demo arc.
- **No Zuka backend** — the app talks directly to PPQ, Nostr relays, Blossom servers, and the Lightning network. Zuka never custodies funds or holds user data.

## Tech stack

- **Web** — React 19, Vite, TailwindCSS 4, shadcn/ui
- **Native** — Capacitor 8 (Android shipped; iOS scaffolding in place)
- **Nostr** — Nostrify (`@nostrify/react`), NIP-44 (encrypted backups), NIP-49 (at-rest nsec encryption), NIP-57 (zaps), NIP-65 (relay list), NIP-78 (encrypted application data — kind 30078), NIP-92 (imeta media)
- **Agent harness (V2)** — [`pi-mono`](https://github.com/earendil-works/pi) (`pi-agent-core` runtime, `pi-ai` LLM client, `pi-web-ui` chat components)
- **AI inference** — [PPQ](https://ppq.ai), OpenAI-compatible, paid per request in sats over Lightning
- **Lightning wallet** — Breez Spark SDK, per-persona, BIP-39 seed embedded in the encrypted backup
- **Media** — Blossom (BUD-03 server lists, kind 10063) for profile pictures, post images, voice samples, and video uploads. Persona uploads sign BUD-01 auth events with the persona's own keypair so the operator pubkey never appears on the wire.

## Quickstart

```bash
npm install
npm run dev      # local esbuild dev server
npm test         # tsc --noEmit + eslint + node:test + esbuild build
npm run build    # production build to ./dist

# Android (Capacitor)
npm run cap:sync                  # sync web build into android/
npm run cap:build:android:release # signed release APK to android/app/build/outputs/apk/release/
```

## Documents

- [`PROJECT.md`](./dev/PROJECT.md) — master plan (authoritative; read first)
- [`AGENTS.md`](./AGENTS.md) — guidance for building on this codebase (Nostr conventions, security model, file patterns)
- [`NIP.md`](./docs/NIP.md) — custom Nostr event kinds defined by Zuka

## Team

- **Anaïse** — Captain + Product
- **Derek** — Frontend + Nostr + PWA + Android app
- **Jim** — PPQ + Wallet + Cross-post + Video pipeline
- **Topher** — Agent + LLM Consumers + Donations

Built originally for the **HRF AI Hack for Freedom**.
