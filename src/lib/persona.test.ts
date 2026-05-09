import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";

import {
  PHOENIX_PAYLOAD_APP,
  PHOENIX_PAYLOAD_VERSION,
  parsePhoenixEnvelope,
  type PhoenixEnvelope,
} from "./persona";

/** Build a minimally valid Phoenix envelope with a real keypair. */
function makeValidEnvelope(overrides: Partial<PhoenixEnvelope> = {}): PhoenixEnvelope {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const nsec = nip19.nsecEncode(sk);

  const base: PhoenixEnvelope = {
    app: PHOENIX_PAYLOAD_APP,
    version: PHOENIX_PAYLOAD_VERSION,
    personaPubkey: pk,
    config: {
      name: "Voice of Test",
      region: "RW",
      cause: "human-rights",
      languages: ["en"],
      tone: "measured",
      frequencySec: 3600,
      sources: [{ kind: "url", url: "https://example.org" }],
      focus: ["press freedom"],
      model: "anthropic/claude-sonnet-4.5",
      systemPrompt: "You are a test persona.",
      personality: "calm",
      bio: "An AI-assisted test voice.",
      personaNsec: nsec,
    },
  };
  return { ...base, ...overrides };
}

describe("parsePhoenixEnvelope", () => {
  it("accepts a minimally valid envelope and normalizes pubkey casing", () => {
    const env = makeValidEnvelope();
    const upperPub = env.personaPubkey.toUpperCase();
    const json = JSON.stringify({ ...env, personaPubkey: upperPub });

    const parsed = parsePhoenixEnvelope(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.personaPubkey).toBe(env.personaPubkey.toLowerCase());
    expect(parsed!.config.personaNsec).toBe(env.config.personaNsec);
  });

  it("rejects non-JSON input", () => {
    expect(parsePhoenixEnvelope("not-json")).toBeNull();
    expect(parsePhoenixEnvelope("")).toBeNull();
  });

  it("rejects a JSON value that isn't an object", () => {
    expect(parsePhoenixEnvelope("null")).toBeNull();
    expect(parsePhoenixEnvelope('"hello"')).toBeNull();
    expect(parsePhoenixEnvelope("[1,2,3]")).toBeNull();
  });

  it("rejects an envelope with the wrong app discriminator", () => {
    const env = makeValidEnvelope();
    const tampered = { ...env, app: "phoenix" }; // old/short discriminator
    expect(parsePhoenixEnvelope(JSON.stringify(tampered))).toBeNull();
  });

  it("rejects an envelope with an unknown version", () => {
    const env = makeValidEnvelope();
    const v0 = { ...env, version: 0 };
    const v2 = { ...env, version: 2 };
    expect(parsePhoenixEnvelope(JSON.stringify(v0))).toBeNull();
    expect(parsePhoenixEnvelope(JSON.stringify(v2))).toBeNull();
  });

  it("rejects an envelope where personaPubkey is not 64 hex chars", () => {
    const env = makeValidEnvelope();
    const tampered = { ...env, personaPubkey: "not-hex" };
    expect(parsePhoenixEnvelope(JSON.stringify(tampered))).toBeNull();
  });

  it("rejects an envelope where personaPubkey doesn't match the embedded nsec", () => {
    const envA = makeValidEnvelope();
    const envB = makeValidEnvelope();
    // Take envelope A's metadata but inject envelope B's nsec — claimed
    // personaPubkey will no longer derive from the embedded key.
    const tampered = {
      ...envA,
      config: {
        ...envA.config,
        personaNsec: envB.config.personaNsec,
      },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(tampered))).toBeNull();
  });

  it("rejects an envelope missing required config fields", () => {
    const env = makeValidEnvelope();
    // Strip name
    const noName = {
      ...env,
      config: { ...env.config, name: undefined },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(noName))).toBeNull();

    // Strip personaNsec
    const noNsec = {
      ...env,
      config: { ...env.config, personaNsec: undefined },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(noNsec))).toBeNull();
  });

  it("rejects an envelope where personaNsec is not a valid nsec1 string", () => {
    const env = makeValidEnvelope();
    const tampered = {
      ...env,
      config: { ...env.config, personaNsec: "definitely-not-an-nsec" },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(tampered))).toBeNull();
  });

  it("rejects an envelope with an invalid languages array", () => {
    const env = makeValidEnvelope();
    const empty = {
      ...env,
      config: { ...env.config, languages: [] },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(empty))).toBeNull();
  });

  it("rejects an envelope with negative frequencySec", () => {
    const env = makeValidEnvelope();
    const neg = {
      ...env,
      config: { ...env.config, frequencySec: -1 },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(neg))).toBeNull();
  });

  it("rejects another app's NIP-78 self-encrypted JSON", () => {
    // Realistic example: Damus mute list, Habla draft, etc.
    const otherApp = JSON.stringify({
      app: "habla",
      version: 1,
      draft: { title: "Untitled", body: "..." },
    });
    expect(parsePhoenixEnvelope(otherApp)).toBeNull();
  });

  it("does not throw on extreme/garbage input", () => {
    expect(() => parsePhoenixEnvelope("\u0000\u0001\u0002")).not.toThrow();
    expect(() => parsePhoenixEnvelope("{")).not.toThrow();
    expect(() => parsePhoenixEnvelope("undefined")).not.toThrow();
  });
});
