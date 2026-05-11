/**
 * React entry point for the operator's PPQ account.
 *
 * Resolution priority (PROJECT.md §6 / `dev/.env.example`):
 *
 *   1. **Dev env override**: `VITE_PPQ_API_KEY` (+ optional
 *      `VITE_PPQ_CREDIT_ID`). Pins a known account outside production;
 *      production app flows ignore these values to avoid cross-operator
 *      credential sharing.
 *   2. **Operator envelope** (`useOperatorEnvelope`): the encrypted
 *      kind-30078 backup carrying the operator's persistent PPQ
 *      credentials. Source of truth for production.
 *   3. Missing account: mint a fresh ppq.ai account and publish it into
 *      the current operator envelope. The legacy global localStorage PPQ
 *      cache is deliberately not read or written.
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
 * update) so the operator carries them across devices.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { readDevEnv } from "@/lib/env";
import { createAccount, getBalance } from "@/lib/ppq/client";
import type { PpqAccount } from "@/lib/ppq/types";
import { queryKeys } from "@/lib/queryKeys";

import { useCurrentUser } from "./useCurrentUser";
import { useOperatorEnvelope } from "./useOperatorEnvelope";

/**
 * Dev-only "free credits" / pinned-account path. Production operator
 * flows ignore these env pins so AI credentials cannot be shared across
 * accounts by deployment configuration.
 */
function envAccount(): PpqAccount | null {
  const apiKey = readDevEnv("VITE_PPQ_API_KEY");
  if (!apiKey) return null;
  const creditId = readDevEnv("VITE_PPQ_CREDIT_ID") ?? "";
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

      // Mint a brand-new ppq.ai account and write it to the operator envelope.
      const fresh = await createAccount();
      await operator.ensureWithPpq(fresh);
      qc.setQueryData(accountKey, fresh);
      return fresh;
    },
    onSuccess: (acct) => {
      qc.setQueryData(accountKey, acct);
      qc.invalidateQueries({ queryKey: queryKeys.ppq.balance(acct.credit_id) });
    },
  });

  const rotateAccount = useMutation<PpqAccount, Error, void>({
    mutationKey: [...accountKey, "rotate"],
    mutationFn: async () => {
      const fromEnv = envAccount();
      if (fromEnv) {
        throw new Error("PPQ credentials are pinned by environment variables.");
      }

      const fresh = await createAccount();
      await operator.ensureWithPpq(fresh);
      qc.setQueryData(accountKey, fresh);
      return fresh;
    },
    onSuccess: (acct) => {
      qc.setQueryData(accountKey, acct);
      qc.removeQueries({ queryKey: queryKeys.ppq.allBalances() });
      qc.removeQueries({ queryKey: queryKeys.ppq.allQueryHistory() });
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
   * Forget in-memory PPQ query state. The remote ppq.ai account still
   * exists and the operator envelope copy is untouched.
   */
  const signOut = useCallback(() => {
    qc.removeQueries({ queryKey: queryKeys.ppq.all() });
    qc.setQueryData(
      accountKey,
      envAccount() ?? operator.envelope?.ppq ?? null,
    );
  }, [accountKey, operator.envelope?.ppq, qc]);

  return {
    account,
    ensureAccount: ensureAccount.mutateAsync,
    isEnsuring: ensureAccount.isPending,
    ensureError: ensureAccount.error,
    rotateAccount: rotateAccount.mutateAsync,
    isRotating: rotateAccount.isPending,
    rotateError: rotateAccount.error,
    balance: balance.data,
    isBalanceLoading: balance.isLoading,
    balanceError: balance.error,
    refreshBalance,
    signOut,
  };
}

/**
 * Pure helper for code that cannot use React hooks. Only env-pinned
 * credentials are safe to resolve outside the current operator context.
 */
export function getStoredPpqAccount(): PpqAccount | null {
  return envAccount();
}
