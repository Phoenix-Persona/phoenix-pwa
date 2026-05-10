/**
 * Auto-mint the operator wallet on first login.
 *
 * When the operator logs in and:
 *   - has no operator envelope on record yet, AND
 *   - hasn't pinned both `VITE_WALLET_SEED` + `VITE_PPQ_API_KEY` via
 *     env (in which case env override is sufficient and minting would
 *     just be noise),
 *
 * this component fires `useOperatorEnvelope().mint()` once. The
 * resulting envelope carries a fresh BIP-39 wallet seed (no PPQ
 * account yet — that lazy-creates on first AI request via
 * `usePpqAccount.ensureAccount`).
 *
 * Mounted from `App.tsx` inside `<NostrProvider>` (needs
 * `useCurrentUser` + nostr query infra). Renders nothing.
 *
 * Conservative behavior:
 *   - Won't mint until the query has settled (so we don't double-mint
 *     if an envelope is in flight).
 *   - Won't mint if an existing envelope was found.
 *   - Won't mint if env override is already complete.
 *   - Runs once per session; failures clear the guard so subsequent
 *     events (login state change) get a retry.
 */

import { useEffect, useRef } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOperatorEnvelope } from "@/hooks/useOperatorEnvelope";
import { readEnv } from "@/lib/env";

function envOverrideComplete(): boolean {
  return Boolean(
    readEnv("VITE_WALLET_SEED") && readEnv("VITE_PPQ_API_KEY"),
  );
}

export function OperatorWalletInit() {
  const { user } = useCurrentUser();
  const operator = useOperatorEnvelope();
  const ran = useRef(false);

  useEffect(() => {
    if (!user) {
      ran.current = false;
      return;
    }
    if (operator.isLoading) return;
    if (operator.envelope) return;
    if (operator.isMinting) return;
    if (ran.current) return;
    if (envOverrideComplete()) return;

    ran.current = true;
    operator.mint(undefined).catch((err) => {
      console.warn("[OperatorWalletInit] mint failed:", err);
      // Allow another attempt on next state change (e.g. retry).
      ran.current = false;
    });
  }, [
    user,
    operator.isLoading,
    operator.envelope,
    operator.isMinting,
    operator.mint,
  ]);

  return null;
}
