import { describe, expect, it } from "vitest";

import { parseCommaList } from "./text";

describe("parseCommaList", () => {
  it("trims and lowercases comma-separated values", () => {
    expect(parseCommaList("En, RW, press-freedom", ["en"])).toEqual([
      "en",
      "rw",
      "press-freedom",
    ]);
  });

  it("uses the fallback when the input has no values", () => {
    expect(parseCommaList(" , ", ["en"])).toEqual(["en"]);
  });
});
