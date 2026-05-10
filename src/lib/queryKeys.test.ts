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

  it("scopes PPQ account cache entries by operator", () => {
    expect(queryKeys.ppq.account("operator-a")).toEqual([
      "ppq",
      "account",
      "operator-a",
    ]);
    expect(queryKeys.ppq.allAccounts()).toEqual(["ppq", "account"]);
  });

  it("scopes PPQ account-adjacent caches by credit id", () => {
    expect(queryKeys.ppq.topup("credit-a", "invoice-a")).toEqual([
      "ppq",
      "topup",
      "credit-a",
      "invoice-a",
    ]);
    expect(queryKeys.ppq.nwcAutoTopup("credit-a")).toEqual([
      "ppq",
      "nwc-auto-topup",
      "credit-a",
    ]);
    expect(queryKeys.ppq.video("credit-a", "video-a")).toEqual([
      "ppq",
      "video",
      "credit-a",
      "video-a",
    ]);
  });
});
