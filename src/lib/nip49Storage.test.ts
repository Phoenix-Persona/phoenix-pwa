import { afterEach, describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools/pure";

import {
  clearUserNcryptsec,
  decryptNcryptsec,
  encryptNsec,
  hasUserNcryptsec,
  loadUserNcryptsec,
  storeUserNcryptsec,
} from "./nip49Storage";

// Tests use a low log_n for speed. Production default is 18.
const TEST_LOG_N = 8;

afterEach(() => {
  clearUserNcryptsec();
});

describe("nip49Storage — encrypt/decrypt", () => {
  it("round-trips an nsec through encrypt → decrypt", () => {
    const sk = generateSecretKey();
    const ncryptsec = encryptNsec(sk, "correct horse battery staple", TEST_LOG_N);
    expect(ncryptsec.startsWith("ncryptsec1")).toBe(true);

    const decoded = decryptNcryptsec(ncryptsec, "correct horse battery staple");
    expect(decoded).toEqual(sk);
  });

  it("rejects an nsec that isn't 32 bytes", () => {
    const wrong = new Uint8Array(16);
    expect(() => encryptNsec(wrong, "pw", TEST_LOG_N)).toThrow();
  });

  it("requires a passphrase to encrypt", () => {
    const sk = generateSecretKey();
    expect(() => encryptNsec(sk, "", TEST_LOG_N)).toThrow();
  });

  it("requires a passphrase to decrypt", () => {
    const sk = generateSecretKey();
    const ncryptsec = encryptNsec(sk, "pw", TEST_LOG_N);
    expect(() => decryptNcryptsec(ncryptsec, "")).toThrow();
  });

  it("rejects a non-ncryptsec input on decrypt", () => {
    expect(() => decryptNcryptsec("not-an-ncryptsec", "pw")).toThrow();
    expect(() => decryptNcryptsec("nsec1abc", "pw")).toThrow();
  });

  it("throws on wrong passphrase (AEAD tag verification fails)", () => {
    const sk = generateSecretKey();
    const ncryptsec = encryptNsec(sk, "right", TEST_LOG_N);
    expect(() => decryptNcryptsec(ncryptsec, "wrong")).toThrow();
  });

  it("produces different ciphertexts for the same key + passphrase", () => {
    // Salt randomness means two encryptions of the same input differ.
    const sk = generateSecretKey();
    const a = encryptNsec(sk, "pw", TEST_LOG_N);
    const b = encryptNsec(sk, "pw", TEST_LOG_N);
    expect(a).not.toBe(b);
  });
});

describe("nip49Storage — localStorage helpers", () => {
  it("returns null and false when nothing is stored", () => {
    expect(loadUserNcryptsec()).toBeNull();
    expect(hasUserNcryptsec()).toBe(false);
  });

  it("round-trips through localStorage", () => {
    const sk = generateSecretKey();
    const ncryptsec = encryptNsec(sk, "pw", TEST_LOG_N);
    storeUserNcryptsec(ncryptsec);
    expect(loadUserNcryptsec()).toBe(ncryptsec);
    expect(hasUserNcryptsec()).toBe(true);
  });

  it("clears removes the stored value", () => {
    const sk = generateSecretKey();
    storeUserNcryptsec(encryptNsec(sk, "pw", TEST_LOG_N));
    expect(hasUserNcryptsec()).toBe(true);
    clearUserNcryptsec();
    expect(hasUserNcryptsec()).toBe(false);
    expect(loadUserNcryptsec()).toBeNull();
  });

  it("loadUserNcryptsec returns null for a value that isn't an ncryptsec", () => {
    // Defends against unrelated values getting parked under the key
    // (e.g. by an older version of the app or a test left an artifact).
    if (typeof window !== "undefined") {
      window.localStorage.setItem("zuka:user:ncryptsec", "garbage");
      expect(loadUserNcryptsec()).toBeNull();
    }
  });
});
