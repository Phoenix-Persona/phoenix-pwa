# docs/

Engineering reference for agents working on Zuka. **Start with
[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — it's the map of `src/`.

Source of truth for design intent is [`../dev/PROJECT.md`](../dev/PROJECT.md);
these docs distill or extend it for engineers reading code.

## Zuka-specific

| Doc | What it's for |
| --- | --- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Directory map of `src/`, provider stack, route table, per-file one-liners. **Read first.** |
| [`DATA-FLOW.md`](./DATA-FLOW.md) | Traces user actions through actual code: persona creation, compose + publish, PPQ flows, etc. |
| [`PERSONA-SCHEMA.md`](./PERSONA-SCHEMA.md) | The three Nostr events Zuka publishes per persona (kind 0, kind 30078, kind 1). Mirrors `PROJECT.md` §5. |
| [`THREAT-MODEL.md`](./THREAT-MODEL.md) | What Zuka protects, what it doesn't, where secrets live. Mirrors `PROJECT.md` §3. |
| [`SCOPE.md`](./SCOPE.md) | V1 / V1.5 / V2 / out-of-scope checklist. Mirrors `PROJECT.md` §8. |
| [`GLOSSARY.md`](./GLOSSARY.md) | Vocabulary: user keypair, persona keypair, PPQ, pi-mono, NIP-44/49/57/78, etc. |

## Third-party guides — `guides/`

External libraries and protocols Zuka depends on. Each guide has a
"Source" footer pointing at upstream — fall back to that when in doubt.

| Doc | What it covers |
| --- | --- |
| [`guides/nostr-nips.md`](./guides/nostr-nips.md) | NIPs Zuka uses: 01, 44, 49, 57, 78, 92, 94. Plus event-kind cheat sheet. |
| [`guides/nostrify.md`](./guides/nostrify.md) | `@nostrify/nostrify` + `@nostrify/react` — `NPool`, `NRelay1`, `NSecSigner`, hooks. |
| [`guides/blossom.md`](./guides/blossom.md) | Content-addressed media protocol for Nostr. Endpoints, BUDs, kind 24242 auth. |
| [`guides/ppq.md`](./guides/ppq.md) | PayPerQ inference API — base URL, OpenAI-compat surface, payment model. |
| [`guides/pi-mono.md`](./guides/pi-mono.md) | `pi-ai` + `pi-agent-core` + `pi-web-ui`. Forward-looking — agent harness deferred for V1. |
| [`guides/breez-spark.md`](./guides/breez-spark.md) | `@breeztech/breez-sdk-spark` — per-persona Lightning wallet. Forward-looking; integration pending. |
