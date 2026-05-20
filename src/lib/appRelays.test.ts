import { describe, expect, it } from "@/test/api";

import { APP_RELAYS } from "./appRelays";

describe("APP_RELAYS", () => {
  it("does not include known flaky defaults that slow fresh profile loading", () => {
    const urls = APP_RELAYS.relays.map((relay) => relay.url);

    expect(urls).not.toContain("wss://relay.nostr.bg");
    expect(urls).not.toContain("wss://relay.nostr.band");
  });
});
