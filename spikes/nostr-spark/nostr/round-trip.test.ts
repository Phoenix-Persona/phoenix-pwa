/**
 * Spike C — Part 1: Nostr crypto round-trip + envelope shape verification.
 *
 * Validates the end-to-end cryptographic pattern Phoenix V1 depends on:
 *   1. NIP-44 self-encrypt the persona envelope (user → user)
 *   2. NIP-49 wrap the user's nsec for at-rest storage (Phase 1b)
 *   3. Kind 30078 envelope is privacy-preserving (no `t`/`alt` tags)
 *   4. The full encrypt → publish-shape → decrypt → parse → derive-verify
 *      pipeline works on a fresh keypair pair
 *   5. Scan-and-decrypt loop with the per-event-id cache pays back
 *      the cost of multi-persona discovery
 *
 * Benchmarks reported via console.log so `npm test -- --reporter=verbose`
 * surfaces them on demand. They aren't asserted-on (system-load
 * dependent), but the absolute numbers go into docs/spike-nostr.md.
 *
 * Spike deliverable: docs/spike-nostr.md
 */

import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";

import {
  buildEncryptedPersonaTemplate,
  generatePersonaDTag,
  isCandidatePersonaEvent,
  PERSONA_KIND,
  PHOENIX_PAYLOAD_APP,
  PHOENIX_PAYLOAD_VERSION,
  type Persona,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  tryDecryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";
import {
  decryptNcryptsec,
  encryptNsec,
} from "@/lib/nip49Storage";

// ─────────── Test signer ───────────
//
// In production, the user's signer (extension / NIP-46 / nsec login)
// provides `nip44.encrypt(recipient, plaintext)` etc. For the spike
// we wrap a local nsec into the same shape so we exercise the
// production encrypt/decrypt code paths without standing up Nostrify.

interface SpikeSigner extends Nip44Signer {
  pubkey: string;
  sk: Uint8Array;
}

function makeSelfSigner(skBytes: Uint8Array): SpikeSigner {
  const pubkey = getPublicKey(skBytes);
  const conversationKey = nip44.getConversationKey(skBytes, pubkey);
  return {
    pubkey,
    sk: skBytes,
    nip44: {
      encrypt: async (recipient: string, plaintext: string) => {
        if (recipient.toLowerCase() !== pubkey.toLowerCase()) {
          throw new Error("spike signer only supports self-encrypt");
        }
        return nip44.encrypt(plaintext, conversationKey);
      },
      decrypt: async (sender: string, ciphertext: string) => {
        if (sender.toLowerCase() !== pubkey.toLowerCase()) {
          throw new Error("spike signer only supports self-decrypt");
        }
        return nip44.decrypt(ciphertext, conversationKey);
      },
    },
  };
}

function makePersona(skBytes?: Uint8Array): {
  sk: Uint8Array;
  persona: Persona;
} {
  const sk = skBytes ?? generateSecretKey();
  const pk = getPublicKey(sk);
  const persona: Persona = {
    pubkey: pk,
    nsec: nip19.nsecEncode(sk),
    name: "Spike Test Voice",
    system_prompt: "You are a test persona for the Spike C round-trip.",
    voice_id: "alloy",
    languages: ["en"],
    tags: ["spike", "test"],
    created_at: Math.floor(Date.now() / 1000),
  };
  return { sk, persona };
}

// ─────────── 1. End-to-end envelope round-trip ───────────

describe("Spike C — NIP-44 self-encrypted persona envelope", () => {
  it("user-encrypts a persona envelope, signs the kind 30078, and decrypts back", async () => {
    const userSk = generateSecretKey();
    const signer = makeSelfSigner(userSk);
    const { persona } = makePersona();

    // 1. Encrypt envelope (user → user).
    const ciphertext = await encryptPhoenixEnvelope(
      { persona },
      signer.pubkey,
      signer
    );
    expect(ciphertext.length).toBeGreaterThan(0);

    // 2. Build the kind 30078 template — assert privacy posture.
    const template = buildEncryptedPersonaTemplate({
      dTag: generatePersonaDTag(),
      encryptedContent: ciphertext,
    });

    expect(template.kind).toBe(PERSONA_KIND);
    expect(template.tags.map((tag: string[]) => tag[0])).toEqual(["d"]);
    // No `t` tag, no `alt` tag — that's the locked privacy posture.
    expect(template.tags.find((tag: string[]) => tag[0] === "t")).toBeUndefined();
    expect(template.tags.find((tag: string[]) => tag[0] === "alt")).toBeUndefined();
    expect(template.content).toBe(ciphertext);

    // 3. Sign with the user's key — produces a real Nostr event.
    const event = finalizeEvent(template, userSk);
    expect(event.id).toBeDefined();
    expect(event.sig).toBeDefined();
    expect(event.pubkey).toBe(signer.pubkey);
    expect(isCandidatePersonaEvent(event)).toBe(true);

    // 4. Decrypt + parse + derive-verify all the way back to the persona.
    const recovered = await tryDecryptPhoenixEnvelope(
      event.content,
      signer.pubkey,
      signer
    );
    expect(recovered).not.toBeNull();
    expect(recovered!.app).toBe(PHOENIX_PAYLOAD_APP);
    expect(recovered!.version).toBe(PHOENIX_PAYLOAD_VERSION);
    expect(recovered!.persona.pubkey.toLowerCase()).toBe(
      persona.pubkey.toLowerCase()
    );
    expect(recovered!.persona.nsec).toBe(persona.nsec);
    expect(recovered!.persona.name).toBe(persona.name);
  });

  it("returns null when a different user tries to decrypt", async () => {
    const userA = makeSelfSigner(generateSecretKey());
    const userB = makeSelfSigner(generateSecretKey());
    const { persona } = makePersona();

    const ciphertext = await encryptPhoenixEnvelope(
      { persona },
      userA.pubkey,
      userA
    );

    // userB tries to self-decrypt userA's envelope — fails silently.
    const result = await tryDecryptPhoenixEnvelope(
      ciphertext,
      userB.pubkey,
      userB
    );
    expect(result).toBeNull();
  });

  it("returns null for a non-Phoenix NIP-78 payload (silent skip)", async () => {
    const user = makeSelfSigner(generateSecretKey());

    // Pretend we found another app's encrypted-app-data event in the
    // user's kind 30078 stream.
    const otherAppPayload = JSON.stringify({
      app: "habla",
      version: 1,
      drafts: [{ title: "Untitled" }],
    });
    const ciphertext = await user.nip44.encrypt(user.pubkey, otherAppPayload);

    const result = await tryDecryptPhoenixEnvelope(
      ciphertext,
      user.pubkey,
      user
    );
    expect(result).toBeNull();
  });

  it("rejects a tampered envelope where personaPubkey ≠ deriveFromNsec(persona.nsec)", async () => {
    const user = makeSelfSigner(generateSecretKey());
    const { persona: a } = makePersona();
    const { persona: b } = makePersona();

    // Splice persona A's metadata around persona B's nsec.
    const tampered = {
      app: PHOENIX_PAYLOAD_APP,
      version: PHOENIX_PAYLOAD_VERSION,
      persona: { ...a, nsec: b.nsec },
    };
    const ciphertext = await user.nip44.encrypt(
      user.pubkey,
      JSON.stringify(tampered)
    );

    const result = await tryDecryptPhoenixEnvelope(
      ciphertext,
      user.pubkey,
      user
    );
    expect(result).toBeNull();
  });
});

// ─────────── 2. NIP-49 round-trip ───────────

describe("Spike C — NIP-49 ncryptsec at-rest", () => {
  it("round-trips a user nsec through encryptNsec → decryptNcryptsec", () => {
    const sk = generateSecretKey();
    // log_n=8 here keeps the test fast; the production default is 18.
    const ncryptsec = encryptNsec(sk, "spike-passphrase", 8);
    expect(ncryptsec.startsWith("ncryptsec1")).toBe(true);

    const recovered = decryptNcryptsec(ncryptsec, "spike-passphrase");
    expect(recovered).toEqual(sk);
  });
});

// ─────────── 3. Scan-and-decrypt cache benchmark ───────────

describe("Spike C — scan-and-decrypt cache pays for itself", () => {
  it("simulates 100-event scan and confirms cache reduces work", async () => {
    const user = makeSelfSigner(generateSecretKey());

    // 100 candidate kind 30078 events from the user. 1 of them is a
    // real Phoenix persona; the other 99 are unrelated app data
    // (other apps' encrypted-application-data events) that we have
    // to reject by attempting decryption.
    const { persona } = makePersona();
    const personaCiphertext = await encryptPhoenixEnvelope(
      { persona },
      user.pubkey,
      user
    );
    const personaEvent = finalizeEvent(
      buildEncryptedPersonaTemplate({
        dTag: generatePersonaDTag(),
        encryptedContent: personaCiphertext,
      }),
      user.sk
    );

    // Stand-in unrelated payloads — different app, different shape.
    // The events are signed by the same user (matches what scan-and-
    // decrypt would actually find on relays).
    const noiseEvents = await Promise.all(
      Array.from({ length: 99 }, async () => {
        const ct = await user.nip44.encrypt(
          user.pubkey,
          JSON.stringify({ app: "noise", payload: Math.random() })
        );
        return finalizeEvent(
          buildEncryptedPersonaTemplate({
            dTag: generatePersonaDTag(),
            encryptedContent: ct,
          }),
          user.sk
        );
      })
    );
    const allEvents = [personaEvent, ...noiseEvents];

    // Cold pass: every event is decrypted.
    const cache = new Map<string, "phoenix" | "not-phoenix">();
    const t0 = performance.now();
    let coldHits = 0;
    for (const ev of allEvents) {
      const env = await tryDecryptPhoenixEnvelope(
        ev.content,
        user.pubkey,
        user
      );
      cache.set(ev.id, env ? "phoenix" : "not-phoenix");
      if (env) coldHits++;
    }
    const cold = performance.now() - t0;

    // Warm pass: cache returns immediately for every event.
    const t1 = performance.now();
    let warmHits = 0;
    for (const ev of allEvents) {
      const cached = cache.get(ev.id);
      if (cached === "phoenix") warmHits++;
    }
    const warm = performance.now() - t1;

    expect(coldHits).toBe(1);
    expect(warmHits).toBe(1);
    expect(warm).toBeLessThan(cold);

    console.log(
      `[spike] scan-and-decrypt 100 events  cold=${cold.toFixed(1)}ms  warm=${warm.toFixed(2)}ms  speedup=${(cold / warm).toFixed(0)}×`
    );
  });
});

// ─────────── 4. Production-load benchmarks (always run) ───────────
//
// These produce numbers for docs/spike-nostr.md. They don't make
// assertions about absolute timing (system-load dependent) but they
// do confirm everything completes inside the test timeout.

describe("Spike C — production-load benchmarks", () => {
  it("NIP-49 encrypt + decrypt at log_n=18 (production default)", () => {
    const sk = generateSecretKey();

    const t0 = performance.now();
    const ncryptsec = encryptNsec(sk, "production-passphrase", 18);
    const encryptMs = performance.now() - t0;

    const t1 = performance.now();
    const recovered = decryptNcryptsec(ncryptsec, "production-passphrase");
    const decryptMs = performance.now() - t1;

    expect(recovered).toEqual(sk);

    console.log(
      `[spike] NIP-49 log_n=18  encrypt=${encryptMs.toFixed(0)}ms  decrypt=${decryptMs.toFixed(0)}ms`
    );
  }, 30_000); // generous timeout — log_n=18 can be ~400ms but mobile slower

  it("NIP-44 self-encrypt latency for a typical envelope", async () => {
    const user = makeSelfSigner(generateSecretKey());
    const { persona } = makePersona();

    // Warm up — first call may JIT.
    await encryptPhoenixEnvelope({ persona }, user.pubkey, user);

    const N = 50;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      await encryptPhoenixEnvelope({ persona }, user.pubkey, user);
    }
    const totalMs = performance.now() - t0;
    const avgMs = totalMs / N;

    console.log(
      `[spike] NIP-44 self-encrypt  avg=${avgMs.toFixed(2)}ms / op  (n=${N})`
    );
    expect(avgMs).toBeGreaterThan(0);
  });
});


