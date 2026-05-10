import { describe, expect, it } from "vitest";

import { sanitizeHttpsUrl } from "./url";

describe("sanitizeHttpsUrl", () => {
  it("allows absolute https urls", () => {
    expect(sanitizeHttpsUrl("https://example.com/a")).toBe(
      "https://example.com/a",
    );
  });

  it("rejects http, non-http protocols, and invalid urls", () => {
    expect(sanitizeHttpsUrl("http://example.com/a")).toBeNull();
    expect(sanitizeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeHttpsUrl("data:text/html,hi")).toBeNull();
    expect(sanitizeHttpsUrl("blob:https://example.com/id")).toBeNull();
    expect(sanitizeHttpsUrl("/relative")).toBeNull();
    expect(sanitizeHttpsUrl("not a url")).toBeNull();
    expect(sanitizeHttpsUrl("")).toBeNull();
  });
});
