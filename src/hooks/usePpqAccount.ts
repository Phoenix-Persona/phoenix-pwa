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
 *   3. **localStorage cache** (`ppqAccountStore`): legacy fast path.
 *      Kept for back-compat with personas/sessions created before
 *      operator envelopes shipped; will be retired once that's
 *      migrated.
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

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { readEnv } from "@/lib/env";
import { createAccount, getBalance } from "@/lib/ppq/client";
import { ppqAccountStore } from "@/lib/ppq/storage";
import type { PpqAccount } from "@/lib/ppq/types";
import { queryKeys } from "@/lib/queryKeys";

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
  return envAccount() ?? operatorAccount ?? ppqAccountStore.load();
}

export function usePpqAccount() {
  const qc = useQueryClient();
  const operator = useOperatorEnvelope();

  const accountQuery = useQuery({
    queryKey: queryKeys.ppq.account(),
    queryFn: async (): Promise<PpqAccount | null> =>
      resolveAccount(operator.envelope?.ppq),
    staleTime: Infinity,
  });
  const account = accountQuery.data ?? null;

  useEffect(() => {
    qc.setQueryData(queryKeys.ppq.account(), resolveAccount(operator.envelope?.ppq));
  }, [operator.envelope?.ppq, qc]);

  const ensureAccount = useMutation<PpqAccount, Error, void>({
    mutationKey: [...queryKeys.ppq.account(), "ensure"],
    mutationFn: async () => {
      // env wins — never mint over a pinned account.
      const fromEnv = envAccount();
      if (fromEnv) {
        qc.setQueryData(queryKeys.ppq.account(), fromEnv);
        return fromEnv;
      }

      // operator envelope is the production source of truth.
      const fromOperator = operator.envelope?.ppq;
      if (fromOperator) {
        qc.setQueryData(queryKeys.ppq.account(), fromOperator);
        return fromOperator;
      }

      // localStorage fallback (back-compat).
      const cached = ppqAccountStore.load();
      if (cached) {
        // Lift it into the operator envelope so it survives across
        // devices going forward. Don't block on this if the operator
        // doesn't exist yet — fall back gracefully.
        if (operator.envelope || operator.event) {
          await operator.ensureWithPpq(cached).catch(() => {/* best-effort */});
        }
        qc.setQueryData(queryKeys.ppq.account(), cached);
        return cached;
      }

      // Mint a brand-new ppq.ai account, write to both stores.
      const fresh = await createAccount();
      ppqAccountStore.save(fresh);
      qc.setQueryData(queryKeys.ppq.account(), fresh);
      await operator.ensureWithPpq(fresh).catch((err) => {
        // If the envelope write fails, the localStorage cache still
        // unblocks the current request; log and move on.
        console.warn("[usePpqAccount] failed to persist to operator envelope:", err);
      });
      return fresh;
    },
    onSuccess: (acct) => {
      qc.setQueryData(queryKeys.ppq.account(), acct);
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
      queryKeys.ppq.account(),
      envAccount() ?? operator.envelope?.ppq ?? null,
    );
    qc.removeQueries({ queryKey: queryKeys.ppq.allBalances() });
  }, [operator.envelope?.ppq, qc]);

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
  return envAccount() ?? ppqAccountStore.load();
}
