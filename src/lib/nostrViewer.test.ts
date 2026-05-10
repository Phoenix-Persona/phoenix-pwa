import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";

import {
  buildEventUrl,
  DEFAULT_NOSTR_VIEWER_URL,
  encodeEventAsNevent,
  findPresetByUrl,
  NOSTR_VIEWER_PRESETS,
  truncateNevent,
} from "./nostrViewer";

describe("buildEventUrl", () => {
  it("joins prefix and nevent with a single slash", () => {
    expect(buildEventUrl("https://njump.me/", "nevent1abc")).toBe(
      "https://njump.me/nevent1abc",
    );
  });

  it("normalises a prefix without a trailing slash", () => {
    expect(buildEventUrl("https://njump.me", "nevent1abc")).toBe(
      "https://njump.me/nevent1abc",
    );
  });

  it("collapses multiple trailing slashes", () => {
    expect(buildEventUrl("https://primal.net/e///", "nevent1xyz")).toBe(
      "https://primal.net/e/nevent1xyz",
    );
  });
});

describe("truncateNevent", () => {
  it("returns short strings unchanged", () => {
    expect(truncateNevent("nevent1short")).toBe("nevent1short");
  });

  it("truncates long strings with an ellipsis", () => {
    const long = "nevent1" + "a".repeat(60) + "tail00";
    const out = truncateNevent(long);
    expect(out.startsWith("nevent1aaaaa")).toBe(true);
    expect(out.endsWith("tail00")).toBe(true);
    expect(out).toContain("…");
  });
});

describe("encodeEventAsNevent", () => {
  it("encodes id + pubkey + kind into a decodable nevent", () => {
    const id = "a".repeat(64);
    const pubkey = "b".repeat(64);
    const nevent = encodeEventAsNevent({ id, pubkey, kind: 1 });

    expect(nevent.startsWith("nevent1")).toBe(true);
    const decoded = nip19.decode(nevent);
    expect(decoded.type).toBe("nevent");
    if (decoded.type === "nevent") {
      expect(decoded.data.id).toBe(id);
      expect(decoded.data.author).toBe(pubkey);
      expect(decoded.data.kind).toBe(1);
    }
  });

  it("includes relay hints when provided", () => {
    const id = "a".repeat(64);
    const pubkey = "b".repeat(64);
    const relays = ["wss://relay.damus.io", "wss://nos.lol"];
    const nevent = encodeEventAsNevent({ id, pubkey, kind: 1 }, relays);

    const decoded = nip19.decode(nevent);
    expect(decoded.type).toBe("nevent");
    if (decoded.type === "nevent") {
      expect(decoded.data.relays).toEqual(relays);
    }
  });
});

describe("preset registry", () => {
  it("resolves the default URL to a known preset", () => {
    expect(findPresetByUrl(DEFAULT_NOSTR_VIEWER_URL)).toBeDefined();
  });

  it("returns undefined for an unknown URL", () => {
    expect(findPresetByUrl("https://example.com/")).toBeUndefined();
  });

  it("includes njump as a preset", () => {
    expect(NOSTR_VIEWER_PRESETS.some((p) => p.id === "njump")).toBe(true);
  });
});
