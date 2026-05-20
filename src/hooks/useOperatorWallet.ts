import { useMemo } from "react";

import { readDevEnv } from "@/lib/env";
import { DEFAULT_AUTO_TOPUP_CONFIG } from "@/lib/wallet/types";

import { useCurrentUser } from "./useCurrentUser";
import { useOperatorEnvelope } from "./useOperatorEnvelope";
import { useWallet } from "./useWallet";

/**
 * The operator's Spark wallet, ready to use.
 *
 * Connects eagerly the moment a seed is available — either from the
 * dev-only `VITE_WALLET_SEED` env override or the decrypted operator
 * envelope — so the header `<WalletBadge>` shows a live balance instead
 * of a placeholder. The SDK handle is keyed by user pubkey so two
 * operators on the same browser don't collide.
 *
 * **Eager connect is intentional.** AppHeader mounts once at the React
 * root and persists across SPA navigation, so a "lazy connect" gated
 * on dialog-open wasn't actually saving connect cycles across pages —
 * it was just hiding the balance until the user clicked. This hook
 * owns the trade-off: one SDK init per session vs. a useless badge.
 *
 * Returns `seed: undefined` when no seed is available; callers should
 * gate badge rendering on that and surface a manual "Set up wallet"
 * CTA so first-time users (or anyone whose auto-mint missed) can
 * recover without reloading.
 */
export function useOperatorWallet() {
  const { user } = useCurrentUser();
  const operator = useOperatorEnvelope();
  const seed =
    readDevEnv("VITE_WALLET_SEED") ?? operator.envelope?.wallet?.seed;
  const autoTopup = useMemo(
    () => ({
      ...DEFAULT_AUTO_TOPUP_CONFIG,
      enabled: false,
      fundingSource: "operator" as const,
    }),
    [],
  );
  const wallet = useWallet({
    walletId: user && seed ? `operator:${user.pubkey}` : undefined,
    mnemonic: seed,
    autoTopup,
  });

  return useMemo(
    () => ({ seed, wallet, operator }),
    [seed, wallet, operator],
  );
}
