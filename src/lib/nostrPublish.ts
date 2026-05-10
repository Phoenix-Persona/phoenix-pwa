import type { NostrEvent } from "@nostrify/nostrify";

export interface NostrPublisher {
  event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void>;
}

export const DEFAULT_PUBLISH_TIMEOUT_MS = 8_000;

export type PublishWarningCode =
  | "operator-envelope-publish"
  | "persona-profile-publish"
  | "delete-kind0-lookup"
  | "delete-lightning-address-release";

export type PublishAttemptResult =
  | { ok: true }
  | { ok: false; warning: PublishWarningCode; error: Error };

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function publishWithTimeout(
  nostr: NostrPublisher,
  event: NostrEvent,
  timeoutMs = DEFAULT_PUBLISH_TIMEOUT_MS,
): Promise<void> {
  return nostr.event(event, { signal: AbortSignal.timeout(timeoutMs) });
}

export async function tryPublishWithTimeout(
  nostr: NostrPublisher,
  event: NostrEvent,
  warningCode: PublishWarningCode,
  timeoutMs = DEFAULT_PUBLISH_TIMEOUT_MS,
): Promise<PublishAttemptResult> {
  try {
    await publishWithTimeout(nostr, event, timeoutMs);
    return { ok: true };
  } catch (error) {
    return { ok: false, warning: warningCode, error: toError(error) };
  }
}
