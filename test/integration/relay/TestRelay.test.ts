import type { NostrEvent } from "@nostrify/nostrify";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import {
  personaEnvelopeEvent,
  profileEvent,
  signedEvent,
  testKeys,
} from "../fixtures/nostr";
import { TestRelay } from "./TestRelay";

type ServerMessage =
  | ["OK", string, boolean, string]
  | ["EVENT", string, NostrEvent]
  | ["EOSE", string]
  | ["COUNT", string, { count: number }]
  | ["NOTICE", string];

const openRelays: TestRelay[] = [];
const openClients: RelayClient[] = [];

describe("TestRelay", () => {
  afterEach(async () => {
    for (const client of openClients.splice(0)) {
      client.close();
    }
    for (const relay of openRelays.splice(0)) {
      await relay.close();
    }
  });

  it("rejects events with invalid signatures", async () => {
    const relay = await startRelay();
    const client = await RelayClient.connect(relay.url);
    const valid = signedEvent(testKeys.operator, {
      kind: 1,
      content: "valid content",
    });
    const invalid = { ...valid, content: "tampered content" };

    client.send(["EVENT", invalid]);

    await expect(client.next()).resolves.toEqual([
      "OK",
      valid.id,
      false,
      "invalid: bad signature",
    ]);
    expect(relay.getEvents()).toHaveLength(0);
  });

  it("filters by author, kind, tag, time range, and limit", async () => {
    const relay = await startRelay([
      signedEvent(testKeys.operator, {
        kind: 1,
        content: "older matching post",
        tags: [["t", "zuka"]],
        created_at: 100,
      }),
      signedEvent(testKeys.operator, {
        kind: 1,
        content: "newer matching post",
        tags: [["t", "zuka"]],
        created_at: 120,
      }),
      signedEvent(testKeys.operator, {
        kind: 1,
        content: "wrong tag",
        tags: [["t", "other"]],
        created_at: 130,
      }),
      signedEvent(testKeys.operatorAlt, {
        kind: 1,
        content: "wrong author",
        tags: [["t", "zuka"]],
        created_at: 140,
      }),
      signedEvent(testKeys.operator, {
        kind: 0,
        content: "{}",
        created_at: 125,
      }),
    ]);
    const client = await RelayClient.connect(relay.url);

    client.send([
      "REQ",
      "filtered",
      {
        authors: [testKeys.operator.pubkey],
        kinds: [1],
        "#t": ["zuka"],
        since: 90,
        until: 125,
        limit: 1,
      },
    ]);

    const messages = await client.collectUntil(
      (message) => message[0] === "EOSE" && message[1] === "filtered",
    );
    const events = messages.filter(isEventMessage).map((message) => message[2]);
    expect(events).toHaveLength(1);
    expect(events[0]?.content).toBe("newer matching post");
  });

  it("matches id prefixes in filters", async () => {
    const event = signedEvent(testKeys.operator, {
      kind: 1,
      content: "prefix matched post",
      created_at: 150,
    });
    const relay = await startRelay([event]);
    const client = await RelayClient.connect(relay.url);

    client.send(["REQ", "prefix", { ids: [event.id.slice(0, 12)] }]);

    const messages = await client.collectUntil(
      (message) => message[0] === "EOSE" && message[1] === "prefix",
    );
    const events = messages.filter(isEventMessage).map((message) => message[2]);
    expect(events.map((candidate) => candidate.id)).toEqual([event.id]);
  });

  it("applies limits per filter before deduplicating multi-filter results", async () => {
    const newest = signedEvent(testKeys.operator, {
      kind: 1,
      content: "newest",
      tags: [["t", "one"], ["t", "two"]],
      created_at: 300,
    });
    const middle = signedEvent(testKeys.operator, {
      kind: 1,
      content: "middle",
      tags: [["t", "one"]],
      created_at: 200,
    });
    const oldest = signedEvent(testKeys.operator, {
      kind: 1,
      content: "oldest",
      tags: [["t", "two"]],
      created_at: 100,
    });
    const relay = await startRelay([oldest, middle, newest]);
    const client = await RelayClient.connect(relay.url);

    client.send([
      "REQ",
      "multi",
      { kinds: [1], "#t": ["one"], limit: 1 },
      { kinds: [1], "#t": ["two"], limit: 2 },
    ]);

    const messages = await client.collectUntil(
      (message) => message[0] === "EOSE" && message[1] === "multi",
    );
    const events = messages.filter(isEventMessage).map((message) => message[2]);
    expect(events.map((event) => event.content)).toEqual(["newest", "oldest"]);
  });

  it("returns NOTICE for malformed client messages", async () => {
    const relay = await startRelay();
    const client = await RelayClient.connect(relay.url);

    client.sendRaw("{not json");
    await expect(client.next()).resolves.toEqual(["NOTICE", "invalid message"]);

    client.send(["UNKNOWN", "sub"]);
    await expect(client.next()).resolves.toEqual(["NOTICE", "invalid message"]);

    client.send(["EVENT", { id: "not-an-event" }]);
    await expect(client.next()).resolves.toEqual(["NOTICE", "invalid message"]);

    client.send(["REQ"]);
    await expect(client.next()).resolves.toEqual(["NOTICE", "invalid message"]);
  });

  it("returns counts for matching filters", async () => {
    const relay = await startRelay([
      signedEvent(testKeys.operator, {
        kind: 1,
        content: "first",
        tags: [["t", "counted"]],
      }),
      signedEvent(testKeys.operator, {
        kind: 1,
        content: "second",
        tags: [["t", "counted"]],
      }),
      signedEvent(testKeys.operator, {
        kind: 1,
        content: "ignored",
        tags: [["t", "other"]],
      }),
    ]);
    const client = await RelayClient.connect(relay.url);

    client.send(["COUNT", "counted", { kinds: [1], "#t": ["counted"] }]);

    await expect(client.next()).resolves.toEqual([
      "COUNT",
      "counted",
      { count: 2 },
    ]);
  });

  it("honors CLOSE by stopping live delivery for that subscription", async () => {
    const relay = await startRelay();
    const subscriber = await RelayClient.connect(relay.url);
    const publisher = await RelayClient.connect(relay.url);

    subscriber.send(["REQ", "live", { kinds: [1], "#t": ["closed"] }]);
    await subscriber.collectUntil(
      (message) => message[0] === "EOSE" && message[1] === "live",
    );
    subscriber.send(["CLOSE", "live"]);

    publisher.send([
      "EVENT",
      signedEvent(testKeys.operator, {
        kind: 1,
        content: "should not arrive",
        tags: [["t", "closed"]],
      }),
    ]);
    await expect(publisher.next()).resolves.toEqual(
      expect.arrayContaining(["OK"]),
    );
    await expect(subscriber.next(80)).rejects.toThrow("Timed out");
  });

  it("retains only the newest replaceable event per author and kind", async () => {
    const older = profileEvent(testKeys.operator, { name: "Old Name" }, 100);
    const newer = profileEvent(testKeys.operator, { name: "New Name" }, 200);
    const relay = await startRelay([newer, older]);

    const profiles = relay.getEvents({
      authors: [testKeys.operator.pubkey],
      kinds: [0],
    });

    expect(profiles).toHaveLength(1);
    expect(JSON.parse(profiles[0]!.content)).toEqual({ name: "New Name" });
  });

  it("retains only the newest addressable event per author, kind, and d-tag", async () => {
    const olderOne = signedEvent(testKeys.operator, {
      kind: 30078,
      content: "older one",
      tags: [["d", "one"]],
      created_at: 100,
    });
    const newerOne = signedEvent(testKeys.operator, {
      kind: 30078,
      content: "newer one",
      tags: [["d", "one"]],
      created_at: 200,
    });
    const otherDTag = signedEvent(testKeys.operator, {
      kind: 30078,
      content: "other d-tag",
      tags: [["d", "two"]],
      created_at: 150,
    });
    const { event: encryptedPersona } = await personaEnvelopeEvent({
      operator: testKeys.operatorAlt,
      persona: testKeys.persona,
      dTag: "one",
      createdAt: 300,
    });
    const relay = await startRelay([
      newerOne,
      olderOne,
      otherDTag,
      encryptedPersona,
    ]);

    const operatorEvents = relay.getEvents({
      authors: [testKeys.operator.pubkey],
      kinds: [30078],
    });
    const altEvents = relay.getEvents({
      authors: [testKeys.operatorAlt.pubkey],
      kinds: [30078],
    });

    expect(operatorEvents.map((event) => event.content)).toEqual([
      "newer one",
      "other d-tag",
    ]);
    expect(altEvents).toHaveLength(1);
    expect(altEvents[0]?.id).toBe(encryptedPersona.id);
  });
});

