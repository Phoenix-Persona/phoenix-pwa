import { describe, expect, it } from "@/test/api";

import {
  buildOperatorEventTemplate,
  parseOperatorEnvelope,
  PHOENIX_OPERATOR_APP,
  PHOENIX_OPERATOR_VERSION,
  type OperatorEnvelope,
} from "./index";

describe("operator envelope", () => {
  it("accepts a stable dTag inside the encrypted payload", () => {
    const env: OperatorEnvelope = {
      app: PHOENIX_OPERATOR_APP,
      version: PHOENIX_OPERATOR_VERSION,
      dTag: "operator-stable-dtag",
      created_at: 1,
    };

    expect(parseOperatorEnvelope(JSON.stringify(env))?.dTag).toBe(
      "operator-stable-dtag",
    );
  });

  it("builds kind 30078 with the caller-provided dTag", () => {
    const event = buildOperatorEventTemplate({
      dTag: "operator-stable-dtag",
      encryptedContent: "ciphertext",
      createdAt: 100,
    });

    expect(event.kind).toBe(30078);
    expect(event.tags).toEqual([["d", "operator-stable-dtag"]]);
    expect(event.created_at).toBe(100);
  });
});
