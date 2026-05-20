import type {
  NostrConnectResponse,
  NostrEvent,
  NostrRelayInfo,
  NostrRelayMsg,
} from "@nostrify/types";

type ParseResult<T> = { success: true; data: T } | { success: false; error: Error };

class Parser<T> {
  constructor(private readonly parseValue: (value: unknown) => T) {}

  parse(value: unknown): T {
    return this.parseValue(value);
  }

  safeParse(value: unknown): ParseResult<T> {
    try {
      return { success: true, data: this.parse(value) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  pipe<U>(next: Parser<U>): Parser<U> {
    return new Parser((value) => next.parse(this.parse(value)));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArrayArray(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every(
    (tag) => Array.isArray(tag) && tag.every((entry) => typeof entry === "string"),
  );
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") throw new Error("Expected JSON string");
  return JSON.parse(value);
}

function parseEvent(value: unknown): NostrEvent {
  if (!isRecord(value)) throw new Error("Expected Nostr event object");
  if (typeof value.id !== "string") throw new Error("Expected event id");
  if (typeof value.kind !== "number") throw new Error("Expected event kind");
  if (typeof value.pubkey !== "string") throw new Error("Expected event pubkey");
  if (!isStringArrayArray(value.tags)) throw new Error("Expected event tags");
  if (typeof value.content !== "string") throw new Error("Expected event content");
  if (typeof value.created_at !== "number") throw new Error("Expected event created_at");
  if (typeof value.sig !== "string") throw new Error("Expected event sig");
  return value as unknown as NostrEvent;
}

function parseConnectResponse(value: unknown): NostrConnectResponse {
  if (!isRecord(value)) throw new Error("Expected NIP-46 response object");
  if (typeof value.id !== "string") throw new Error("Expected response id");
  if (typeof value.result !== "string") throw new Error("Expected response result");
  if (value.error !== undefined && typeof value.error !== "string") {
    throw new Error("Expected response error");
  }
  return value as unknown as NostrConnectResponse;
}

function parseRelayInfo(value: unknown): NostrRelayInfo {
  if (!isRecord(value)) throw new Error("Expected relay info object");
  return value as NostrRelayInfo;
}

function parseRelayMsg(value: unknown): NostrRelayMsg {
  if (!Array.isArray(value) || typeof value[0] !== "string") {
    throw new Error("Expected relay message array");
  }

  switch (value[0]) {
    case "EVENT":
      if (typeof value[1] !== "string") throw new Error("Expected EVENT subscription id");
      parseEvent(value[2]);
      return value as NostrRelayMsg;
    case "OK":
      if (
        typeof value[1] !== "string" ||
        typeof value[2] !== "boolean" ||
        typeof value[3] !== "string"
      ) {
        throw new Error("Expected OK relay message");
      }
      return value as NostrRelayMsg;
    case "EOSE":
    case "NOTICE":
    case "AUTH":
      if (typeof value[1] !== "string") throw new Error(`Expected ${value[0]} string`);
      return value as NostrRelayMsg;
    case "CLOSED":
      if (typeof value[1] !== "string" || typeof value[2] !== "string") {
        throw new Error("Expected CLOSED relay message");
      }
      return value as NostrRelayMsg;
    case "COUNT":
      if (
        typeof value[1] !== "string" ||
        !isRecord(value[2]) ||
        typeof value[2].count !== "number" ||
        (value[2].approximate !== undefined && typeof value[2].approximate !== "boolean")
      ) {
        throw new Error("Expected COUNT relay message");
      }
      return value as NostrRelayMsg;
    default:
      throw new Error(`Unsupported relay message ${value[0]}`);
  }
}

export class NSchema {
  static json(): Parser<unknown> {
    return new Parser(parseJson);
  }

  static event(): Parser<NostrEvent> {
    return new Parser(parseEvent);
  }

  static connectResponse(): Parser<NostrConnectResponse> {
    return new Parser(parseConnectResponse);
  }

  static relayInfo(): Parser<NostrRelayInfo> {
    return new Parser(parseRelayInfo);
  }

  static relayMsg(): Parser<NostrRelayMsg> {
    return new Parser(parseRelayMsg);
  }
}
