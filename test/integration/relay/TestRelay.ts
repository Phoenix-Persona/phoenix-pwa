import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { NostrEvent, NostrFilter } from "@nostrify/nostrify";
import { verifyEvent } from "nostr-tools/pure";
import { WebSocketServer, type WebSocket } from "ws";

type ClientMessage =
  | ["EVENT", NostrEvent]
  | ["REQ", string, ...NostrFilter[]]
  | ["CLOSE", string]
  | ["COUNT", string, ...NostrFilter[]];

type StoredSubscription = {
  id: string;
  filters: NostrFilter[];
  socket: WebSocket;
};

type PublishResult = {
  accepted: boolean;
  message: string;
};

export class TestRelay {
  readonly url: string;
  readonly messages: string[] = [];
  readonly sentMessages: string[] = [];

  private readonly httpServer: Server;
  private readonly wsServer: WebSocketServer;
  private readonly events = new Map<string, NostrEvent>();
  private readonly subscriptions = new Map<WebSocket, Map<string, StoredSubscription>>();

  private constructor(args: {
    url: string;
    httpServer: Server;
    wsServer: WebSocketServer;
  }) {
    this.url = args.url;
    this.httpServer = args.httpServer;
    this.wsServer = args.wsServer;
    this.wsServer.on("connection", (socket) => this.handleConnection(socket));
  }

  static async start(): Promise<TestRelay> {
    const httpServer = http.createServer();
    const wsServer = new WebSocketServer({ server: httpServer });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });

    const address = httpServer.address() as AddressInfo;
    return new TestRelay({
      url: `ws://127.0.0.1:${address.port}`,
      httpServer,
      wsServer,
    });
  }

  seed(events: NostrEvent[]): void {
    for (const event of events) {
      const result = this.storeEvent(event);
      if (!result.accepted) {
        throw new Error(`Invalid seed event ${event.id}: ${result.message}`);
      }
    }
  }

  getEvents(filter?: NostrFilter): NostrEvent[] {
    const events = [...this.events.values()];
    const filtered = filter ? events.filter((event) => matchesFilter(event, filter)) : events;
    return filtered.sort(compareEventsDesc);
  }

  async close(): Promise<void> {
    for (const socket of this.wsServer.clients) {
      socket.close();
    }

    await new Promise<void>((resolve, reject) => {
      this.wsServer.close((wsError) => {
        if (wsError) {
          reject(wsError);
          return;
        }
        this.httpServer.close((httpError) => {
          if (httpError) reject(httpError);
          else resolve();
        });
      });
    });
  }

  private handleConnection(socket: WebSocket): void {
    this.subscriptions.set(socket, new Map());

    socket.on("message", (raw) => {
      const message = raw.toString();
      this.messages.push(message);
      const parsed = parseClientMessage(message);
      if (!parsed) {
        this.send(socket, ["NOTICE", "invalid message"]);
        return;
      }
      this.handleMessage(socket, parsed);
    });

    socket.on("close", () => {
      this.subscriptions.delete(socket);
    });
  }

  private handleMessage(socket: WebSocket, message: ClientMessage): void {
    const [type] = message;

    if (type === "EVENT") {
      const event = message[1];
      const result = this.storeEvent(event);
      this.send(socket, ["OK", event.id, result.accepted, result.message]);
      if (result.accepted) this.dispatchEvent(event);
      return;
    }

    if (type === "REQ") {
      const [, subId, ...filters] = message;
      const socketSubscriptions = this.subscriptions.get(socket);
      socketSubscriptions?.set(subId, { id: subId, filters, socket });

      for (const event of queryEvents([...this.events.values()], filters)) {
        this.send(socket, ["EVENT", subId, event]);
      }
      this.send(socket, ["EOSE", subId]);
      return;
    }

    if (type === "COUNT") {
      const [, subId, ...filters] = message;
      this.send(socket, ["COUNT", subId, { count: queryEvents([...this.events.values()], filters).length }]);
      return;
    }

    if (type === "CLOSE") {
      const [, subId] = message;
      this.subscriptions.get(socket)?.delete(subId);
    }
  }

  private storeEvent(event: NostrEvent): PublishResult {
    if (!verifyEvent(event)) {
      return { accepted: false, message: "invalid: bad signature" };
    }

    const replacedId = this.findReplacedEventId(event);
    if (replacedId === null) {
      return { accepted: true, message: "duplicate: older replaceable event" };
    }
    if (replacedId) this.events.delete(replacedId);

    this.events.set(event.id, event);
    return { accepted: true, message: "" };
  }

  private findReplacedEventId(next: NostrEvent): string | null | undefined {
    const key = retentionKey(next);
    if (!key) return undefined;

    const existing = [...this.events.values()].find((event) => retentionKey(event) === key);
    if (!existing) return undefined;
    return next.created_at >= existing.created_at ? existing.id : null;
  }

  private dispatchEvent(event: NostrEvent): void {
    for (const subscriptions of this.subscriptions.values()) {
      for (const subscription of subscriptions.values()) {
        if (subscription.filters.some((filter) => matchesFilter(event, filter))) {
          this.send(subscription.socket, ["EVENT", subscription.id, event]);
        }
      }
    }
  }

  private send(socket: WebSocket, message: unknown[]): void {
    if (socket.readyState === socket.OPEN) {
      const serialized = JSON.stringify(message);
      this.sentMessages.push(serialized);
      socket.send(serialized);
    }
  }
}

