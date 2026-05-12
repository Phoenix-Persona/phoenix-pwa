# docs/

Engineering reference for agents working on Zuka. **Start with
[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — it's the map of `src/`.

Source of truth for design intent is [`../dev/PROJECT.md`](../dev/PROJECT.md);
these docs distill or extend it for engineers reading code.

## Zuka-specific

| Doc | What it's for |
| --- | --- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Directory map of `src/`, provider stack, route table, per-file one-liners. **Read first.** |
| [`AUTH-SESSION-MODEL.md`](./AUTH-SESSION-MODEL.md) | Hard-cut auth/session persistence rules, operator isolation, cleanup boundary, and dev-only env pins. |
| [`BRANCH-PROTECTION.md`](./BRANCH-PROTECTION.md) | Required CI/security checks for `dev` and `main`. |
| [`DATA-FLOW.md`](./DATA-FLOW.md) | Traces user actions through actual code: persona creation, compose + publish, PPQ flows, etc. |
| [`PERSONA-SCHEMA.md`](./PERSONA-SCHEMA.md) | The three Nostr events Zuka publishes per persona (kind 0, kind 30078, kind 1). Mirrors `PROJECT.md` §5. |
| [`SECURITY-REGRESSION-CHECKLIST.md`](./SECURITY-REGRESSION-CHECKLIST.md) | PR checklist for secrets, operator isolation, Nostr trust boundaries, wallets, and PPQ. |
| [`THREAT-MODEL.md`](./THREAT-MODEL.md) | What Zuka protects, what it doesn't, where secrets live. Mirrors `PROJECT.md` §3. |
| [`SCOPE.md`](./SCOPE.md) | V1 / V1.5 / V2 / out-of-scope checklist. Mirrors `PROJECT.md` §8. |
| [`GLOSSARY.md`](./GLOSSARY.md) | Vocabulary: user keypair, persona keypair, PPQ, pi-mono, NIP-44/49/57/78, etc. |
| [`NIP.md`](./NIP.md) | Custom Nostr event kinds and schemas defined by Zuka. |

## Third-party guides

Guides for the external libraries and protocols Zuka depends on
(`@nostrify`, NIPs, Blossom, PPQ, `pi-mono`, Breez Spark) live under
[`../dev/docs/`](../dev/INDEX.md#third-party-guides).
