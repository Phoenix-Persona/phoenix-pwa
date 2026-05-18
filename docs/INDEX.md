# Documentation Index

Documentation for release users, maintainers, and agents working on Zuka.

Start here:

1. [`README.md`](../README.md) — short project overview and commands.
2. [`PRODUCT.md`](./PRODUCT.md) — product model, release scope, and non-goals.
3. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — map of `src/` and current routes.
4. [`DATA-FLOW.md`](./DATA-FLOW.md) — user flows traced through current code.

## Core Docs

| Doc | What it's for |
| --- | --- |
| [`PRODUCT.md`](./PRODUCT.md) | Product model, audience, identity model, release scope, and demo arc. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Directory map of `src/`, provider stack, route table, and per-file notes. |
| [`DATA-FLOW.md`](./DATA-FLOW.md) | Current call paths for login, persona creation, compose, wallet, PPQ, media, and sync. |
| [`PERSONA-SCHEMA.md`](./PERSONA-SCHEMA.md) | Persona Nostr schema: kind 0 profile, encrypted kind 30078 backup, kind 1 posts, and media tags. |
| [`AUTH-SESSION-MODEL.md`](./AUTH-SESSION-MODEL.md) | Auth/session persistence, operator isolation, cleanup boundary, and dev-only env pins. |
| [`THREAT-MODEL.md`](./THREAT-MODEL.md) | What Zuka protects, what it does not protect, and where secrets live. |
| [`SECURITY-REGRESSION-CHECKLIST.md`](./SECURITY-REGRESSION-CHECKLIST.md) | PR checklist for secrets, operator isolation, Nostr trust boundaries, wallets, and PPQ. |
| [`CURRENT-STACK.md`](./CURRENT-STACK.md) | Current build, test, lint, browser smoke, and bundle-budget policy. |
| [`SCOPE.md`](./SCOPE.md) | Release, deferred, and out-of-scope feature list. |
| [`GLOSSARY.md`](./GLOSSARY.md) | Vocabulary for operator/persona identity, Nostr, wallets, PPQ, and media. |
| [`NIP.md`](./NIP.md) | Custom Nostr event kinds and schemas defined by Zuka. |
| [`BRANCH-PROTECTION.md`](./BRANCH-PROTECTION.md) | Required CI/security checks for `dev` and `main`. |

## Test Docs

| Doc | What it's for |
| --- | --- |
| [`../test/README.md`](../test/README.md) | Automated, integration, manual, and validation script test layout. |
| [`../test/integration/README.md`](../test/integration/README.md) | Integration relay, HTTP mocks, fixtures, and render harnesses. |
| [`../test/manual/README.md`](../test/manual/README.md) | Manual network/spend test scripts. |
| [`../test/manual/RELEASE-CHECKLIST.md`](../test/manual/RELEASE-CHECKLIST.md) | Release smoke cadence for real PPQ, wallet, Blossom, and media workflows. |

## Development Records

| Path | What it's for |
| --- | --- |
| [`../dev/plans/`](../dev/plans/) | Historical and active implementation plans. |
| [`../dev/reports/`](../dev/reports/) | Audit, migration, and spike reports. |
| [`../dev/docs/`](../dev/docs/) | Third-party protocol/library notes. Some entries are forward-looking or archival; verify against `package.json` and source before treating them as current implementation. |

CI status lives in GitHub Actions:
[`CI`](https://github.com/zuka-org/zuka-pwa/actions/workflows/ci.yml) and
[`Security`](https://github.com/zuka-org/zuka-pwa/actions/workflows/security.yml).
