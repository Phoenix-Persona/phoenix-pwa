import { describe, expect, it } from "@/test/api";

import {
  backupPersonaPictureUrl,
  buildPersonaDisplayProfile,
  safePersonaPictureUrl,
} from "./personaView";

describe("persona view helpers", () => {
  it("builds a display profile from public metadata", () => {
    expect(
      buildPersonaDisplayProfile({
        metadata: {
          display_name: "Display Voice",
          name: "Voice",
          about: "Bio",
          picture: "https://example.com/pic.png",
        },
        fallbackPubkey: "a".repeat(64),
      }),
    ).toEqual({
      displayName: "Display Voice",
      bio: "Bio",
      pictureUrl: "https://example.com/pic.png",
    });
  });

  it("falls back to a provided name before generated pubkey names", () => {
    expect(
      buildPersonaDisplayProfile({
        metadata: undefined,
        fallbackPubkey: "a".repeat(64),
        fallbackName: "Backup Voice",
      }).displayName,
    ).toBe("Backup Voice");
  });

  it("sanitizes persona image urls", () => {
    expect(safePersonaPictureUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
    expect(safePersonaPictureUrl("javascript:alert(1)")).toBeNull();
    expect(backupPersonaPictureUrl({ reference_image_url: "data:text/html,hi" })).toBeNull();
  });
});
