/**
 * useCrossPost — fire-and-forget POST a published Nostr event to a
 * persona's configured cross-post webhook.
 *
 * Architecture context (derek-plan.md "Cross-post + video composer"):
 * Phoenix can't host its own backend (PROJECT.md §4), and the major
 * social platforms' OAuth flows require a `client_secret` that
 * cannot live in a browser PWA. The default cross-post path is
 * therefore a webhook to a third-party aggregator (Buffer, Zapier,
 * Make.com, n8n, Pipedream, etc.) — the user signs up there, points
 * their integrations at their X/FB/IG/TikTok accounts, and pastes
 * the webhook URL into Feniksi. On every persona publish, we POST
 * a structured payload; the aggregator does the platform fan-out.
 *
 * What we send:
 *   {
 *     version: 1,
 *     type: "persona-post",
 *     persona: { pubkey, npub, name },
 *     event: { id, kind, content, tags, created_at, sig, pubkey },
 *     media: { image_urls: string[], video_urls: string[] },
 *     platforms: string[]    // hint: ["x", "facebook", ...]
 *   }
 *
 * What we DON'T send:
 *   - The persona's nsec (the published event is already signed)
 *   - The user's nsec or any operator metadata
 *   - Anything from the encrypted backup
 *
 * Failures are non-fatal — the Nostr publish has already succeeded
 * by the time we hit the webhook. We surface a non-blocking toast
 * on failure rather than rolling back the publish.
 */

import { useMutation } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";

import {
  extractImetaImages,
  extractImetaVideos,
} from "@/lib/personaPost";
import type { Persona } from "@/lib/persona";

interface CrossPostArgs {
  /** The persona that authored the event. */
  persona: Persona;
  /** The signed kind 1 event (already broadcast to relays). */
  event: NostrEvent;
}

interface CrossPostPayload {
  version: 1;
  type: "persona-post";
  persona: {
    pubkey: string;
    npub: string;
    name: string;
  };
  event: {
    id: string;
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
    pubkey: string;
    sig?: string;
  };
  media: {
    image_urls: string[];
    video_urls: string[];
  };
  platforms: string[];
}

function buildPayload(persona: Persona, event: NostrEvent): CrossPostPayload {
  const images = extractImetaImages(event.tags).map((i) => i.url);
  const videos = extractImetaVideos(event.tags).map((v) => v.url);
  return {
    version: 1,
    type: "persona-post",
    persona: {
      pubkey: persona.pubkey,
      npub: nip19.npubEncode(persona.pubkey),
      name: persona.name,
    },
    event: {
      id: event.id,
      kind: event.kind,
      content: event.content,
      tags: event.tags,
      created_at: event.created_at,
      pubkey: event.pubkey,
      sig: event.sig,
    },
    media: {
      image_urls: images,
      video_urls: videos,
    },
    platforms: persona.cross_post?.webhook_platforms ?? [],
  };
}

export function useCrossPost() {
  return useMutation({
    mutationFn: async ({
      persona,
      event,
    }: CrossPostArgs): Promise<{ skipped: boolean; status?: number }> => {
      const url = persona.cross_post?.webhook_url;
      if (!url) {
        // No webhook configured — quiet no-op so callers can wire
        // this unconditionally without a per-persona guard.
        return { skipped: true };
      }

      const payload = buildPayload(persona, event);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
          // The browser sends Origin and the aggregator can choose
          // to honor or reject CORS. We don't follow redirects to
          // arbitrary cross-origin targets.
          redirect: "manual",
        });
        if (!res.ok) {
          throw new Error(
            `Webhook returned ${res.status} ${res.statusText}`.trim()
          );
        }
        return { skipped: false, status: res.status };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
