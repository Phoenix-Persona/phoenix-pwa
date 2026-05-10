import { useMemo } from "react";

import { readEnv } from "@/lib/env";

import { useCurrentUser } from "./useCurrentUser";
import { useOperatorEnvelope } from "./useOperatorEnvelope";
import { useWallet } from "./useWallet";

export function useOperatorWallet(enabled: boolean) {
  const { user } = useCurrentUser();
  const operator = useOperatorEnvelope();
  const seed = readEnv("VITE_WALLET_SEED") ?? operator.envelope?.wallet?.seed;
  const wallet = useWallet({
    walletId: enabled && user ? `operator:${user.pubkey}` : undefined,
    mnemonic: enabled ? seed : undefined,
  });

  return useMemo(
    () => ({ seed, wallet, operator }),
    [seed, wallet, operator],
  );
}
