# Test Suite

Zuka has three test layers:

- `src/**/*.test.ts(x)` contains colocated unit and focused component tests.
- `test/integration/` contains automated integration tests that run against local in-memory Nostr relay and HTTP mock servers.
- `test/manual/` contains explicit manual scripts for wallet, PPQ, media, and other spend/network workflows.

Before demos or releases, use [`test/manual/RELEASE-CHECKLIST.md`](./manual/RELEASE-CHECKLIST.md) for the real spend/network smoke cadence.

## Integration Relay

`test/integration/relay/TestRelay.ts` is a minimal Nostr relay for tests. It speaks WebSocket Nostr messages, verifies event signatures, supports the filter fields the app uses, and applies replaceable/addressable event retention for profile, relay-list, Blossom-list, and encrypted persona events.

The relay is intentionally not a production relay. Keep it small and deterministic.

## Fixtures And Harnesses

Use `test/integration/fixtures/nostr.ts` for deterministic operator/persona keys and signed events. Use `test/integration/harness/renderWithRelay.tsx` to start a relay, seed events, render with `TestApp`, and clean up.

Use `test/integration/http/TestHttpServer.ts` for local HTTP mocks. It records method, path, headers, and raw bodies, and can serve JSON, text, binary, error, PPQ-shaped, or Blossom-shaped responses without touching the network.

Automated tests must not call public relays, PPQ, Breez, Blossom, browser extensions, NIP-46 signers, or Lightning services. Put those workflows in `test/manual/`.

Integration tests are intentionally serialized by the node:test runner so loopback ports, global WebSocket overrides, and storage keys remain deterministic. CI must allow loopback networking on `127.0.0.1`; no outbound network is required for integration tests.

## Commands

```bash
npm run test:unit
npm run test:integration
npm run test:ci
npm test
npm run smoke:dev
npm run analyze:bundle
```

For CI, install dependencies first, then run `npm run test:ci`. `npm test` remains the local one-command path and installs dependencies before running the full suite. `npm run smoke:dev` starts the local esbuild dev server and checks SPA fallback/static assets; `npm run analyze:bundle` reads the latest production build metafile.
