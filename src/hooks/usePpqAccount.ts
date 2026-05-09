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

import { createAccount, getBalance } from "@/lib/ppq/client";
import { ppqAccountStore } from "@/lib/ppq/storage";
import type { PpqAccount } from "@/lib/ppq/types";

const ACCOUNT_QK = ["ppq", "account"] as const;
const BALANCE_QK = (creditId: string | undefined) =>
  ["ppq", "balance", creditId] as const;

export function usePpqAccount() {
  const qc = useQueryClient();
  const [account, setAccount] = useState<PpqAccount | null>(() =>
    ppqAccountStore.load(),
  );

  // Re-hydrate if another tab updated the credential.
  useEffect(() => {
    const onStorage = () => setAccount(ppqAccountStore.load());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ensureAccount = useMutation<PpqAccount, Error, void>({
    mutationKey: [...ACCOUNT_QK, "ensure"],
    mutationFn: async () => {
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
 * Pure helper — returns the account from storage without subscribing to
 * React state. Useful from event handlers / non-component code.
 */
export function getStoredPpqAccount(): PpqAccount | null {
  return ppqAccountStore.load();
}
