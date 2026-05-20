import { useNostr } from "@nostrify/react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "@/test/api";

import { signedEvent, testKeys } from "./fixtures/nostr";
import { createRelayHarness, type RelayHarness } from "./harness/renderWithRelay";

const harnesses: RelayHarness[] = [];

afterEach(async () => {
  cleanup();
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("NostrProvider integration", () => {
  it("publishes to and queries from the local test relay", async () => {
    const harness = await createRelayHarness();
    harnesses.push(harness);

    const { result } = renderHook(() => useNostr(), { wrapper: harness.wrapper });
    await waitFor(() => expect(result.current.nostr).toBeTruthy());

    const event = signedEvent(testKeys.operator, {
      kind: 1,
      content: "hello local relay",
      created_at: 1_700_000_010,
    });

    await result.current.nostr.event(event, { signal: AbortSignal.timeout(1_000) });

    const events = await result.current.nostr.query(
      [{ ids: [event.id], limit: 1 }],
      { signal: AbortSignal.timeout(1_000) },
    );

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe("hello local relay");
    expect(harness.relay.getEvents({ ids: [event.id] })).toHaveLength(1);
  });
});
