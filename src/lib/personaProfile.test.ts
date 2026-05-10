import { describe, expect, it } from "vitest";

import { buildPersonaProfileMetadata } from "./personaProfile";

describe("buildPersonaProfileMetadata", () => {
  it("uses username for kind 0 name and displayName for display_name", () => {
    expect(
      buildPersonaProfileMetadata({
        name: "Voice of Rwanda",
        username: "voice-of-rwanda",
        displayName: "Voice of Rwanda",
        bio: "Bio",
      }),
    ).toMatchObject({
      name: "voice-of-rwanda",
      display_name: "Voice of Rwanda",
      about: "Bio",
      picture: "",
      bot: true,
    });
  });

  it("includes lud16 and Phoenix reference-image metadata when present", () => {
    expect(
      buildPersonaProfileMetadata({
        name: "Voice",
        bio: "Bio",
        pictureUrl: "https://example.com/pic.png",
        lightningAddress: "voice@breez.tips",
      }),
    ).toEqual({
      name: "Voice",
      display_name: "Voice",
      about: "Bio",
      picture: "https://example.com/pic.png",
      bot: true,
      lud16: "voice@breez.tips",
      phoenix: {
        reference_image: "https://example.com/pic.png",
        version: 1,
      },
    });
  });
});
