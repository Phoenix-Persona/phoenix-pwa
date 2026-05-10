/**
 * React entry point for the operator's PPQ account.
 *
 * Resolution priority (PROJECT.md §6 / `dev/.env.example`):
 *
 *   1. **Env override**: `VITE_PPQ_API_KEY` (+ optional
 *      `VITE_PPQ_CREDIT_ID`). Pins a known account; skips lookup and
 *      mint flows. Useful for dev so a fresh browser doesn't burn a
 *      brand-new PPQ account each time.
 *   2. **Operator envelope** (`useOperatorEnvelope`): the encrypted
 *      kind-30078 backup carrying the operator's persistent PPQ
 *      credentials. Source of truth for production.
 *   3. **localStorage cache** (`ppqAccountStore`): legacy compatibility.
 *      Kept only as a write-through cache after a
 *      current-operator account is created. It is NOT used to resolve
 *      credentials for a different operator because the cache is not
 *      scoped by pubkey.
 *
 *   const { account, ensureAccount, balance, refreshBalance, signOut } =
 *     usePpqAccount();
 *
 *   // First call boots the account if missing; subsequent calls are no-ops.
 *   const acct = await ensureAccount();
 *
 * `ensureAccount()` is the *only* mutation that creates a new ppq.ai
 * account, and after creating one it *also* writes the resulting
 * credentials into the operator envelope (publishing a kind-30078
 * update) so the operator carries them across devices. The localStorage
 * cache is updated alongside for fast subsequent loads.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { readEnv } from "@/lib/env";
import { createAccount, getBalance } from "@/lib/ppq/client";
import { ppqAccountStore } from "@/lib/ppq/storage";
import type { PpqAccount } from "@/lib/ppq/types";
import { queryKeys } from "@/lib/queryKeys";

import { useCurrentUser } from "./useCurrentUser";
import { useOperatorEnvelope } from "./useOperatorEnvelope";

/**
 * "Free credits" / pinned-account path: when `VITE_PPQ_API_KEY` is set
 * (in `.env` or `dev/.env`), surface that key as a virtual account and
 * skip the auto-create + envelope-write flows. Optional
 * `VITE_PPQ_CREDIT_ID` enables balance queries; when omitted, balance
 * lookup is skipped and inference still works.
 */
function envAccount(): PpqAccount | null {
  const apiKey = readEnv("VITE_PPQ_API_KEY");
  if (!apiKey) return null;
  const creditId = readEnv("VITE_PPQ_CREDIT_ID") ?? "";
  return { api_key: apiKey, credit_id: creditId };
}

function resolveAccount(operatorAccount: PpqAccount | undefined): PpqAccount | null {
  return envAccount() ?? operatorAccount ?? null;
}

export function usePpqAccount() {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const operator = useOperatorEnvelope();
  const accountKey = useMemo(
    () => queryKeys.ppq.account(user?.pubkey),
    [user?.pubkey],
  );

  const accountQuery = useQuery({
    queryKey: accountKey,
    queryFn: async (): Promise<PpqAccount | null> =>
      resolveAccount(operator.envelope?.ppq),
    staleTime: Infinity,
  });
  const account = accountQuery.data ?? null;

  useEffect(() => {
    qc.setQueryData(accountKey, resolveAccount(operator.envelope?.ppq));
  }, [accountKey, operator.envelope?.ppq, qc]);

  const ensureAccount = useMutation<PpqAccount, Error, void>({
    mutationKey: [...accountKey, "ensure"],
    mutationFn: async () => {
      // env wins — never mint over a pinned account.
      const fromEnv = envAccount();
      if (fromEnv) {
        qc.setQueryData(accountKey, fromEnv);
        return fromEnv;
      }

      // operator envelope is the production source of truth.
      const fromOperator = operator.envelope?.ppq;
      if (fromOperator) {
        qc.setQueryData(accountKey, fromOperator);
        return fromOperator;
      }

      // If the operator envelope is still loading, wait before deciding
      // to create a new PPQ account. Otherwise a fast AI action after
      // login can race the envelope query and mint duplicate credentials.
      if (operator.isLoading) {
        const refreshed = await operator.refetch();
        const fromRefetch = refreshed.data?.envelope.ppq;
        if (fromRefetch) {
          qc.setQueryData(accountKey, fromRefetch);
          return fromRefetch;
        }
      }

      // Mint a brand-new ppq.ai account, write to both stores.
      const fresh = await createAccount();
      ppqAccountStore.save(fresh);
      qc.setQueryData(accountKey, fresh);
      await operator.ensureWithPpq(fresh).catch((err) => {
        // The freshly minted account still unblocks the current request;
        // log the persistence failure and let a later call retry via the
        // operator envelope path.
        console.warn("[usePpqAccount] failed to persist to operator envelope:", err);
      });
      return fresh;
    },
    onSuccess: (acct) => {
      qc.setQueryData(accountKey, acct);
      qc.invalidateQueries({ queryKey: queryKeys.ppq.balance(acct.credit_id) });
    },
  });

  const balance = useQuery({
    queryKey: queryKeys.ppq.balance(account?.credit_id),
    enabled: Boolean(account?.credit_id),
    queryFn: async ({ signal }) => {
      if (!account?.credit_id) throw new Error("No ppq credit_id");
      return getBalance(account.credit_id, { signal });
    },
    staleTime: 15_000,
  });

  const refreshBalance = useCallback(() => {
    if (account?.credit_id) {
      qc.invalidateQueries({ queryKey: queryKeys.ppq.balance(account.credit_id) });
    }
  }, [account, qc]);

  /**
   * Forget the local credential cache. The remote ppq.ai account still
   * exists and the operator envelope copy is untouched; this just
   * clears localStorage. Use to force a re-load from the operator
   * envelope, or before signing out of the operator entirely.
   */
  const signOut = useCallback(() => {
    ppqAccountStore.clear();
    qc.setQueryData(
      accountKey,
      envAccount() ?? operator.envelope?.ppq ?? null,
    );
    qc.removeQueries({ queryKey: queryKeys.ppq.allBalances() });
  }, [accountKey, operator.envelope?.ppq, qc]);

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
 * Legacy pure helper for code that cannot use React hooks. Prefer
 * `usePpqAccount()` so credentials remain scoped to the current operator.
 */
export function getStoredPpqAccount(): PpqAccount | null {
  return envAccount() ?? ppqAccountStore.load();
}
