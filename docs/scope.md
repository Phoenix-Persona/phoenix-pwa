# Scope

What ships when, and what we are not building.

> Source of truth: PROJECT.md §8. If this disagrees with §8, §8 wins —
> update this file.

## V1 — must ship for the demo

- [ ] Character-creator wizard with embedded `pi-agent-core` agent
- [ ] Persona keypair + NIP-49 local storage + relay backup (kind 30078)
- [ ] Per-persona Breeze wallet, seed inside the backup event
- [ ] Profile image generation with reference image saved
- [ ] Voice sample generation, stored on Blossom
- [ ] Multi-persona UX: list, switch, back up, restore
- [ ] Compose flow: thought → styled → kind 1 publish (text only)
- [ ] Post-image generation in compose flow (with reference image)
- [ ] Wallet UI: balance, receive (invoice + Lightning Address), tx history
- [ ] Wallet UI: send (initially top-up other personas / pay back out)
- [ ] Donations visible on public persona feed (zap receipts, NIP-57)
- [ ] Settings page: per-task model override
- [ ] Public persona profile + feed (anyone can view, zap)
- [ ] Verify page: persona pubkey, signature provenance, post count

## V1.5 — ship if V1 is solid by hour 24

- [ ] TTS audio rendering of published posts
- [ ] LNURL-pay endpoint hosted (so Lightning Addresses resolve)
- [ ] Imigongo-rooted visual polish (palette, pattern, type pairing)
- [ ] PWA install prompt, service worker, offline shell

## V2 — stretch

- [ ] Video generation using persona likeness + voice
- [ ] NIP-46 remote signer support for power users
- [ ] Multi-language interview (Kinyarwanda + English at minimum)
- [ ] Brainstorm-from-sources flow (RSS in, candidate posts out)

## Explicitly out of scope

**Do not build any of these. They are out of scope by design, not by
oversight.**

- A Phoenix-owned backend service that holds user data
- Server-side persona storage or "account recovery via email"
- Custodial wallet
- Centralized moderation, content filtering, or safety classifier in front
  of the persona's voice

## Heuristics for agents

- If a request would add a Phoenix-owned server that holds user data, **stop
  and flag it** — that crosses an explicit line from §8.
- If a request would add a "recover my account" flow that does not
  require the persona's nsec, **stop and flag it** — same.
- If a feature is in V2 and V1 isn't done, **don't start V2** — finish
  V1 first.
- If a feature isn't on any list above, ask before building it.

## Source

- PROJECT.md §8 (canonical)
- PROJECT.md §10 — the open research items that block V1 work
