/**
 * React entry point for the ppq.ai account.
 *
 *   const { account, ensureAccount, balance, refreshBalance, signOut } =
 *     usePpqAccount();
 *
 *   // First call boots the account if missing; subsequent calls are no-ops.
 *   const acct = await ensureAccount();
 *
 * `ensureAccount()` is the *only* mutation that creates a new ppq.ai account,
 * and it stores credentials via the pluggable `ppqAccountStore`. The hook
 * deliberately does NOT auto-create on mount — we only spend a credit_id
 * when the operator actually exercises an AI service.
 */

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { readEnv } from "@/lib/env";
import { createAccount, getBalance } from "@/lib/ppq/client";
import { ppqAccountStore } from "@/lib/ppq/storage";
import type { PpqAccount } from "@/lib/ppq/types";

/**
 * "Free credits" path: when the operator has been issued a direct ppq.ai
 * api_key (e.g. from ppq.ai's team) without a credit_id-backed account,
 * they can drop it into Vite's env (`VITE_PPQ_API_KEY` in `.env` or
 * `dev/.env`) and the hook surfaces it as a virtual account. No
 * auto-create-account, no localStorage write, no balance check (the
 * `/credits/balance` endpoint requires a credit_id which we don't have).
 *
 * Returns null when the env key isn't set; callers fall through to the
 * existing localStorage / auto-create flow.
 */
function readEnvAccount(): PpqAccount | null {
  const apiKey = readEnv("VITE_PPQ_API_KEY");
  if (!apiKey) return null;
  return {
    api_key: apiKey,
    // Empty credit_id signals "env-only — skip balance queries".
    credit_id: "",
  };
}

const ACCOUNT_QK = ["ppq", "account"] as const;
const BALANCE_QK = (creditId: string | undefined) =>
  ["ppq", "balance", creditId] as const;

export function usePpqAccount() {
  const qc = useQueryClient();

  // Resolution order: VITE_PPQ_API_KEY env wins, then localStorage. The
  // env path is read once at mount (env doesn't change at runtime); the
  // localStorage path stays reactive via the storage event below.
  const [account, setAccount] = useState<PpqAccount | null>(
    () => readEnvAccount() ?? ppqAccountStore.load(),
  );

  // Re-hydrate if another tab updated the credential. Env wins over
  // storage, so if the env key is set we ignore storage events.
  useEffect(() => {
    if (readEnvAccount()) return;
    const onStorage = () => setAccount(ppqAccountStore.load());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ensureAccount = useMutation<PpqAccount, Error, void>({
    mutationKey: [...ACCOUNT_QK, "ensure"],
    mutationFn: async () => {
      // Env path short-circuits — never auto-create when the operator
      // already has a working api_key handed to them.
      const fromEnv = readEnvAccount();
      if (fromEnv) return fromEnv;
      const existing = ppqAccountStore.load();
      if (existing) return existing;
      const fresh = await createAccount();
      ppqAccountStore.save(fresh);
      return fresh;
    },
    onSuccess: (acct) => {
      setAccount(acct);
      qc.invalidateQueries({ queryKey: BALANCE_QK(acct.credit_id) });
    },
  });

  const balance = useQuery({
    queryKey: BALANCE_QK(account?.credit_id),
    enabled: Boolean(account?.credit_id),
    queryFn: async ({ signal }) => {
      if (!account) throw new Error("No ppq account");
      return getBalance(account.credit_id, { signal });
    },
    staleTime: 15_000,
  });

  const refreshBalance = useCallback(() => {
    if (account?.credit_id) {
      qc.invalidateQueries({ queryKey: BALANCE_QK(account.credit_id) });
    }
  }, [account, qc]);

  /**
   * Forget the local credential. The remote account still exists at ppq.ai;
   * this just clears localStorage. Use this when the operator wants to start
   * fresh or hand control to another machine.
   */
  const signOut = useCallback(() => {
    ppqAccountStore.clear();
    setAccount(null);
    qc.removeQueries({ queryKey: ["ppq"] });
  }, [qc]);

  return {
    account,
    ensureAccount: ensureAccount.mutateAsync,
    isEnsuring: ensureAccount.isPending,
    ensureError: ensureAccount.error,
    balance: balance.data,
    isBalanceLoading: balance.isLoading,
    balanceError: balance.error,
    refreshBalance,
    signOut,
  };
}

/**
 * Pure helper — returns the account from env (if VITE_PPQ_API_KEY is set)
 * or storage. No React subscription. Useful from event handlers /
 * non-component code that needs an api_key on demand.
 */
export function getStoredPpqAccount(): PpqAccount | null {
  return readEnvAccount() ?? ppqAccountStore.load();
}
