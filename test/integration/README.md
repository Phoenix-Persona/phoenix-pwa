# Integration Tests

Integration tests cover user flows that need real app providers, relay traffic,
or HTTP service boundaries. They run through `node:test`:

```sh
npm run test:integration
npm run test:integration -- test/integration/persona-lifecycle.integration.test.tsx
```

The harnesses bind local `127.0.0.1` servers for the relay and optional HTTP
mock server. If a sandbox blocks local ports, rerun with the project-approved
integration-test permission.

## Harnesses

- `harness/renderWithRelay.tsx` starts only the in-memory Nostr relay and wraps
  the UI in `TestApp`.
- `harness/renderWithServices.tsx` starts the relay plus `TestHttpServer`.
  Use this for PPQ, Blossom, or generated-media flows.
- `fixtures/nostr.ts` owns deterministic operator/persona keys and encrypted
  operator/persona envelope helpers. Prefer these fixtures over inline keys.
- `relay/TestRelay.ts` is a small WebSocket relay with query, publish, and
  inspection helpers.
- `http/TestHttpServer.ts` records every request and routes exact paths or
  regular expressions to deterministic responses.

## Boundaries

Keep integration tests close to user-visible behavior while mocking expensive
or external-only services:

- Use the real provider stack, hooks, route components, relay publish/query
  path, and encrypted envelope fixtures.
- Mock Breez Spark wallet calls. Tests should assert app behavior around wallet
  handles, balances, invoices, and failures without starting the SDK.
- Mock heavy AI/video internals such as script generation, Seedance polling,
  ffmpeg stitching, and Blossom upload bytes when the test is about orchestration.
- Use `TestHttpServer` for PPQ HTTP calls so auth headers, request bodies,
  payment-required responses, invoice status, and media URLs are still asserted.
- Do not rely on global localStorage PPQ state. Seed operator envelope PPQ
  credentials when the flow needs an existing AI account.

## Coverage Map

- `auth-flow.integration.test.tsx` and
  `operator-login-replacement.integration.test.tsx`: login replacement and
  operator isolation.
- `persona-lifecycle.integration.test.tsx` and
  `persona-onboard.integration.test.tsx`: persona create/edit/delete and
  route-level onboarding.
- `wallet-management.integration.test.tsx`: operator/persona wallet init,
  login replacement, and wallet failure handling.
- `ai-credits-management.integration.test.tsx`: PPQ account and credit
  management.
- `ai-usage.integration.test.tsx`: text styling, PPQ top-up, and persona image
  generation.
- `ai-video-pipeline.integration.test.tsx`: video preview, media upload
  orchestration, caption preparation, and failure containment.

## Test Style

Wait for provider readiness before interacting with hooks or pages:

```ts
const hook = renderHook(() => useSomething(), { wrapper: harness.wrapper });
await waitFor(() => expect(hook.result.current).toBeTruthy());
```

Use `act()` around async user actions and mutation calls. When asserting
published content, inspect `harness.relay.getEvents(...)` rather than internal
hook state. When asserting service calls, inspect `harness.http.requests` so the
test proves the request shape that would leave the app.
