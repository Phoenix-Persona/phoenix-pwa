import { describe, expect, it } from "@/test/api";

import { getDonateHandleNotice } from "./donateHandleNotice";

describe("getDonateHandleNotice", () => {
  it("returns missing notice when a loaded persona wallet has no handle", () => {
    expect(
      getDonateHandleNotice({
        hasPersona: true,
        hasWalletSeed: true,
        isInfoLoading: false,
        infoError: undefined,
        lightningAddress: undefined,
        dismissed: false,
      }),
    ).toEqual({ kind: "missing" });
  });

  it("returns error notice when wallet info cannot be verified", () => {
    expect(
      getDonateHandleNotice({
        hasPersona: true,
        hasWalletSeed: true,
        isInfoLoading: false,
        infoError: new Error("network down"),
        lightningAddress: undefined,
        dismissed: false,
      }),
    ).toEqual({ kind: "error", message: "network down" });
  });

  it("suppresses notice while loading, dismissed, missing seed, or already configured", () => {
    const base = {
      hasPersona: true,
      hasWalletSeed: true,
      isInfoLoading: false,
      infoError: undefined,
      lightningAddress: undefined,
      dismissed: false,
    };

    expect(getDonateHandleNotice({ ...base, isInfoLoading: true })).toBeNull();
    expect(getDonateHandleNotice({ ...base, dismissed: true })).toBeNull();
    expect(getDonateHandleNotice({ ...base, hasWalletSeed: false })).toBeNull();
    expect(getDonateHandleNotice({ ...base, lightningAddress: "voice@breez.tips" })).toBeNull();
  });
});
