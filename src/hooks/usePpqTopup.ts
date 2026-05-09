/**
 * Lightning / crypto top-up primitives for the ppq.ai account.
 *
 * `usePpqLightningTopup()` is the headline mutation: it POSTs an invoice for
 * `amountUsd` worth of credit and returns the BOLT11 string the operator's
 * wallet needs to pay. The wallet itself is intentionally outside this hook —
 * we just produce the invoice so any wallet (manual paste, NIP-47 NWC,
 * webln) can pay it. After the invoice settles, ppq.ai credits the
 * `credit_id` automatically; the dashboard should call
 * `usePpqAccount().refreshBalance()` once the polling status flips to
 * `completed`.
 *
 * `usePpqTopupStatus(invoiceId)` polls `/topup/status/{id}` until the
 * invoice settles or expires.
 *
 * `usePpqNwcAutoTopup()` exposes the NIP-47 (Nostr Wallet Connect) auto-
 * topup primitive: hand ppq.ai an NWC URL plus a USD threshold, and ppq.ai
 * will automatically pull the next chunk of credit from the connected wallet
 * whenever the balance dips below the threshold. This is the natural
 * "wallet tops Phoenix up at will" story for the project; the wallet itself
 * is unimplemented but the URL exchange is wired now.
 */

import { useMutation, useQuery, type UseMutationResult } from "@tanstack/react-query";

import {
  connectNwcAutoTopup,
  createAccount,
  createTopupInvoice,
  disconnectNwcAutoTopup,
  extractBolt11,
  getNwcAutoTopup,
  getTopupStatus,
  isTopupTerminal,
  isTopupSettled,
  isTopupExpired,
} from "@/lib/ppq/client";
import { ppqAccountStore } from "@/lib/ppq/storage";
import type {
  PpqNwcConnectRequest,
  PpqNwcSettings,
  PpqTopupInvoice,
  PpqTopupMethod,
  PpqTopupStatusResponse,
} from "@/lib/ppq/types";

async function ensureAccountForCall() {
  const existing = ppqAccountStore.load();
  if (existing) return existing;
  const fresh = await createAccount();
  ppqAccountStore.save(fresh);
  return fresh;
}

export interface PpqTopupVars {
  amount: number;
  /** USD by default — `SATS` and `BTC` also supported. */
  currency?: "USD" | "BTC" | "SATS";
  method?: PpqTopupMethod;
}

export interface PpqTopupResult {
  invoice: PpqTopupInvoice;
  /** Convenience: the BOLT11 payable string when `method = "btc-lightning"`. */
  bolt11?: string;
}

export function usePpqLightningTopup(): UseMutationResult<
  PpqTopupResult,
  Error,
  PpqTopupVars
> {
  return useMutation({
    mutationFn: async ({ amount, currency = "USD", method = "btc-lightning" }) => {
      const { api_key } = await ensureAccountForCall();
      const invoice = await createTopupInvoice(api_key, method, amount, currency);
      return {
        invoice,
        bolt11: method === "btc-lightning" ? extractBolt11(invoice) : undefined,
      };
    },
  });
}

/**
 * Poll a topup invoice until it settles or expires. Cadence: 3s while
 * pending; stops on `completed` or `expired`.
 */
export function usePpqTopupStatus(
  invoiceId: string | undefined,
  intervalMs = 3_000,
) {
  const query = useQuery<PpqTopupStatusResponse>({
    queryKey: ["ppq", "topup", invoiceId],
    enabled: Boolean(invoiceId),
    queryFn: async ({ signal }) => {
      if (!invoiceId) throw new Error("missing invoice id");
      const acct = ppqAccountStore.load();
      if (!acct) throw new Error("no ppq account");
      return getTopupStatus(acct.api_key, invoiceId, { signal });
    },
    refetchInterval: (q) => {
      if (isTopupTerminal(q.state.data?.status)) return false;
      return intervalMs;
    },
  });

  const status = query.data?.status;
  return {
    ...query,
    isTerminal: isTopupTerminal(status),
    isSettled: isTopupSettled(status),
    isExpired: isTopupExpired(status),
  };
}

/* ---------- NWC (Nostr Wallet Connect) auto-topup ---------- */

export function usePpqNwcAutoTopup() {
  const settings = useQuery<PpqNwcSettings>({
    queryKey: ["ppq", "nwc-auto-topup"],
    queryFn: async ({ signal }) => {
      const acct = ppqAccountStore.load();
      if (!acct) throw new Error("no ppq account");
      return getNwcAutoTopup(acct.credit_id, { signal });
    },
    enabled: Boolean(ppqAccountStore.load()?.credit_id),
  });

  const connect = useMutation<PpqNwcSettings, Error, PpqNwcConnectRequest>({
    mutationFn: async (req) => {
      const { credit_id } = await ensureAccountForCall();
      return connectNwcAutoTopup(credit_id, req);
    },
    onSuccess: () => settings.refetch(),
  });

  const disconnect = useMutation<void, Error, void>({
    mutationFn: async () => {
      const acct = ppqAccountStore.load();
      if (!acct) return;
      await disconnectNwcAutoTopup(acct.credit_id);
    },
    onSuccess: () => settings.refetch(),
  });

  return {
    settings: settings.data,
    isLoading: settings.isLoading,
    refresh: settings.refetch,
    connect: connect.mutateAsync,
    isConnecting: connect.isPending,
    connectError: connect.error,
    disconnect: disconnect.mutateAsync,
    isDisconnecting: disconnect.isPending,
  };
}
