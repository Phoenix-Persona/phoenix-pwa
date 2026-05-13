import type { NostrEvent } from "@nostrify/nostrify";
import { describe, expect, it, vi } from "@/test/api";

import { DEFAULT_PUBLISH_TIMEOUT_MS, publishWithTimeout } from "./nostrPublish";

const event: NostrEvent = {
  id: "id",
  pubkey: "pubkey",
  created_at: 1,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "sig",
};

describe("publishWithTimeout", () => {
  it("publishes with the default AbortSignal timeout", async () => {
    const eventFn = vi.fn().mockResolvedValue(undefined);

    await publishWithTimeout({ event: eventFn }, event);

    expect(eventFn).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });

  it("exports the shared timeout budget", () => {
    expect(DEFAULT_PUBLISH_TIMEOUT_MS).toBe(8_000);
  });
});
