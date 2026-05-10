import { describe, expect, it } from "vitest";

import {
  autoTopupConfigFromPersisted,
  autoTopupConfigToPersisted,
} from "./types";

describe("wallet auto-topup config mapping", () => {
  it("reads the new topup amount field", () => {
    expect(
      autoTopupConfigFromPersisted({
        enabled: true,
        threshold_usd: 7,
        topup_amount_usd: 12,
      }),
    ).toEqual({
      enabled: true,
      thresholdUsd: 7,
      topupAmountUsd: 12,
    });
  });

  it("maps legacy target_usd into the topup amount", () => {
    expect(
      autoTopupConfigFromPersisted({
        enabled: false,
        threshold_usd: 6,
        target_usd: 9,
      }),
    ).toEqual({
      enabled: false,
      thresholdUsd: 6,
      topupAmountUsd: 9,
    });
  });

  it("writes the new topup_amount_usd field", () => {
    expect(
      autoTopupConfigToPersisted({
        enabled: true,
        thresholdUsd: 5,
        topupAmountUsd: 10,
      }),
    ).toEqual({
      enabled: true,
      threshold_usd: 5,
      topup_amount_usd: 10,
    });
  });
});
