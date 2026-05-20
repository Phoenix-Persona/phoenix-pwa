import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "@/test/api";

import { NostrSync } from "@/components/NostrSync";
import { useAppContext } from "@/hooks/useAppContext";

import {
  blossomListEvent,
  loginFor,
  relayListEvent,
  testKeys,
} from "./fixtures/nostr";
import { createRelayHarness, type RelayHarness } from "./harness/renderWithRelay";

const harnesses: RelayHarness[] = [];

afterEach(async () => {
  cleanup();
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("NostrSync integration", () => {
  it("imports relay and Blossom lists from the local relay", async () => {
    const relayEvent = relayListEvent(
      testKeys.operator,
      [
        { url: "wss://read.example", marker: "read" },
        { url: "wss://write.example", marker: "write" },
      ],
      1_700_000_030,
    );
    const blossomEvent = blossomListEvent(
      testKeys.operator,
      ["https://blossom.example/"],
      1_700_000_031,
    );
    const harness = await createRelayHarness({
      events: [relayEvent, blossomEvent],
      logins: [loginFor(testKeys.operator)],
    });
    harnesses.push(harness);
    expect(harness.relay.getEvents({ kinds: [10002], authors: [testKeys.operator.pubkey] })).toHaveLength(1);

    function ConfigProbe() {
      const { config } = useAppContext();
      return (
        <>
          <NostrSync />
          <output data-testid="relays">
            {config.relayMetadata.relays.map((relay) => `${relay.url}:${relay.read}:${relay.write}`).join("|")}
          </output>
          <output data-testid="blossom">
            {config.blossomServerMetadata.servers.join("|")}
          </output>
        </>
      );
    }

    render(<ConfigProbe />, { wrapper: harness.wrapper });

    await waitFor(() => {
      expect(harness.relay.messages.some((message) => message.includes("10002"))).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId("relays").textContent).toContain("wss://read.example:true:false");
      expect(screen.getByTestId("relays").textContent).toContain("wss://write.example:false:true");
      expect(screen.getByTestId("blossom").textContent).toBe("https://blossom.example/");
    });
  });
});
