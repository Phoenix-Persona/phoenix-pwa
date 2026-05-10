import { describe, expect, it } from "vitest";

import { sanitizeHttpUrl } from "./url";

describe("sanitizeHttpUrl", () => {
  it("allows absolute http and https urls", () => {
    expect(sanitizeHttpUrl("https://example.com/a")).toBe(
      "https://example.com/a",
    );
    expect(sanitizeHttpUrl("http://example.com/a")).toBe(
      "http://example.com/a",
    );
  });

  it("rejects non-http protocols and invalid urls", () => {
    expect(sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeHttpUrl("data:text/html,hi")).toBeNull();
    expect(sanitizeHttpUrl("blob:https://example.com/id")).toBeNull();
    expect(sanitizeHttpUrl("/relative")).toBeNull();
    expect(sanitizeHttpUrl("not a url")).toBeNull();
    expect(sanitizeHttpUrl("")).toBeNull();
  });
});
