import { describe, expect, it } from "@/test/api";

import { withNostrQueryTimeout } from "./nostrQuery";

describe("withNostrQueryTimeout", () => {
  it("returns a signal that aborts when the parent signal aborts", () => {
    const parent = new AbortController();
    const signal = withNostrQueryTimeout(parent.signal, 10_000);

    parent.abort();

    expect(signal.aborted).toBe(true);
  });
});
