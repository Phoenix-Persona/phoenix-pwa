import { describe, expect, it } from "vitest";

import { parseFeatureFlag } from "./features";

describe("feature flags", () => {
  it("treats explicit truthy values as enabled", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on"]) {
      expect(parseFeatureFlag(value)).toBe(true);
    }
  });

  it("treats explicit falsey values as disabled", () => {
    for (const value of ["0", "false", "FALSE", "no", "off"]) {
      expect(parseFeatureFlag(value, true)).toBe(false);
    }
  });

  it("falls back for blank or unknown values", () => {
    expect(parseFeatureFlag(undefined, true)).toBe(true);
    expect(parseFeatureFlag("", true)).toBe(true);
    expect(parseFeatureFlag("later", false)).toBe(false);
  });
});
