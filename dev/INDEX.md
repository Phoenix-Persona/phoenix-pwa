# dev/

Design intent, parallel build coordination, and decision records.
Engineering reference for `src/` lives in [`../docs/`](../docs/INDEX.md).

## Documents

| Doc | What it's for |
| --- | --- |
| [`PROJECT.md`](./PROJECT.md) | **Master plan.** Authoritative design doc — mission, identity model, persona Nostr schema, AI capabilities, wallet model, V1 scope, demo arc. When code disagrees with this doc, this doc wins (per its own header) — but reality drifts; cross-check against [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) and the source. |
| [`STREAMS.md`](./STREAMS.md) | **Parallel build coordination.** Three dev streams (Jim — PPQ + wallet + payments; Topher — persona crypto + Breeze; Derek — UI) plus Anaïse on product. Phase timeline, harness specs for `/dev/*` routes, sync points. Required reading for anyone joining a stream. |

## Subdirectories

| Path | Intent |
| --- | --- |
| `adr/` | Architecture Decision Records — short docs capturing a trade-off + decision (e.g. "why random-UUID d-tag for kind 30078"). Currently empty. |
| `plans/` | Per-stream or per-feature build plans, deeper than what fits in `STREAMS.md`. Currently empty. |
| `reports/` | Post-spike or post-implementation reports. Currently empty. |

## Related

- [`../tasks/todo.md`](../tasks/todo.md) — active V1 task list.
- [`../AGENTS.md`](../AGENTS.md) — agent working agreement (lint rules, security model, file conventions).
