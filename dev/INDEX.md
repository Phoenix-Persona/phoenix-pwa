# dev/

Historical plans, reports, third-party notes, and decision records.
Current product and engineering documentation lives in [`../docs/`](../docs/INDEX.md).

## Third-party guides

External libraries and protocols Zuka depends on. Each guide has a
"Source" footer pointing at upstream — fall back to that when in doubt.

| Doc | What it covers |
| --- | --- |
| [`docs/nostr-nips.md`](./docs/nostr-nips.md) | NIPs Zuka uses: 01, 44, 49, 57, 78, 92, 94. Plus event-kind cheat sheet. |
| [`docs/nostrify.md`](./docs/nostrify.md) | `@nostrify/nostrify` + `@nostrify/react` — `NPool`, `NRelay1`, `NSecSigner`, hooks. |
| [`docs/blossom.md`](./docs/blossom.md) | Content-addressed media protocol for Nostr. Endpoints, BUDs, kind 24242 auth. |
| [`docs/ppq.md`](./docs/ppq.md) | PayPerQ inference API — base URL, OpenAI-compat surface, payment model. |
| [`docs/pi-mono.md`](./docs/pi-mono.md) | `pi-ai` + `pi-agent-core` + `pi-web-ui`. Forward-looking research for an agent-driven wizard. |
| [`docs/breez-spark.md`](./docs/breez-spark.md) | `@breeztech/breez-sdk-spark` — operator and per-persona Lightning wallets. |

## Subdirectories

| Path | Intent |
| --- | --- |
| `adr/` | Architecture Decision Records — short docs capturing a trade-off + decision. Currently empty. |
| `plans/` | Per-feature build plans. The shipped ones (`2026-05-09-wallet-followups.md`, `2026-05-10-follow-up-refactoring.md`, `2026-05-10-adopt-extracted-persona-components.md`) are kept as historical context. |
| `reports/` | Post-spike or post-implementation reports. |

## Related

- [`../AGENTS.md`](../AGENTS.md) — agent working agreement (lint rules, security model, file conventions).
