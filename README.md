# Phoenix Persona

> Anonymity-preserving social media, built on Nostr and Lightning.

Phoenix Persona is a PWA for creating and operating an AI persona that posts on social media on your behalf. Each persona has its own face, voice, writing style, Nostr identity, and Bitcoin Lightning wallet — so the persona can sustain itself by accepting donations and using them to pay for its own AI inference.

**Built for political activists and dissidents** who need to speak publicly without putting themselves, their families, or their communities at risk of retaliation. Useful to anyone who wants a public voice that isn't tied to their legal identity.

This README is a quick orientation. The authoritative design document is **[`PROJECT.md`](./dev/PROJECT.md)**.

## What it does

- **Character creator** — an embedded AI agent interviews you and generates the persona's name, bio, system prompt, profile picture, and voice sample.
- **Persona-owned identity** — each persona is a fresh Nostr keypair you control. No operator account, no cross-persona linkage.
- **Persona-owned wallet** — each persona has its own Lightning wallet (Breeze SDK). It accepts NIP-57 zaps and exposes a Lightning Address; it pays for its own AI inference via PPQ.
- **Content tools** — text composer with persona-voice styling, image generation with consistent likeness via reference image, voice rendering of posts, donations visible on the public feed.
- **Encrypted backup on Nostr** — persona config, wallet seed, and asset references are encrypted to the persona's own pubkey and published as a kind 30078 event. A new device with the persona nsec can fully restore from relays.
- **No backend** — the PWA talks directly to PPQ, Nostr relays, Blossom servers, and the Lightning network. Phoenix never custodies funds or holds user data.

## Tech stack

- **PWA** — React 19, Vite, TailwindCSS 4, shadcn/ui
- **Nostr** — Nostrify, NIP-44 (backup encryption), NIP-49 (at-rest nsec encryption), NIP-57 (zaps)
- **Agent harness** — [`pi-mono`](https://github.com/earendil-works/pi) (`pi-agent-core` runtime, `pi-ai` LLM client, `pi-web-ui` chat components)
- **AI inference** — [PPQ](https://ppq.ai), OpenAI-compatible, paid per request in sats
- **Lightning wallet** — Breeze SDK, per-persona, seed embedded in the encrypted backup
- **Media** — Blossom for voice samples and images

## Quickstart

```bash
npm install
npm run dev      # vite dev server
npm test         # tsc --noEmit + eslint + vitest + vite build
npm run build    # production build to ./dist
```

## Documents

- [`PROJECT.md`](./dev/PROJECT.md) — master plan (authoritative; read first)
- [`AGENTS.md`](./AGENTS.md) — guidance for building on this codebase (Nostr conventions, security model, file patterns)
- [`tasks/todo.md`](./tasks/todo.md) — active hackathon build plan against the V1 scope
- [`tasks/lessons.md`](./tasks/lessons.md) — lessons captured during the build

## Status

In active development for the **HRF AI Hack for Freedom**. The current scaffold is MKStack boilerplate plus an early sketch that predates the master plan; see PROJECT.md §11 for what stays, what gets rewritten, and what's new.

## Team

Anaïse (Captain + Product), Derek (Frontend + Nostr + PWA), Jim (LLM + Agent), Topher (Wallet + PPQ + Infrastructure).
