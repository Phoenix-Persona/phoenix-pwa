import { describe, expect, it } from "@/test/api";
import type { NostrEvent } from "@nostrify/nostrify";

import {
  extractZapAmountSats,
  extractZapComment,
  extractZapperPubkey,
  formatSatsCompact,
  groupInteractions,
  parseBolt11AmountSats,
} from "./postInteractions";

function ev(partial: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "id",
    pubkey: "pk",
    kind: 1,
    created_at: 0,
    tags: [],
    content: "",
    sig: "sig",
    ...partial,
  };
}

describe("groupInteractions", () => {
  it("buckets events by kind and sorts each bucket newest-first", () => {
    const events: NostrEvent[] = [
      ev({ id: "r1", kind: 1, created_at: 100 }),
      ev({ id: "r2", kind: 1, created_at: 200 }),
      ev({ id: "lk", kind: 7, created_at: 50 }),
      ev({ id: "z1", kind: 9735, created_at: 300 }),
    ];
    const grouped = groupInteractions(events);
    expect(grouped.replies.map((e) => e.id)).toEqual(["r2", "r1"]);
    expect(grouped.reactions.map((e) => e.id)).toEqual(["lk"]);
    expect(grouped.zaps.map((e) => e.id)).toEqual(["z1"]);
  });

  it("ignores unrelated kinds", () => {
    const grouped = groupInteractions([ev({ kind: 0 })]);
    expect(grouped.replies).toHaveLength(0);
    expect(grouped.reactions).toHaveLength(0);
    expect(grouped.zaps).toHaveLength(0);
  });
});

describe("parseBolt11AmountSats", () => {
  it("decodes microsat (u) invoices", () => {
    // 100u BTC = 100 × 10⁻⁶ BTC = 0.0001 BTC = 10 000 sats
    expect(parseBolt11AmountSats("lnbc100u1pjabcdef")).toBe(10_000);
  });

  it("decodes nanosat (n) invoices", () => {
    // 210n BTC = 210 × 10⁻⁹ BTC = 21 sats
    expect(parseBolt11AmountSats("lnbc210n1pjabcdef")).toBe(21);
  });

  it("decodes millisat (m) invoices", () => {
    // 1m BTC = 10⁻³ BTC = 100 000 sats
    expect(parseBolt11AmountSats("lnbc1m1pjabcdef")).toBe(100_000);
  });

  it("decodes picosat (p) invoices", () => {
    // 10000p BTC = 1 sat
    expect(parseBolt11AmountSats("lnbc10000p1pjabcdef")).toBe(1);
  });

  it("returns undefined for amount-less invoices", () => {
    expect(parseBolt11AmountSats("lnbc1pjabcdef")).toBeUndefined();
  });

  it("handles testnet/signet prefixes", () => {
    expect(parseBolt11AmountSats("lntb210n1pjabc")).toBe(21);
    expect(parseBolt11AmountSats("lnsb500n1pjabc")).toBe(50);
  });

  it("returns undefined for non-ln strings", () => {
    expect(parseBolt11AmountSats("garbage")).toBeUndefined();
    expect(parseBolt11AmountSats("")).toBeUndefined();
  });
});

describe("extractZapAmountSats", () => {
  it("prefers the bolt11 amount when present", () => {
    const receipt = ev({
      kind: 9735,
      tags: [
        ["bolt11", "lnbc210n1pjabcdef"],
        ["description", JSON.stringify({ tags: [["amount", "999000"]] })],
      ],
    });
    expect(extractZapAmountSats(receipt)).toBe(21);
  });

  it("falls back to the embedded zap request's amount tag (millisats)", () => {
    const request = {
      kind: 9734,
      pubkey: "z".repeat(64),
      content: "thanks!",
      tags: [["amount", "21000"]],
    };
    const receipt = ev({
      kind: 9735,
      tags: [["description", JSON.stringify(request)]],
    });
    expect(extractZapAmountSats(receipt)).toBe(21);
  });

  it("returns undefined when bolt11 has no amount and description is missing", () => {
    const receipt = ev({
      kind: 9735,
      tags: [["bolt11", "lnbc1pjabcdef"]],
    });
    expect(extractZapAmountSats(receipt)).toBeUndefined();
  });

  it("returns undefined when description is not JSON", () => {
    const receipt = ev({
      kind: 9735,
      tags: [["description", "not-json"]],
    });
    expect(extractZapAmountSats(receipt)).toBeUndefined();
  });

  it("returns undefined when amount tag is missing", () => {
    const receipt = ev({
      kind: 9735,
      tags: [["description", JSON.stringify({ tags: [] })]],
    });
    expect(extractZapAmountSats(receipt)).toBeUndefined();
  });
});

describe("extractZapComment", () => {
  it("returns the embedded zap request content when non-empty", () => {
    const receipt = ev({
      kind: 9735,
      tags: [
        [
          "description",
          JSON.stringify({ content: "great post", tags: [["amount", "1000"]] }),
        ],
      ],
    });
    expect(extractZapComment(receipt)).toBe("great post");
  });

  it("returns undefined for empty/whitespace content", () => {
    const receipt = ev({
      kind: 9735,
      tags: [["description", JSON.stringify({ content: "  ", tags: [] })]],
    });
    expect(extractZapComment(receipt)).toBeUndefined();
  });
});

describe("extractZapperPubkey", () => {
  it("returns the embedded request's pubkey, not the receipt's pubkey", () => {
    const zapper = "a".repeat(64);
    const receipt = ev({
      kind: 9735,
      pubkey: "b".repeat(64),
      tags: [
        [
          "description",
          JSON.stringify({ pubkey: zapper, tags: [["amount", "1000"]] }),
        ],
      ],
    });
    expect(extractZapperPubkey(receipt)).toBe(zapper);
  });

  it("falls back to the receipt's pubkey when description is malformed", () => {
    const receipt = ev({
      kind: 9735,
      pubkey: "c".repeat(64),
      tags: [["description", "junk"]],
    });
    expect(extractZapperPubkey(receipt)).toBe("c".repeat(64));
  });
});

describe("formatSatsCompact", () => {
  it("formats small numbers as-is", () => {
    expect(formatSatsCompact(0)).toBe("0");
    expect(formatSatsCompact(42)).toBe("42");
    expect(formatSatsCompact(999)).toBe("999");
  });

  it("uses k for thousands", () => {
    expect(formatSatsCompact(1_000)).toBe("1.0k");
    expect(formatSatsCompact(21_000)).toBe("21.0k");
  });

  it("uses M for millions", () => {
    expect(formatSatsCompact(1_000_000)).toBe("1.0M");
  });
});
