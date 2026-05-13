# Test Suite Audit - 2026-05-13

## Summary

The `/test` tree is worth keeping, but it needs stricter boundaries:

- `test/integration/` is useful automated coverage. It exercises local-only Nostr relay behavior, HTTP mocks, PPQ hooks, account switching, and persona lifecycle flows without outbound services.
- `test/node/` is useful harness infrastructure. The Vitest-shaped `vi` namespace was the sub-par part, not the harness itself; it is being replaced with named node:test helpers.
- `test/manual/` is useful manual smoke coverage for spend/network paths. These scripts should stay excluded from `npm test` and remain documented as release/demo checks.
- `test-results/` is generated output and should not exist in the repo. The CI artifact upload should be removed unless a node:test reporter is added later.

## Keep

- `test/integration/relay/TestRelay.ts` and `TestRelay.test.ts`: local relay coverage is high value and prevents accidental public-relay dependency in tests.
- `test/integration/http/TestHttpServer.ts` and HTTP integration tests: local PPQ/Blossom coverage catches real client request-shape regressions.
- Nostr provider/sync/persona lifecycle integration tests: these cover cross-provider behavior that unit tests cannot reliably model.
- Manual wallet and PPQ scripts: they are intentionally real-service checks and belong in manual release cadence, not CI.

## Remove Or Replace

- Remove `test-results/`; these XML files were stale Vitest artifacts and are no longer produced by the node:test runner.
- Remove the `vi` namespace from `test/node/api.ts` and tests. Keep the named helpers only: `mockFn`, `mockModule`, `spyOn`, `stubEnv`, and related cleanup helpers.
- Do not add JUnit XML until the project actually needs a reporter. Console output from node:test is enough for now.

## Follow-Up Candidates

- Split large manual video scripts into reusable library functions if they become part of regular development.
- Add targeted integration tests when replacing the node:test mock module transform with explicit dependency seams.
- Consider a future reporter only if CI consumers need structured test artifacts.
