import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { NRelay } from "@nostrify/types";
import { nip19 } from "nostr-tools";

import {
  parseOperatorEnvelope,
  type OperatorEnvelope,
} from "@/lib/operator";
import { withNostrQueryTimeout } from "@/lib/nostrQuery";
import {
  isCandidatePersonaEvent,
  parsePhoenixEnvelope,
  type PhoenixEnvelope,
} from "@/lib/persona";
import type { Nip44Signer } from "@/lib/personaCrypto";
import { queryKeys } from "@/lib/queryKeys";

export const ENCRYPTED_APP_DATA_KIND = 30078;
export const ENCRYPTED_APP_DATA_QUERY_LIMIT = 200;
export const ENCRYPTED_APP_DATA_QUERY_TIMEOUT_MS = 5000;

export interface OperatorEncryptedAppDataQuery {
  queryKey: ReturnType<typeof queryKeys.encryptedAppData.events>;
  queryFn: (context: { signal?: AbortSignal }) => Promise<NostrEvent[]>;
}

export type ClassifiedEncryptedAppData =
  | {
      type: "operator";
      event: NostrEvent;
      envelope: OperatorEnvelope;
    }
  | {
      type: "persona";
      event: NostrEvent;
      envelope: PhoenixEnvelope;
      npub: string;
    }
  | {
      type: "not-zuka";
      event: NostrEvent;
    };

const decryptCache = new Map<string, Promise<ClassifiedEncryptedAppData>>();

export function clearEncryptedAppDataDecryptCache(): void {
  decryptCache.clear();
}

export function operatorEncryptedAppDataQuery(
  nostr: NRelay,
  userPubkey: string,
): OperatorEncryptedAppDataQuery {
  return {
    queryKey: queryKeys.encryptedAppData.events(userPubkey),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [
          {
            kinds: [ENCRYPTED_APP_DATA_KIND],
            authors: [userPubkey],
            limit: ENCRYPTED_APP_DATA_QUERY_LIMIT,
          },
        ],
        { signal: withNostrQueryTimeout(signal, ENCRYPTED_APP_DATA_QUERY_TIMEOUT_MS) },
      );
      return latestEncryptedEventsPerD(events);
    },
  };
}

export function useOperatorEncryptedAppDataEvents(userPubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: queryKeys.encryptedAppData.events(userPubkey),
    enabled: Boolean(userPubkey),
    queryFn: async (context) => {
      if (!userPubkey) return [];
      return operatorEncryptedAppDataQuery(nostr, userPubkey).queryFn(context);
    },
  });
}

export async function classifyEncryptedAppDataEvent(
  event: NostrEvent,
  userPubkey: string,
  signer: Nip44Signer,
): Promise<ClassifiedEncryptedAppData> {
  const cacheKey = `${userPubkey}:${event.id}`;
  const cached = decryptCache.get(cacheKey);
  if (cached) return cached;

  const promise = decryptAndClassify(event, userPubkey, signer);
  decryptCache.set(cacheKey, promise);
  return promise;
}

export function upsertEncryptedAppDataEvent(
  current: NostrEvent[] | undefined,
  event: NostrEvent,
): NostrEvent[] {
  return latestEncryptedEventsPerD([event, ...(current ?? [])]);
}

function latestEncryptedEventsPerD(events: NostrEvent[]): NostrEvent[] {
  const latestPerD = new Map<string, NostrEvent>();
  const sorted = [...events].sort((a, b) => b.created_at - a.created_at);

  for (const event of sorted) {
    if (!isCandidatePersonaEvent(event)) continue;
    const d = event.tags.find(([name]) => name === "d")?.[1];
    if (!d) continue;
    if (!latestPerD.has(d)) latestPerD.set(d, event);
  }

  return [...latestPerD.values()];
}

async function decryptAndClassify(
  event: NostrEvent,
  userPubkey: string,
  signer: Nip44Signer,
): Promise<ClassifiedEncryptedAppData> {
  let plaintext: string;
  try {
    plaintext = await signer.nip44.decrypt(userPubkey, event.content);
  } catch {
    return { type: "not-zuka", event };
  }

  const operator = parseOperatorEnvelope(plaintext);
  if (operator) {
    return { type: "operator", event, envelope: operator };
  }

  const persona = parsePhoenixEnvelope(plaintext);
  if (persona) {
    return {
      type: "persona",
      event,
      envelope: persona,
      npub: nip19.npubEncode(persona.persona.pubkey),
    };
  }

  return { type: "not-zuka", event };
}