async function startRelay(events: NostrEvent[] = []): Promise<TestRelay> {
  const relay = await TestRelay.start();
  openRelays.push(relay);
  relay.seed(events);
  return relay;
}

function isEventMessage(
  message: ServerMessage,
): message is ["EVENT", string, NostrEvent] {
  return message[0] === "EVENT";
}

class RelayClient {
  private readonly socket: WebSocket;
  private readonly queue: ServerMessage[] = [];
  private readonly waiters: Array<(message: ServerMessage) => void> = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    this.socket.on("message", (raw) => {
      const message = parseServerMessage(raw.toString());
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.queue.push(message);
    });
  }

  static async connect(url: string): Promise<RelayClient> {
    const socket = new WebSocket(url);
    const client = new RelayClient(socket);
    openClients.push(client);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return client;
  }

  send(message: unknown[]): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(message: string): void {
    this.socket.send(message);
  }

  async next(timeoutMs = 500): Promise<ServerMessage> {
    const queued = this.queue.shift();
    if (queued) return queued;

    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(resolve);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for relay message after ${timeoutMs}ms`));
      }, timeoutMs);

      this.waiters.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }

  async collectUntil(
    predicate: (message: ServerMessage) => boolean,
  ): Promise<ServerMessage[]> {
    const messages: ServerMessage[] = [];
    for (let i = 0; i < 20; i += 1) {
      const message = await this.next();
      messages.push(message);
      if (predicate(message)) return messages;
    }
    throw new Error("Relay message predicate was not satisfied");
  }

  close(): void {
    this.socket.close();
  }
}

function parseServerMessage(raw: string): ServerMessage {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || typeof parsed[0] !== "string") {
    throw new Error(`Unexpected relay message: ${raw}`);
  }
  return parsed as ServerMessage;
}
