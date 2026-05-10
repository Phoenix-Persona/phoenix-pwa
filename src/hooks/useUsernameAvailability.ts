/**
 * Live availability check for a Spark Lightning Address username.
 *
 * Debounces input changes, probes the LUD-16 endpoint at
 * `breez.tips/.well-known/lnurlp/<user>` (200 = taken, 404 = free),
 * and returns a status the form can render inline. SDK-free — this is
 * a UX hint; the authoritative check + claim happens during the actual
 * mint via the SDK's `checkLightningAddressAvailable` + register flow.
 *
 * State derivation:
 *   - idle / invalid / checking are computed synchronously from the
 *     input itself, so render is the source of truth and we never
 *     setState inside an effect for trivial transitions.
 *   - The async probe writes only its result (keyed by the username
 *     it was issued for) — stale results are filtered out at read
 *     time when the input has moved on.
 */

import { useEffect, useState } from "react";

import {
  isValidLightningUsername,
  probeLightningUsernameAvailability,
  type AvailabilityStatus,
} from "@/lib/wallet/lightningAddress";

export type UsernameAvailabilityState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "checking"; username: string }
  | { status: "available"; username: string }
  | { status: "taken"; username: string }
  | { status: "error"; username: string };

interface ProbeResult {
  username: string;
  status: AvailabilityStatus;
}

export function useUsernameAvailability(
  username: string,
  debounceMs = 400,
): UsernameAvailabilityState {
  const [probe, setProbe] = useState<ProbeResult | undefined>(undefined);

  const trimmed = username.trim();
  const isInvalid = trimmed.length > 0 && !isValidLightningUsername(trimmed);

  useEffect(() => {
    if (!trimmed || isInvalid) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let status: AvailabilityStatus;
      try {
        status = await probeLightningUsernameAvailability(
          trimmed,
          controller.signal,
        );
      } catch {
        status = "error";
      }
      if (controller.signal.aborted) return;
      setProbe({ username: trimmed, status });
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, isInvalid, debounceMs]);

  if (!trimmed) return { status: "idle" };
  if (isInvalid) return { status: "invalid" };
  // Stale-probe filter: if the user has typed past the value the last
  // probe ran for, fall back to "checking" until a fresh probe lands.
  if (probe && probe.username === trimmed) {
    return { status: probe.status, username: trimmed };
  }
  return { status: "checking", username: trimmed };
}
