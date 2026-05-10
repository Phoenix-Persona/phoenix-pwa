import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";

import { npubToHex } from "./nostrIds";

describe("npubToHex", () => {
  it("decodes an npub to a hex pubkey", () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);

    expect(npubToHex(nip19.npubEncode(pk))).toBe(pk);
  });

  it("returns null for non-npub identifiers", () => {
    const sk = generateSecretKey();

    expect(npubToHex(nip19.nsecEncode(sk))).toBeNull();
    expect(npubToHex("not-an-npub")).toBeNull();
  });
});
