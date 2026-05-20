import type { NostrEvent, NostrSigner } from "@nostrify/types";

import { describe, expect, it, mockFn } from "@/test/api";

import { NConnectSigner } from "./nostrifyRuntime";

type TestRelay = ConstructorParameters<typeof NConnectSigner>[0]["relay"];

const signedEvent: NostrEvent = {
  id: "e".repeat(64),
  kind: 1,
  pubkey: "f".repeat(64),
  tags: [],
  content: "signed",
  created_at: 1_700_000_000,
  sig: "0".repeat(128),
};

function makeLocalSigner(overrides: Partial<NostrSigner> = {}) {
  const signer = {
    getPublicKey: mockFn(async () => "a".repeat(64)),
    signEvent: mockFn(async (template: unknown) => ({
      ...(template as Omit<NostrEvent, "id" | "pubkey" | "sig">),
      id: "b".repeat(64),
      pubkey: "a".repeat(64),
      sig: "c".repeat(128),
    })),
    nip44: {
      encrypt: mockFn(async (_pubkey: string, plaintext: string) => plaintext),
      decrypt: mockFn(async (_pubkey: string, ciphertext: string) => ciphertext),
    },
    ...overrides,
  };
  return signer as unknown as NostrSigner;
}

function makeRelay(contents: string[]): TestRelay {
  const relay = {
    event: mockFn(async () => undefined),
    req: mockFn(async function* () {
      for (const content of contents) {
        yield [
          "EVENT",
          "sub",
          {
            ...signedEvent,
            kind: 24133,
            content,
          },
        ];
      }
    }),
  };
  return relay as unknown as TestRelay;
}

function stubRandomUUID(value: `${string}-${string}-${string}-${string}-${string}`) {
  const original = crypto.randomUUID;
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => value,
  });
  return () => {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: original,
    });
  };
}

describe("NConnectSigner shim", () => {
  it("returns the signed event from a remote sign_event response", async () => {
    const relay = makeRelay([
      JSON.stringify({
        id: "not-this-request",
        result: JSON.stringify({ ...signedEvent, id: "1".repeat(64) }),
      }),
      JSON.stringify({
        id: "00000000-0000-4000-8000-000000000001",
        result: JSON.stringify(signedEvent),
      }),
    ]);
    const signer = new NConnectSigner({
      relay,
      pubkey: "d".repeat(64),
      signer: makeLocalSigner(),
    });
    const restoreRandomUUID = stubRandomUUID("00000000-0000-4000-8000-000000000001");
    try {
      await expect(signer.signEvent({
        kind: 1,
        tags: [],
        content: "template",
        created_at: 1_700_000_000,
      })).resolves.toEqual(signedEvent);
    } finally {
      restoreRandomUUID();
    }
  });

  it("parses get_relays permission maps", async () => {
    const relay = makeRelay([
      JSON.stringify({
        id: "00000000-0000-4000-8000-000000000002",
        result: JSON.stringify({
          "wss://relay.example": { read: true, write: false },
        }),
      }),
    ]);
    const signer = new NConnectSigner({
      relay,
      pubkey: "d".repeat(64),
      signer: makeLocalSigner(),
    });
    const restoreRandomUUID = stubRandomUUID("00000000-0000-4000-8000-000000000002");
    try {
      await expect(signer.getRelays()).resolves.toEqual({
        "wss://relay.example": { read: true, write: false },
      });
    } finally {
      restoreRandomUUID();
    }
  });

  it("throws remote signer errors", async () => {
    const relay = makeRelay([
      JSON.stringify({
        id: "00000000-0000-4000-8000-000000000003",
        result: "",
        error: "permission denied",
      }),
    ]);
    const signer = new NConnectSigner({
      relay,
      pubkey: "d".repeat(64),
      signer: makeLocalSigner(),
    });
    const restoreRandomUUID = stubRandomUUID("00000000-0000-4000-8000-000000000003");
    try {
      await expect(signer.ping()).rejects.toThrow("permission denied");
    } finally {
      restoreRandomUUID();
    }
  });

  it("throws when the selected encryption method is unavailable", async () => {
    const signer = new NConnectSigner({
      relay: makeRelay([]),
      pubkey: "d".repeat(64),
      signer: makeLocalSigner({ nip44: undefined }),
    });

    await expect(signer.ping()).rejects.toThrow("NIP44 encryption unavailable");
  });
});
