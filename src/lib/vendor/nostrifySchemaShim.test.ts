import { describe, expect, it } from "@/test/api";

import { NSchema } from "./nostrifySchemaShim";

const event = {
  id: "a".repeat(64),
  kind: 1,
  pubkey: "b".repeat(64),
  tags: [["p", "c".repeat(64)]],
  content: "hello",
  created_at: 1_700_000_000,
  sig: "d".repeat(128),
};

describe("nostrifySchemaShim", () => {
  it("parses JSON event payloads through pipe", () => {
    const parsed = NSchema.json().pipe(NSchema.event()).parse(JSON.stringify(event));

    expect(parsed).toEqual(event);
  });

  it("rejects malformed event shapes", () => {
    const result = NSchema.event().safeParse({
      ...event,
      tags: [["p", 123]],
    });

    expect(result.success).toBe(false);
  });

  it("parses supported relay message variants", () => {
    const relayMsg = NSchema.relayMsg();

    expect(relayMsg.safeParse(["EVENT", "sub", event]).success).toBe(true);
    expect(relayMsg.safeParse(["OK", event.id, true, ""]).success).toBe(true);
    expect(relayMsg.safeParse(["EOSE", "sub"]).success).toBe(true);
    expect(relayMsg.safeParse(["CLOSED", "sub", "auth-required: login"]).success).toBe(true);
    expect(relayMsg.safeParse(["AUTH", "challenge"]).success).toBe(true);
    expect(relayMsg.safeParse(["COUNT", "sub", { count: 2, approximate: true }]).success).toBe(true);
  });

  it("rejects unsupported relay messages", () => {
    const result = NSchema.relayMsg().safeParse(["NOTICE", 123]);

    expect(result.success).toBe(false);
  });

  it("parses NIP-46 connect responses", () => {
    const parsed = NSchema.json()
      .pipe(NSchema.connectResponse())
      .parse(JSON.stringify({ id: "request-1", result: "pong" }));

    expect(parsed).toEqual({ id: "request-1", result: "pong" });
  });
});
