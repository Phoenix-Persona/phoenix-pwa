/**
 * Auto-mint the operator wallet on first login.
 *
 * When the operator logs in and:
 *   - has no operator wallet seed on record yet, AND
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
 *   - Won't mint if an existing wallet seed was found.
 *   - Won't mint if env override is already complete.
 *   - Runs at most once per session per user. On failure we don't
 *     auto-retry; the user recovers via the manual "Set up wallet"
 *     CTA in `<AppHeader>`, which calls `mint()` directly and
 *     bypasses this component's `ran` guard. Login state changes
 *     reset the guard so a new user (or re-login) gets a fresh shot.
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
  const { envelope, isLoading, isMinting, mint } = operator;
  const ran = useRef(false);

  useEffect(() => {
    if (!user) {
      ran.current = false;
      return;
    }
    if (isLoading) return;
    if (envelope?.wallet?.seed) return;
    if (isMinting) return;
    if (ran.current) return;
    if (envOverrideComplete()) return;

    ran.current = true;
    mint(envelope ? { ppq: envelope.ppq } : undefined).catch((err) => {
      // Auto-mint runs at most once per session per user. The error is
      // surfaced through `useOperatorEnvelope().mintError`; the AppHeader
      // renders a destructive "Wallet setup failed — retry" CTA the user
      // can click to invoke `mint()` directly. Resetting `ran.current`
      // here would hot-loop the effect (deps include `isMinting`, which
      // flips back to false on rejection).
      console.warn("[OperatorWalletInit] mint failed:", err);
    });
  }, [
    user,
    isLoading,
    envelope,
    isMinting,
    mint,
  ]);

  return null;
}
