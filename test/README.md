# Test Suite

Zuka has three test layers:

- `src/**/*.test.ts(x)` contains colocated unit and focused component tests.
- `test/integration/` contains automated integration tests that run against a local in-memory Nostr relay.
- `test/manual/` contains explicit manual scripts for wallet, PPQ, media, and other spend/network workflows.

## Integration Relay

`test/integration/relay/TestRelay.ts` is a minimal Nostr relay for tests. It speaks WebSocket Nostr messages, verifies event signatures, supports the filter fields the app uses, and applies replaceable/addressable event retention for profile, relay-list, Blossom-list, and encrypted persona events.

The relay is intentionally not a production relay. Keep it small and deterministic.

## Fixtures And Harnesses

Use `test/integration/fixtures/nostr.ts` for deterministic operator/persona keys and signed events. Use `test/integration/harness/renderWithRelay.tsx` to start a relay, seed events, render with `TestApp`, and clean up.

Automated tests must not call public relays, PPQ, Breez, Blossom, browser extensions, NIP-46 signers, or Lightning services. Put those workflows in `test/manual/`.

## Commands

```bash
npm run test:unit
npm run test:integration
npm test
```
