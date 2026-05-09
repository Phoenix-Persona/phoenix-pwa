/**
 * Publish events signed by a Phoenix persona keypair (not the operator's key).
 *
 * The caller provides the persona's nsec directly — typically pulled out of
 * the decrypted persona config. We do NOT read from localStorage, since
 * persona keys live inside the encrypted persona event and are recoverable
 * from any device the operator signs in on.
 */

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";

import { decodePersonaNsec, signWithPersona } from "@/lib/personaKey";

type EventTemplate = {
  kind: number;
  content: string;
  tags?: string[][];
  created_at?: number;
};

export interface PersonaPublishVars {
  /** Persona nsec — sourced from the decrypted persona config. */
  personaNsec: string;
  /** Event template to sign. */
  template: EventTemplate;
}

export function usePersonaPublish(): UseMutationResult<
  NostrEvent,
  Error,
  PersonaPublishVars
> {
  const { nostr } = useNostr();

  return useMutation({
    mutationFn: async ({ personaNsec, template }) => {
      const keypair = decodePersonaNsec(personaNsec);
      const event = signWithPersona(
        {
          kind: template.kind,
          content: template.content,
          tags: template.tags ?? [],
          created_at: template.created_at ?? Math.floor(Date.now() / 1000),
        },
        keypair
      );

      await nostr.event(event, { signal: AbortSignal.timeout(8000) });
      return event;
    },
  });
}
