import { describe, expect, it } from "vitest";

import { formatDeletePersonaWarnings } from "./personaDeleteWarnings";

describe("formatDeletePersonaWarnings", () => {
  it("returns undefined when there are no warnings", () => {
    expect(formatDeletePersonaWarnings([])).toBeUndefined();
  });

  it("formats a single warning for toast copy", () => {
    expect(formatDeletePersonaWarnings(["kind0-lookup"])).toBe(
      "Deleted, but the public profile deletion lookup could not be confirmed.",
    );
  });

  it("formats multiple warnings without exposing internal warning codes", () => {
    expect(
      formatDeletePersonaWarnings([
        "backup-decrypt",
        "lightning-address-release",
      ]),
    ).toBe(
      "Deleted, but backup decrypt and Lightning Address release cleanup could not be confirmed.",
    );
  });
});
