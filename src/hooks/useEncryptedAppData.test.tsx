import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { NSecSigner, type NostrEvent } from "@nostrify/nostrify";
import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import type { PropsWithChildren } from "react";
import {
  beforeEach,
  describe,
  expect,
  it,
  mockFn,
  hoisted,
  mockModule,
} from "@/test/api";

import { encryptOperatorEnvelope } from "@/lib/operator";
import { encryptPhoenixEnvelope } from "@/lib/personaCrypto";
import { useOperatorEnvelope } from "./useOperatorEnvelope";
import { clearPersonaDecryptCache, useMyPersonas } from "./usePersona";

const OPERATOR_SECRET = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);
const PERSONA_SECRET = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000011",
);
const OPERATOR_PUBKEY = getPublicKey(OPERATOR_SECRET);
const PERSONA_PUBKEY = getPublicKey(PERSONA_SECRET);
const OPERATOR_SIGNER = new NSecSigner(OPERATOR_SECRET);
const PERSONA_NSEC = nip19.nsecEncode(PERSONA_SECRET);

const mocks = hoisted(() => ({
  query: mockFn<() => Promise<NostrEvent[]>>(),
  decryptCount: 0,
  currentUser: {
    user: undefined as
      | {
          pubkey: string;
          signer: {
            nip44: {
              encrypt: (pubkey: string, plaintext: string) => Promise<string>;
              decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
            };
            signEvent: (template: {
              kind: number;
              created_at: number;
              tags: string[][];
              content: string;
            }) => Promise<NostrEvent>;
          };
        }
      | undefined,
  },
}));

mockModule("@nostrify/react", () => ({
  useNostr: () => ({
    nostr: {
      query: mocks.query,
      event: mockFn(),
    },
  }),
}));

mockModule("./useCurrentUser", () => ({
  useCurrentUser: () => mocks.currentUser,
}));

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function resetQueryClient() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function signedEvent(template: {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}): NostrEvent {
  return finalizeEvent(template, OPERATOR_SECRET) as NostrEvent;
}

describe("encrypted app data hooks", () => {
  beforeEach(() => {
    resetQueryClient();
    clearPersonaDecryptCache();
    mocks.query.mockReset();
    mocks.decryptCount = 0;
    mocks.currentUser.user = {
      pubkey: OPERATOR_PUBKEY,
      signer: {
        nip44: {
          encrypt: (pubkey, plaintext) =>
            OPERATOR_SIGNER.nip44.encrypt(pubkey, plaintext),
          decrypt: async (pubkey, ciphertext) => {
            mocks.decryptCount += 1;
            return OPERATOR_SIGNER.nip44.decrypt(pubkey, ciphertext);
          },
        },
        signEvent: async (template) => signedEvent(template),
      },
    };
  });

  it("decrypts each shared operator-authored kind 30078 event once across operator and persona hooks", async () => {
    const operatorContent = await encryptOperatorEnvelope(
      { dTag: "operator", wallet: undefined, ppq: undefined },
      OPERATOR_PUBKEY,
      OPERATOR_SIGNER,
    );
    const personaContent = await encryptPhoenixEnvelope(
      {
        persona: {
          pubkey: PERSONA_PUBKEY,
          nsec: PERSONA_NSEC,
          dTag: "persona",
          name: "Amina Test",
          system_prompt: "Speak clearly.",
          created_at: 1_700_000_000,
        },
      },
      OPERATOR_PUBKEY,
      OPERATOR_SIGNER,
    );
    const events = [
      signedEvent({
        kind: 30078,
        content: operatorContent,
        tags: [["d", "operator"]],
        created_at: 1_700_000_001,
      }),
      signedEvent({
        kind: 30078,
        content: personaContent,
        tags: [["d", "persona"]],
        created_at: 1_700_000_000,
      }),
    ];
    mocks.query.mockResolvedValue(events);

    const { result } = renderHook(
      () => ({
        operator: useOperatorEnvelope(),
        personas: useMyPersonas(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.operator.isLoading).toBe(false));
    await waitFor(() => expect(result.current.personas.isSuccess).toBe(true));

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.decryptCount).toBe(events.length);
  });

  it("starts persona envelope classification concurrently instead of serially", async () => {
    const plaintextByContent = new Map<string, string>();
    const gates: Array<() => void> = [];
    const started: string[] = [];

    const events = ["persona-a", "persona-b", "persona-c"].map(
      (dTag, index) => {
        const personaContent = JSON.stringify({
          app: "phoenix-persona",
          version: 1,
          persona: {
            pubkey: PERSONA_PUBKEY,
            nsec: PERSONA_NSEC,
            dTag,
            name: `Persona ${index}`,
            system_prompt: "Speak clearly.",
            created_at: 1_700_000_000 + index,
          },
        });
        const content = `ciphertext-${dTag}`;
        plaintextByContent.set(content, personaContent);
        return signedEvent({
          kind: 30078,
          content,
          tags: [["d", dTag]],
          created_at: 1_700_000_000 + index,
        });
      },
    );
    mocks.query.mockResolvedValue(events);
    mocks.currentUser.user = {
      ...mocks.currentUser.user!,
      signer: {
        ...mocks.currentUser.user!.signer,
        nip44: {
          ...mocks.currentUser.user!.signer.nip44,
          decrypt: async (_pubkey, ciphertext) => {
            started.push(ciphertext);
            await new Promise<void>((resolve) => gates.push(resolve));
            const plaintext = plaintextByContent.get(ciphertext);
            if (!plaintext) throw new Error("Unknown ciphertext");
            return plaintext;
          },
        },
      },
    };

    const { result } = renderHook(() => useMyPersonas(), { wrapper });

    await waitFor(() => expect(started).toHaveLength(events.length));
    for (const release of gates) release();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(events.length);
  });
});
