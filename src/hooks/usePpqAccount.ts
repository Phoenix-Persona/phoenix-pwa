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

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createAccount, getBalance } from "@/lib/ppq/client";
import { ppqAccountStore } from "@/lib/ppq/storage";
import type { PpqAccount } from "@/lib/ppq/types";
import { readEnv } from "@/lib/env";

import { useOperatorEnvelope } from "./useOperatorEnvelope";

const ACCOUNT_QK = ["ppq", "account"] as const;
const BALANCE_QK = (creditId: string | undefined) =>
  ["ppq", "balance", creditId] as const;

function envAccount(): PpqAccount | null {
  const apiKey = readEnv("VITE_PPQ_API_KEY");
  if (!apiKey) return null;
  // credit_id is optional — when missing, balance lookup + auto-topup
  // will be best-effort, but inference still works.
  const creditId = readEnv("VITE_PPQ_CREDIT_ID") ?? "";
  return { api_key: apiKey, credit_id: creditId };
}

export function usePpqAccount() {
  const qc = useQueryClient();
  const operator = useOperatorEnvelope();

  // Resolve in priority: env > operator envelope > localStorage cache.
  const account = useMemo<PpqAccount | null>(() => {
    return (
      envAccount() ??
      operator.envelope?.ppq ??
      ppqAccountStore.load()
    );
  }, [operator.envelope?.ppq]);

  const ensureAccount = useMutation<PpqAccount, Error, void>({
    mutationKey: [...ACCOUNT_QK, "ensure"],
    mutationFn: async () => {
      // env wins — never mint over a pinned account.
      const fromEnv = envAccount();
      if (fromEnv) return fromEnv;

      // operator envelope is the production source of truth.
      const fromOperator = operator.envelope?.ppq;
      if (fromOperator) return fromOperator;

      // localStorage fallback (back-compat).
      const cached = ppqAccountStore.load();
      if (cached) {
        // Lift it into the operator envelope so it survives across
        // devices going forward. Don't block on this if the operator
        // doesn't exist yet — fall back gracefully.
        if (operator.envelope || operator.event) {
          await operator.ensureWithPpq(cached).catch(() => {/* best-effort */});
        }
        return cached;
      }

      // Mint a brand-new ppq.ai account, write to both stores.
      const fresh = await createAccount();
      ppqAccountStore.save(fresh);
      await operator.ensureWithPpq(fresh).catch((err) => {
        // If the envelope write fails, the localStorage cache still
        // unblocks the current request; log and move on.
        console.warn("[usePpqAccount] failed to persist to operator envelope:", err);
      });
      return fresh;
    },
    onSuccess: (acct) => {
      qc.invalidateQueries({ queryKey: BALANCE_QK(acct.credit_id) });
    },
  });

  const balance = useQuery({
    queryKey: BALANCE_QK(account?.credit_id),
    enabled: Boolean(account?.credit_id),
    queryFn: async ({ signal }) => {
      if (!account?.credit_id) throw new Error("No ppq credit_id");
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
   * Forget the local credential cache. The remote ppq.ai account still
   * exists and the operator envelope copy is untouched; this just
   * clears localStorage. Use to force a re-load from the operator
   * envelope, or before signing out of the operator entirely.
   */
  const signOut = useCallback(() => {
    ppqAccountStore.clear();
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
  return envAccount() ?? ppqAccountStore.load();
}
