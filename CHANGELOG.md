# Changelog

All notable changes to Zuka will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [0.1.0-beta.1] - 2026-05-18

### Added

- Added operator-scoped wallet provisioning and isolated operator session state.
- Added expanded persona, wallet, AI credits, AI usage, Blossom upload, and
  Nostr relay integration coverage.
- Added a local Nostr test relay, HTTP service mocks, node:test harnesses, PWA
  smoke checks, and bundle budget validation.
- Added `docs/PRODUCT.md` as the release-facing product model and scope guide.
- Added `docs-drift-audit` and `changelog-release` repo-local agent skills.
- Added GitHub CI and security workflows for release validation.

### Changed

- Replaced Vite and Vitest with the esbuild build scripts and node:test test
  runner.
- Replaced ESLint with Biome and consolidated source policy checks.
- Reworked the operator wallet UI to separate operator and persona wallet
  concerns.
- Updated persona creation and editing flows, including blank profile defaults
  and AI assist behavior.
- Reworked README and documentation indexes for beta release readiness.
- Consolidated architecture, schema, data-flow, scope, and security docs around
  the current implementation.

### Removed

- Removed stale shadcn, ESLint, Vite, Vitest, cache, handoff, and unused generic
  UI artifacts.
- Moved static assets and the app shell into `public/`.
- Moved validation and manual workflow scripts under `test/`.
- Removed the stale `dev/PROJECT.md` master plan after migrating durable
  content into the docs system.

### Fixed

- Fixed operator wallet generation when logging in with existing Nostr profile
  settings.
- Fixed stale operator account, PPQ credential, and local session bleed during
  account switching and refresh.
- Fixed wallet, AI assist, persona profile editing, settings, and recent-posts
  UI issues found during release polish.

### Security

- Hardened operator-scoped local state cleanup and encrypted operator envelope
  handling.
- Updated `ws` to the patched `8.20.1` release to clear the production audit
  finding for GHSA-58qx-3vcg-4xpx.
- Added release checks for source policy, CSP-sensitive app shell behavior, PWA
  readiness, and production bundle output.
