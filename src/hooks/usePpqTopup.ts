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
  createTopupInvoice,
  disconnectNwcAutoTopup,
  extractBolt11,
  getNwcAutoTopup,
  getTopupStatus,
  isTopupTerminal,
  isTopupSettled,
  isTopupExpired,
} from "@/lib/ppq/client";
import { queryKeys } from "@/lib/queryKeys";
import type {
  PpqNwcConnectRequest,
  PpqNwcSettings,
  PpqTopupInvoice,
  PpqTopupMethod,
  PpqTopupStatusResponse,
} from "@/lib/ppq/types";
import { usePpqAccount } from "./usePpqAccount";

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
  const { ensureAccount } = usePpqAccount();

  return useMutation({
    mutationFn: async ({ amount, currency = "USD", method = "btc-lightning" }) => {
      const { api_key } = await ensureAccount();
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
  const { account } = usePpqAccount();

  const query = useQuery<PpqTopupStatusResponse>({
    queryKey: queryKeys.ppq.topup(account?.credit_id, invoiceId),
    enabled: Boolean(invoiceId && account?.api_key),
    queryFn: async ({ signal }) => {
      if (!invoiceId) throw new Error("missing invoice id");
      if (!account) throw new Error("no ppq account");
      return getTopupStatus(account.api_key, invoiceId, { signal });
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
  const { account, ensureAccount } = usePpqAccount();

  const settings = useQuery<PpqNwcSettings>({
    queryKey: queryKeys.ppq.nwcAutoTopup(account?.credit_id),
    queryFn: async ({ signal }) => {
      if (!account) throw new Error("no ppq account");
      return getNwcAutoTopup(account.credit_id, { signal });
    },
    enabled: Boolean(account?.credit_id),
  });

  const connect = useMutation<PpqNwcSettings, Error, PpqNwcConnectRequest>({
    mutationFn: async (req) => {
      const { credit_id } = await ensureAccount();
      return connectNwcAutoTopup(credit_id, req);
    },
    onSuccess: () => settings.refetch(),
  });

  const disconnect = useMutation<void, Error, void>({
    mutationFn: async () => {
      if (!account) return;
      await disconnectNwcAutoTopup(account.credit_id);
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
