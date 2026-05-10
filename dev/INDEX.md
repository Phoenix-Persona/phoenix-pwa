# dev/

Design intent, parallel build coordination, and decision records.
Engineering reference for `src/` lives in [`../docs/`](../docs/INDEX.md).

## Documents

| Doc | What it's for |
| --- | --- |
| [`PROJECT.md`](./PROJECT.md) | **Master plan.** Authoritative design doc — mission, identity model, persona Nostr schema, AI capabilities, wallet model, V1 scope, demo arc. When code disagrees with this doc, this doc wins (per its own header) — but reality drifts; cross-check against [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) and the source. |

## Third-party guides

External libraries and protocols Zuka depends on. Each guide has a
"Source" footer pointing at upstream — fall back to that when in doubt.

| Doc | What it covers |
| --- | --- |
| [`docs/nostr-nips.md`](./docs/nostr-nips.md) | NIPs Zuka uses: 01, 44, 49, 57, 78, 92, 94. Plus event-kind cheat sheet. |
| [`docs/nostrify.md`](./docs/nostrify.md) | `@nostrify/nostrify` + `@nostrify/react` — `NPool`, `NRelay1`, `NSecSigner`, hooks. |
| [`docs/blossom.md`](./docs/blossom.md) | Content-addressed media protocol for Nostr. Endpoints, BUDs, kind 24242 auth. |
| [`docs/ppq.md`](./docs/ppq.md) | PayPerQ inference API — base URL, OpenAI-compat surface, payment model. |
| [`docs/pi-mono.md`](./docs/pi-mono.md) | `pi-ai` + `pi-agent-core` + `pi-web-ui`. Forward-looking — agent harness deferred for V1. |
| [`docs/breez-spark.md`](./docs/breez-spark.md) | `@breeztech/breez-sdk-spark` — per-persona Lightning wallet. Forward-looking; integration pending. |

## Subdirectories

| Path | Intent |
| --- | --- |
| `adr/` | Architecture Decision Records — short docs capturing a trade-off + decision. Currently empty. |
| `plans/` | Per-feature build plans. Currently empty. |
| `reports/` | Post-spike or post-implementation reports. |

## Related

- [`../tasks/todo.md`](../tasks/todo.md) — active V1 task list.
- [`../AGENTS.md`](../AGENTS.md) — agent working agreement (lint rules, security model, file conventions).
