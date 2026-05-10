# dev/

Design intent, parallel build coordination, and decision records.
Engineering reference for `src/` lives in [`../docs/`](../docs/INDEX.md).

## Documents

| Doc | What it's for |
| --- | --- |
| [`PROJECT.md`](./PROJECT.md) | **Master plan.** Authoritative design doc — mission, identity model, persona Nostr schema, AI capabilities, wallet model, V1 scope, demo arc. When code disagrees with this doc, this doc wins (per its own header) — but reality drifts; cross-check against [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) and the source. |

## Subdirectories

| Path | Intent |
| --- | --- |
| `adr/` | Architecture Decision Records — short docs capturing a trade-off + decision. Currently empty. |
| `plans/` | Per-feature build plans. Currently empty. |
| `reports/` | Post-spike or post-implementation reports. |

## Related

- [`../tasks/todo.md`](../tasks/todo.md) — active V1 task list.
- [`../AGENTS.md`](../AGENTS.md) — agent working agreement (lint rules, security model, file conventions).
