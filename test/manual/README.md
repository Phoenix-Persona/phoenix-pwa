# Manual Test Inventory

Manual tests are for real network, spend, SDK, and media workflows that do
not belong in CI. They may call public services, require secrets, or spend
sats/ppq.ai credit.

## Suites

| Path | Purpose | CI status |
| --- | --- | --- |
| [`RELEASE-CHECKLIST.md`](./RELEASE-CHECKLIST.md) | Human release/demo smoke cadence. | Manual only |
| [`wallet/`](./wallet/) | Breez Spark wallet, Lightning receive, ppq.ai auto-topup, and inference spend checks. | Manual only |
| [`ai-services/`](./ai-services/) | ppq.ai account, inference, image, video, and model-regression probes. | Manual only |
| [`video/`](./video/) | Local video/music helper scripts for generated media review. | Manual only |

## Artifact Rules

Manual scripts must keep credentials, media caches, downloaded outputs, and
generated logs out of Git. Prefer suite-local gitignored state for secrets and
large media, and `.tmp/` for disposable reports. Do not reintroduce
`test-results/`; automated node:test output is console-first unless a reporter
is deliberately added later.
