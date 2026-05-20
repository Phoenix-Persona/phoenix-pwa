import { BunkerURI } from "../../../node_modules/@nostrify/nostrify/dist/BunkerURI.js";
import { NBrowserSigner } from "../../../node_modules/@nostrify/nostrify/dist/NBrowserSigner.js";
import { NPool } from "../../../node_modules/@nostrify/nostrify/dist/NPool.js";
import { NRelay1 } from "../../../node_modules/@nostrify/nostrify/dist/NRelay1.js";
import { NSecSigner } from "../../../node_modules/@nostrify/nostrify/dist/NSecSigner.js";
import type {
  NostrConnectRequest,
  NostrConnectResponse,
  NostrEvent,
  NostrSigner,
} from "@nostrify/types";

type RelayPermissionMap = Record<string, { read: boolean; write: boolean }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArrayArray(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every(
    (tag) => Array.isArray(tag) && tag.every((entry) => typeof entry === "string"),
  );
}

function parseJson(value: string): unknown {
  return JSON.parse(value);
}

function parseEventJson(value: string): NostrEvent {
  const event = parseJson(value);
  if (!isRecord(event)) throw new Error("Expected signed event object");
  if (typeof event.id !== "string") throw new Error("Expected event id");
  if (typeof event.kind !== "number") throw new Error("Expected event kind");
  if (typeof event.pubkey !== "string") throw new Error("Expected event pubkey");
  if (!isStringArrayArray(event.tags)) throw new Error("Expected event tags");
  if (typeof event.content !== "string") throw new Error("Expected event content");
  if (typeof event.created_at !== "number") throw new Error("Expected event created_at");
  if (typeof event.sig !== "string") throw new Error("Expected event sig");
  return event as unknown as NostrEvent;
}

function parseConnectResponseJson(value: string): NostrConnectResponse {
  const response = parseJson(value);
  if (!isRecord(response)) throw new Error("Expected NIP-46 response object");
  if (typeof response.id !== "string") throw new Error("Expected response id");
  if (typeof response.result !== "string") throw new Error("Expected response result");
  if (response.error !== undefined && typeof response.error !== "string") {
    throw new Error("Expected response error");
  }
  return response as unknown as NostrConnectResponse;
}

function parseRelayPermissionMap(value: string): RelayPermissionMap {
  const relays = parseJson(value);
  if (!isRecord(relays)) throw new Error("Expected relay permission map");

  const parsed: RelayPermissionMap = {};
  for (const [url, permissions] of Object.entries(relays)) {
    if (!isRecord(permissions)) throw new Error("Expected relay permissions");
    if (typeof permissions.read !== "boolean" || typeof permissions.write !== "boolean") {
      throw new Error("Expected relay read/write booleans");
    }
    parsed[url] = { read: permissions.read, write: permissions.write };
  }

  return parsed;
}

export class NConnectSigner implements NostrSigner {
  private readonly relay: { req: NPool["req"]; event: NPool["event"] };
  private readonly pubkey: string;
  private readonly signer: NostrSigner;
  private readonly timeout?: number;
  private readonly encryption: "nip04" | "nip44";

  constructor({
    relay,
    pubkey,
    signer,
    timeout,
    encryption = "nip44",
  }: {
    relay: { req: NPool["req"]; event: NPool["event"] };
    pubkey: string;
    signer: NostrSigner;
    timeout?: number;
    encryption?: "nip04" | "nip44";
  }) {
    this.relay = relay;
    this.pubkey = pubkey;
    this.signer = signer;
    this.timeout = timeout;
    this.encryption = encryption;
  }

  async getPublicKey(): Promise<string> {
    return this.cmd("get_public_key", []);
  }

  async signEvent(event: Omit<NostrEvent, "id" | "pubkey" | "sig">): Promise<NostrEvent> {
    return parseEventJson(await this.cmd("sign_event", [JSON.stringify(event)]));
  }

  async getRelays(): Promise<RelayPermissionMap> {
    return parseRelayPermissionMap(await this.cmd("get_relays", []));
  }

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => (
      this.cmd("nip04_encrypt", [pubkey, plaintext])
    ),
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => (
      this.cmd("nip04_decrypt", [pubkey, ciphertext])
    ),
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => (
      this.cmd("nip44_encrypt", [pubkey, plaintext])
    ),
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => (
      this.cmd("nip44_decrypt", [pubkey, ciphertext])
    ),
  };

  async connect(secret?: string): Promise<string> {
    const params = secret ? [this.pubkey, secret] : [this.pubkey];
    return this.cmd("connect", params);
  }

  async ping(): Promise<string> {
    return this.cmd("ping", []);
  }

  async cmd(method: string, params: string[]): Promise<string> {
    const signal = typeof this.timeout === "number"
      ? AbortSignal.timeout(this.timeout)
      : undefined;
    const { result, error } = await this.send(
      { id: crypto.randomUUID(), method, params },
      { signal },
    );
    if (error) throw new Error(error);
    return result;
  }

  async send(
    request: NostrConnectRequest,
    opts: { signal?: AbortSignal } = {},
  ): Promise<NostrConnectResponse> {
    const { signal } = opts;
    const event = await this.signer.signEvent({
      kind: 24133,
      content: await this.encrypt(this.pubkey, JSON.stringify(request)),
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", this.pubkey]],
    });
    const local = await this.signer.getPublicKey();
    const req = this.relay.req(
      [{ kinds: [24133], authors: [this.pubkey], "#p": [local] }],
      { signal },
    );
    const promise = new Promise<NostrConnectResponse>((resolve, reject) => {
      void (async () => {
        try {
          for await (const msg of req) {
            if (msg[0] === "CLOSED") throw new Error("Subscription closed");
            if (msg[0] === "EVENT") {
              const response = parseConnectResponseJson(
                await this.decrypt(this.pubkey, msg[2].content),
              );
              if (response.id === request.id) {
                resolve(response);
                return;
              }
            }
          }
        } catch (error) {
          reject(error);
        }
      })();
    });
    await this.relay.event(event, { signal });
    return promise;
  }

  private encrypt(pubkey: string, plaintext: string): Promise<string> {
    const crypto = this.encryption === "nip04" ? this.signer.nip04 : this.signer.nip44;
    if (!crypto) throw new Error(`${this.encryption.toUpperCase()} encryption unavailable`);
    return crypto.encrypt(pubkey, plaintext);
  }

  private decrypt(pubkey: string, ciphertext: string): Promise<string> {
    const crypto = this.encryption === "nip04" ? this.signer.nip04 : this.signer.nip44;
    if (!crypto) throw new Error(`${this.encryption.toUpperCase()} decryption unavailable`);
    return crypto.decrypt(pubkey, ciphertext);
  }
}

export {
  BunkerURI,
  NBrowserSigner,
  NPool,
  NRelay1,
  NSecSigner,
};