function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || typeof parsed[0] !== "string") return null;
  const [type] = parsed;
  if (type === "EVENT" && isNostrEvent(parsed[1])) return parsed as ClientMessage;
  if ((type === "REQ" || type === "COUNT") && typeof parsed[1] === "string") {
    return parsed as ClientMessage;
  }
  if (type === "CLOSE" && typeof parsed[1] === "string") return parsed as ClientMessage;
  return null;
}

function isNostrEvent(value: unknown): value is NostrEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<NostrEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.pubkey === "string" &&
    typeof event.created_at === "number" &&
    typeof event.kind === "number" &&
    Array.isArray(event.tags) &&
    typeof event.content === "string" &&
    typeof event.sig === "string"
  );
}

function queryEvents(events: NostrEvent[], filters: NostrFilter[]): NostrEvent[] {
  const seen = new Set<string>();
  const result: NostrEvent[] = [];

  for (const filter of filters) {
    for (const event of events.filter((candidate) => matchesFilter(candidate, filter)).sort(compareEventsDesc)) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      result.push(event);
      if (typeof filter.limit === "number" && result.length >= filter.limit) break;
    }
  }

  return result.sort(compareEventsDesc);
}

function matchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (typeof filter.since === "number" && event.created_at < filter.since) return false;
  if (typeof filter.until === "number" && event.created_at > filter.until) return false;

  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith("#") || !Array.isArray(value)) continue;
    const tagName = key.slice(1);
    const acceptedValues = value.filter((entry): entry is string => typeof entry === "string");
    if (!event.tags.some(([name, tagValue]) => name === tagName && acceptedValues.includes(tagValue))) {
      return false;
    }
  }

  return true;
}

function retentionKey(event: NostrEvent): string | undefined {
  if (event.kind === 0 || event.kind === 3 || (event.kind >= 10_000 && event.kind < 20_000)) {
    return `${event.pubkey}:${event.kind}`;
  }
  if (event.kind >= 30_000 && event.kind < 40_000) {
    const dTag = event.tags.find(([name]) => name === "d")?.[1];
    if (!dTag) return undefined;
    return `${event.pubkey}:${event.kind}:${dTag}`;
  }
  return undefined;
}

function compareEventsDesc(a: NostrEvent, b: NostrEvent): number {
  if (a.created_at !== b.created_at) return b.created_at - a.created_at;
  return a.id.localeCompare(b.id);
}
