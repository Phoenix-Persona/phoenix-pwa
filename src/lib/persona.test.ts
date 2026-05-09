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
    persona: {
      pubkey: pk,
      nsec,
      name: "Voice of Test",
      system_prompt: "You are a test persona.",
      voice_id: "alloy",
      languages: ["en"],
      tags: ["press-freedom"],
      created_at: Math.floor(Date.now() / 1000),
    },
  };
  return { ...base, ...overrides };
}

describe("parsePhoenixEnvelope", () => {
  it("accepts a minimally valid envelope and normalizes pubkey casing", () => {
    const env = makeValidEnvelope();
    const upperPub = env.persona.pubkey.toUpperCase();
    const json = JSON.stringify({
      ...env,
      persona: { ...env.persona, pubkey: upperPub },
    });

    const parsed = parsePhoenixEnvelope(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.persona.pubkey).toBe(env.persona.pubkey.toLowerCase());
    expect(parsed!.persona.nsec).toBe(env.persona.nsec);
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

  it("rejects an envelope where persona.pubkey is not 64 hex chars", () => {
    const env = makeValidEnvelope();
    const tampered = {
      ...env,
      persona: { ...env.persona, pubkey: "not-hex" },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(tampered))).toBeNull();
  });

  it("rejects an envelope where persona.pubkey doesn't match the embedded nsec", () => {
    const envA = makeValidEnvelope();
    const envB = makeValidEnvelope();
    // Take envelope A's metadata but inject envelope B's nsec — claimed
    // persona.pubkey will no longer derive from the embedded key.
    const tampered = {
      ...envA,
      persona: {
        ...envA.persona,
        nsec: envB.persona.nsec,
      },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(tampered))).toBeNull();
  });

  it("rejects an envelope missing required persona fields", () => {
    const env = makeValidEnvelope();
    // Strip name
    const noName = {
      ...env,
      persona: { ...env.persona, name: undefined },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(noName))).toBeNull();

    // Strip nsec
    const noNsec = {
      ...env,
      persona: { ...env.persona, nsec: undefined },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(noNsec))).toBeNull();
  });

  it("rejects an envelope where persona.nsec is not a valid nsec1 string", () => {
    const env = makeValidEnvelope();
    const tampered = {
      ...env,
      persona: { ...env.persona, nsec: "definitely-not-an-nsec" },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(tampered))).toBeNull();
  });

  it("rejects an envelope with an empty languages array", () => {
    const env = makeValidEnvelope();
    const empty = {
      ...env,
      persona: { ...env.persona, languages: [] },
    };
    expect(parsePhoenixEnvelope(JSON.stringify(empty))).toBeNull();
  });

  it("accepts an envelope with persona.dTag (stable per-persona d-tag)", () => {
    const env = makeValidEnvelope();
    const withDTag = {
      ...env,
      persona: { ...env.persona, dTag: "abc-123-stable-uuid" },
    };
    const parsed = parsePhoenixEnvelope(JSON.stringify(withDTag));
    expect(parsed).not.toBeNull();
    expect(parsed!.persona.dTag).toBe("abc-123-stable-uuid");
  });

  it("accepts an envelope without persona.dTag for back-compat", () => {
    const env = makeValidEnvelope();
    const parsed = parsePhoenixEnvelope(JSON.stringify(env));
    expect(parsed).not.toBeNull();
    expect(parsed!.persona.dTag).toBeUndefined();
  });

  it("accepts an envelope with optional wallet, model_prefs, settings", () => {
    const env = makeValidEnvelope();
    const enriched = {
      ...env,
      wallet: {
        kind: "spark",
        seed: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      },
      model_prefs: {
        agent: "anthropic/claude-sonnet-4.5",
        image: "openai/gpt-image-1",
        tts: "openai/tts-1-hd",
        video: null,
      },
      settings: { default_relays: ["wss://relay.damus.io"] },
    };
    const parsed = parsePhoenixEnvelope(JSON.stringify(enriched));
    expect(parsed).not.toBeNull();
    expect(parsed!.wallet?.kind).toBe("spark");
    expect(parsed!.model_prefs?.agent).toBe("anthropic/claude-sonnet-4.5");
    expect(parsed!.settings?.default_relays).toEqual(["wss://relay.damus.io"]);
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
