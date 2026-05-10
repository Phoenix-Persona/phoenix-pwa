import { describe, expect, it } from "vitest";

import { queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("keeps persona detail keys stable", () => {
    expect(queryKeys.persona.detail("npub1", "operator")).toEqual([
      "phoenix-persona",
      "npub1",
      "operator",
    ]);
    expect(queryKeys.persona.allDetails()).toEqual(["phoenix-persona"]);
  });

  it("normalizes optional public profile pubkeys", () => {
    expect(queryKeys.persona.publicProfile(undefined)).toEqual([
      "persona-public-profile",
      "",
    ]);
  });

  it("centralizes partial keys for invalidation", () => {
    expect(queryKeys.nostr.authors()).toEqual(["nostr", "author"]);
    expect(queryKeys.ppq.allBalances()).toEqual(["ppq", "balance"]);
  });
});
