import { NSecSigner } from "@nostrify/nostrify";
import type { NostrEvent, NostrMetadata } from "@nostrify/nostrify";
import { NLogin, type NLoginType } from "@nostrify/react/login";
import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";

import { encryptPhoenixEnvelope } from "@/lib/personaCrypto";
import type { Persona, PhoenixEnvelope } from "@/lib/persona";
import type { PpqAccount } from "@/lib/ppq/types";
import {
  PHOENIX_OPERATOR_APP,
  PHOENIX_OPERATOR_VERSION,
  type OperatorEnvelope,
  type OperatorEnvelopeInput,
} from "@/lib/operator";

export type TestKeypair = {
  skHex: string;
  sk: Uint8Array;
  pubkey: string;
  nsec: `nsec1${string}`;
  npub: `npub1${string}`;
  signer: NSecSigner;
};

export const testKeys = {
  operator: keypairFromHex("0000000000000000000000000000000000000000000000000000000000000001"),
  operatorAlt: keypairFromHex("0000000000000000000000000000000000000000000000000000000000000002"),
  persona: keypairFromHex("0000000000000000000000000000000000000000000000000000000000000011"),
  personaAlt: keypairFromHex("0000000000000000000000000000000000000000000000000000000000000012"),
};

export function loginFor(keypair: TestKeypair): NLoginType {
  return NLogin.fromNsec(keypair.nsec);
}

export function signedEvent(
  keypair: TestKeypair,
  template: {
    kind: number;
    content: string;
    tags?: string[][];
    created_at?: number;
  },
): NostrEvent {
  return finalizeEvent(
    {
      kind: template.kind,
      content: template.content,
      tags: template.tags ?? [],
      created_at: template.created_at ?? 1_700_000_000,
    },
    keypair.sk,
  ) as NostrEvent;
}

export function profileEvent(
  keypair: TestKeypair,
  metadata: NostrMetadata,
  createdAt = 1_700_000_000,
): NostrEvent {
  return signedEvent(keypair, {
    kind: 0,
    content: JSON.stringify(metadata),
    created_at: createdAt,
  });
}

export function relayListEvent(
  keypair: TestKeypair,
  relays: Array<{ url: string; marker?: "read" | "write" }>,
  createdAt = 1_700_000_000,
): NostrEvent {
  return signedEvent(keypair, {
    kind: 10002,
    content: "",
    tags: relays.map((relay) => relay.marker ? ["r", relay.url, relay.marker] : ["r", relay.url]),
    created_at: createdAt,
  });
}

export function blossomListEvent(
  keypair: TestKeypair,
  servers: string[],
  createdAt = 1_700_000_000,
): NostrEvent {
  return signedEvent(keypair, {
    kind: 10063,
    content: "",
    tags: servers.map((server) => ["server", server]),
    created_at: createdAt,
  });
}

export function personaPostEvent(
  keypair: TestKeypair,
  content = "A public persona post",
  createdAt = 1_700_000_000,
): NostrEvent {
  return signedEvent(keypair, {
    kind: 1,
    content,
    tags: [],
    created_at: createdAt,
  });
}

export async function personaEnvelopeEvent(args: {
  operator: TestKeypair;
  persona: TestKeypair;
  dTag?: string;
  name?: string;
  ppq?: PpqAccount;
  createdAt?: number;
}): Promise<{ event: NostrEvent; envelope: PhoenixEnvelope }> {
  const dTag = args.dTag ?? "persona-fixture";
  const persona = personaFixture(args.persona, {
    dTag,
    name: args.name ?? "Amina Test",
    createdAt: args.createdAt ?? 1_700_000_000,
  });
  const ciphertext = await encryptPhoenixEnvelope(
    { persona, ppq: args.ppq },
    args.operator.pubkey,
    args.operator.signer,
  );

  const envelope: PhoenixEnvelope = {
    app: "phoenix-persona",
    version: 1,
    persona,
    ppq: args.ppq,
  };

  return {
    envelope,
    event: signedEvent(args.operator, {
      kind: 30078,
      content: ciphertext,
      tags: [["d", dTag]],
      created_at: args.createdAt ?? 1_700_000_000,
    }),
  };
}

export async function unrelatedEncryptedAppEvent(
  operator: TestKeypair,
  dTag = "other-app",
  createdAt = 1_700_000_001,
): Promise<NostrEvent> {
  const ciphertext = await operator.signer.nip44.encrypt(
    operator.pubkey,
    JSON.stringify({ app: "not-zuka", version: 1 }),
  );
  return signedEvent(operator, {
    kind: 30078,
    content: ciphertext,
    tags: [["d", dTag]],
    created_at: createdAt,
  });
}

export async function operatorEnvelopeEvent(args: {
  operator: TestKeypair;
  dTag?: string;
  wallet?: OperatorEnvelopeInput["wallet"];
  ppq?: OperatorEnvelopeInput["ppq"];
  createdAt?: number;
}): Promise<{ event: NostrEvent; envelope: OperatorEnvelope }> {
  const dTag = args.dTag ?? "operator-fixture";
  const createdAt = args.createdAt ?? 1_700_000_000;
  const envelope: OperatorEnvelope = {
    app: PHOENIX_OPERATOR_APP,
    version: PHOENIX_OPERATOR_VERSION,
    dTag,
    wallet: args.wallet,
    ppq: args.ppq,
    created_at: createdAt,
  };
  const ciphertext = await args.operator.signer.nip44.encrypt(
    args.operator.pubkey,
    JSON.stringify(envelope),
  );

  return {
    envelope,
    event: signedEvent(args.operator, {
      kind: 30078,
      content: ciphertext,
      tags: [["d", dTag]],
      created_at: createdAt,
    }),
  };
}

function personaFixture(
  keypair: TestKeypair,
  args: { dTag: string; name: string; createdAt: number },
): Persona {
  return {
    pubkey: keypair.pubkey,
    nsec: keypair.nsec,
    dTag: args.dTag,
    name: args.name,
    username: args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    display_name: args.name,
    system_prompt: "Speak clearly and protect the operator's identity.",
    created_at: args.createdAt,
    bio: "Fixture persona for integration tests.",
  };
}

function keypairFromHex(skHex: string): TestKeypair {
  const sk = hexToBytes(skHex);
  const pubkey = getPublicKey(sk);
  return {
    skHex,
    sk,
    pubkey,
    nsec: nip19.nsecEncode(sk),
    npub: nip19.npubEncode(pubkey),
    signer: new NSecSigner(sk),
  };
}
