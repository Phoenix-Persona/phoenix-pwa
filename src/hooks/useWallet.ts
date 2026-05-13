/**
 * Single source of truth for the persona's wallet state.
 *
 * Exposes the headless wallet (Spark sats, Lightning Address, send / receive)
 * AND the persona's ppq.ai credit balance behind one hook so the dashboard
 * can render both numbers from a single subscription.
 *
 * Default-on auto-topup orchestrator lives here too: when ppq balance dips
 * below `autoTopup.thresholdUsd`, the hook fires a single in-flight
 * `runAutoTopupOnce` that pays a ppq Lightning invoice from the persona's
 * Spark wallet, polls until it settles, and refreshes the balance.
 *
 * Headless v1
 * ───────────
 * The hook accepts an explicit `mnemonic` arg. Persona-context integration
 * (auto-pull from the active persona's decrypted config) lands when the
 * wizard ships; until then, callers (integration tests, prototype pages)
 * pass the mnemonic directly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getQueryHistory } from "@/lib/ppq/client";
import { runAutoTopupOnce, runManualTopupOnce } from "@/lib/wallet/autoTopup";
import { queryKeys } from "@/lib/queryKeys";
import {
  connectWallet,
  disconnectWallet,
  listRecentPayments,
  loadWalletInfo,
  receiveBolt11,
  sendBolt11,
} from "@/lib/wallet/client";
import {
  DEFAULT_AUTO_TOPUP_CONFIG,
  type AutoTopupConfig,
  type AutoTopupRunResult,
  type Payment,
  type PpqFundingSource,
  type ReceiveBolt11Args,
  type ReceiveBolt11Result,
  type SendBolt11Args,
  type SendResult,
  type WalletHandle,
  type WalletInfo,
} from "@/lib/wallet/types";
import type { PpqAccount, PpqQueryHistoryItem } from "@/lib/ppq/types";

import { usePpqAccount } from "./usePpqAccount";

const WALLET_INFO_REFETCH_MS = 15_000;
const DEFAULT_SELF_FUNDED_AUTO_TOPUP_CONFIG: AutoTopupConfig = {
  ...DEFAULT_AUTO_TOPUP_CONFIG,
  fundingSource: "persona",
};

export interface OperatorFundingWallet {
  handle: WalletHandle | undefined;
  walletId: string | undefined;
  label: string;
  refreshInfo: () => void;
  refreshPayments: () => void;
  isConnecting?: boolean;
}

export interface PpqFundingSourceState {
  source: PpqFundingSource;
  label: string;
  isAvailable: boolean;
}

export interface UseWalletOptions {
  /** Non-secret identity for query keys, e.g. `persona:<pubkey>`. */
  walletId: string | undefined;
  /** BIP-39 mnemonic. Hook stays in disconnected state when undefined. */
  mnemonic: string | undefined;
  /**
   * Initial auto-topup config. Defaults to `DEFAULT_AUTO_TOPUP_CONFIG`
   * (enabled, threshold $5, top-up amount $5). The hook holds this in state and
   * exposes `setAutoTopup` for callers to mutate. Persistence (e.g. into
   * the persona's encrypted backup) is the caller's responsibility — wire
   * a `useEffect` on `autoTopup` to write changes back.
   */
  autoTopup?: AutoTopupConfig;
  operatorFundingWallet?: OperatorFundingWallet;
}

export interface AutoTopupRunState {
  isRunning: boolean;
  lastRunAt?: Date;
  lastError?: Error;
  lastResult?: AutoTopupRunResult;
}

export interface UseWalletResult {
  /* ----- Connection ----- */
  handle: WalletHandle | undefined;
  isConnecting: boolean;
  connectError: Error | undefined;
  /* ----- Spark wallet ----- */
  info: WalletInfo | undefined;
  isInfoLoading: boolean;
  infoError: Error | undefined;
  refreshInfo: () => void;
  payments: Payment[] | undefined;
  refreshPayments: () => void;
  receive: (args?: ReceiveBolt11Args) => Promise<ReceiveBolt11Result>;
  isReceiving: boolean;
  receiveError: Error | undefined;
  send: (args: SendBolt11Args) => Promise<SendResult>;
  isSending: boolean;
  sendError: Error | undefined;
  /* ----- ppq.ai credit ----- */
  ppqBalanceUsd: number | undefined;
  ppqAccount: PpqAccount | null;
  rotatePpqAccount: () => Promise<PpqAccount>;
  isPpqRotating: boolean;
  ppqRotateError: Error | undefined;
  isPpqBalanceLoading: boolean;
  refreshPpqBalance: () => void;
  ppqQueryHistory: PpqQueryHistoryItem[] | undefined;
  isPpqQueryHistoryLoading: boolean;
  ppqQueryHistoryError: Error | undefined;
  refreshPpqQueryHistory: () => void;
  /* ----- Auto-topup ----- */
  autoTopup: AutoTopupConfig;
  setAutoTopup: (cfg: AutoTopupConfig) => void;
  autoTopupRun: AutoTopupRunState;
  /** Manually trigger an auto-topup pass (bypasses threshold check). */
  triggerAutoTopup: () => Promise<AutoTopupRunResult | null>;
  fundingSources: PpqFundingSourceState[];
  manualTopup: (
    amountUsd: number,
    source?: PpqFundingSource,
  ) => Promise<AutoTopupRunResult>;
  isManualTopupRunning: boolean;
  manualTopupError: Error | undefined;
  manualTopupResult: AutoTopupRunResult | undefined;
}

export function useWallet(opts: UseWalletOptions): UseWalletResult {
  const { mnemonic, walletId } = opts;
  const operatorFundingHandle = opts.operatorFundingWallet?.handle;
  const operatorFundingLabel = opts.operatorFundingWallet?.label;
  const operatorFundingRefreshInfo = opts.operatorFundingWallet?.refreshInfo;
  const operatorFundingRefreshPayments =
    opts.operatorFundingWallet?.refreshPayments;
  const qc = useQueryClient();

  const ppq = usePpqAccount();

  /* ---------- Auto-topup config (controlled-ish, no sync effect) ---------- */

  // The local override wins when set; otherwise we fall back to whatever the
  // caller is currently passing in `opts.autoTopup`. This pattern lets prop
  // changes flow through without a sync effect (which the React lint rules
  // — rightly — flag as an anti-pattern).
  const autoTopupIdentity = walletId ?? "";
  const [localAutoTopup, setLocalAutoTopup] = useState<
    | {
        identity: string;
        config: AutoTopupConfig;
      }
    | undefined
  >(undefined);
  const autoTopup =
    localAutoTopup?.identity === autoTopupIdentity
      ? localAutoTopup.config
      : opts.autoTopup ?? DEFAULT_SELF_FUNDED_AUTO_TOPUP_CONFIG;
  const setAutoTopup = useCallback((cfg: AutoTopupConfig) => {
    setLocalAutoTopup({ identity: autoTopupIdentity, config: cfg });
  }, [autoTopupIdentity]);

  /* ---------- SDK connect ---------- */

  const [handle, setHandle] = useState<WalletHandle | undefined>(undefined);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<Error | undefined>();
  const handleRef = useRef<WalletHandle | undefined>(undefined);

  // Connect the SDK whenever the mnemonic identity changes. State changes
  // are driven through async callbacks (Promise resolution) so the effect
  // body itself stays synchronization-only.
  useEffect(() => {
    let cancelled = false;

    const work = async () => {
      const handleToConnect = mnemonic;
      if (!handleToConnect) {
        const stale = handleRef.current;
        if (stale) {
          handleRef.current = undefined;
          setHandle(undefined);
          await disconnectWallet(stale).catch(() => undefined);
        }
        return;
      }
      setIsConnecting(true);
      setConnectError(undefined);
      try {
        const h = await connectWallet({ mnemonic: handleToConnect });
        if (cancelled) {
          await disconnectWallet(h).catch(() => undefined);
          return;
        }
        const prev = handleRef.current;
        handleRef.current = h;
        setHandle(h);
        if (prev && prev !== h) {
          await disconnectWallet(prev).catch(() => undefined);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setConnectError(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      } finally {
        if (!cancelled) setIsConnecting(false);
      }
    };

    void work();
    return () => {
      cancelled = true;
    };
  }, [mnemonic]);

  // Disconnect on full unmount.
  useEffect(() => {
    return () => {
      const stale = handleRef.current;
      if (stale) void disconnectWallet(stale).catch(() => undefined);
    };
  }, []);

  /* ---------- Wallet info / payments ---------- */

  const infoQuery = useQuery({
    queryKey: queryKeys.wallet.detail(walletId),
    enabled: Boolean(handle),
    queryFn: async () => {
      if (!handle) throw new Error("Wallet not connected");
      return loadWalletInfo(handle);
    },
    staleTime: 5_000,
    refetchInterval: WALLET_INFO_REFETCH_MS,
  });

  const paymentsQuery = useQuery({
    queryKey: queryKeys.wallet.payments(walletId),
    enabled: Boolean(handle),
    queryFn: async () => {
      if (!handle) throw new Error("Wallet not connected");
      return listRecentPayments(handle, 50);
    },
    staleTime: 30_000,
  });

  const refreshInfo = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.wallet.detail(walletId) });
  }, [walletId, qc]);
  const refreshPayments = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.wallet.payments(walletId) });
  }, [walletId, qc]);

  const isOperatorWallet = walletId?.startsWith("operator:") ?? false;
  const fundingSources = useMemo<PpqFundingSourceState[]>(
    () => [
      {
        source: "operator",
        label: operatorFundingLabel ?? "Operator",
        isAvailable: Boolean(
          operatorFundingHandle ?? (isOperatorWallet ? handle : undefined),
        ),
      },
      ...(isOperatorWallet
        ? []
        : [
            {
              source: "persona" as const,
              label: "Persona",
              isAvailable: Boolean(handle),
            },
          ]),
    ],
    [
      handle,
      isOperatorWallet,
      operatorFundingHandle,
      operatorFundingLabel,
    ],
  );

  const resolveFundingWallet = useCallback(
    (source: PpqFundingSource) => {
      if (source === "operator") {
        if (
          operatorFundingHandle &&
          operatorFundingRefreshInfo &&
          operatorFundingRefreshPayments
        ) {
          return {
            handle: operatorFundingHandle,
            refreshInfo: operatorFundingRefreshInfo,
            refreshPayments: operatorFundingRefreshPayments,
          };
        }
        if (isOperatorWallet && handle) {
          return { handle, refreshInfo, refreshPayments };
        }
        return null;
      }
      if (!handle) return null;
      return { handle, refreshInfo, refreshPayments };
    },
    [
      handle,
      isOperatorWallet,
      operatorFundingHandle,
      operatorFundingRefreshInfo,
      operatorFundingRefreshPayments,
      refreshInfo,
      refreshPayments,
    ],
  );

  const refreshFundingWallet = useCallback(
    (source: PpqFundingSource) => {
      const fundingWallet = resolveFundingWallet(source);
      fundingWallet?.refreshInfo();
      fundingWallet?.refreshPayments();
    },
    [resolveFundingWallet],
  );

  const ppqQueryHistoryQuery = useQuery({
    queryKey: queryKeys.ppq.queryHistory(ppq.account?.credit_id),
    enabled: Boolean(ppq.account?.api_key),
    queryFn: async (c) => {
      if (!ppq.account) throw new Error("ppq account not initialized");
      return getQueryHistory(ppq.account.api_key, {
        page: 1,
        pageCount: 20,
        allKeys: true,
        signal: c.signal,
      });
    },
    staleTime: 30_000,
  });

  const refreshPpqQueryHistory = useCallback(() => {
    qc.invalidateQueries({
      queryKey: queryKeys.ppq.queryHistory(ppq.account?.credit_id),
    });
  }, [ppq.account?.credit_id, qc]);

  /* ---------- Receive / send ---------- */

  const receiveMutation = useMutation<
    ReceiveBolt11Result,
    Error,
    ReceiveBolt11Args | undefined
  >({
    mutationFn: async (args) => {
      if (!handle) throw new Error("Wallet not connected");
      return receiveBolt11(handle, args ?? {});
    },
  });

  const sendMutation = useMutation<SendResult, Error, SendBolt11Args>({
    mutationFn: async (args) => {
      if (!handle) throw new Error("Wallet not connected");
      const res = await sendBolt11(handle, args);
      // Pre-emptively refetch so balance / history reflect the new state.
      refreshInfo();
      refreshPayments();
      return res;
    },
  });

  /* ---------- Auto-topup ---------- */

  const [autoTopupRun, setAutoTopupRun] = useState<AutoTopupRunState>({
    isRunning: false,
  });
  const lastAutoTopupKeyRef = useRef<string | undefined>(undefined);

  const autoTopupMutation = useMutation<
    AutoTopupRunResult | null,
    Error,
    void
  >({
    mutationFn: async () => {
      if (!ppq.account) throw new Error("ppq account not initialized");
      const fundingWallet = resolveFundingWallet(autoTopup.fundingSource);
      if (!fundingWallet) {
        throw new Error(`${autoTopup.fundingSource} funding wallet not connected`);
      }
      return runAutoTopupOnce({
        wallet: fundingWallet.handle,
        ppqApiKey: ppq.account.api_key,
        ppqBalanceUsd: ppq.balance?.balance_usd,
        config: autoTopup,
      });
    },
    onMutate: () => {
      setAutoTopupRun((s) => ({ ...s, isRunning: true, lastError: undefined }));
    },
    onSuccess: (result) => {
      setAutoTopupRun({
        isRunning: false,
        lastRunAt: new Date(),
        lastResult: result ?? undefined,
      });
      ppq.refreshBalance();
      refreshFundingWallet(autoTopup.fundingSource);
      refreshPpqQueryHistory();
    },
    onError: (err) => {
      setAutoTopupRun((s) => ({
        ...s,
        isRunning: false,
        lastError: err,
      }));
    },
  });

  // Threshold trigger: when ppq balance dips below threshold and we have a
  // wallet, kick off one auto-topup pass. Guarded by the mutation's pending
  // state so we never queue concurrent runs.
  const balanceUsd = ppq.balance?.balance_usd;
  const canAutoTopup = Boolean(
    resolveFundingWallet(autoTopup.fundingSource) &&
      ppq.account &&
      autoTopup.enabled,
  );
  useEffect(() => {
    if (!canAutoTopup) return;
    if (typeof balanceUsd !== "number") return;
    if (balanceUsd >= autoTopup.thresholdUsd) {
      lastAutoTopupKeyRef.current = undefined;
      return;
    }
    if (autoTopupMutation.isPending) return;
    if (autoTopupRun.isRunning) return;
    const runKey = [
      ppq.account?.credit_id,
      balanceUsd,
      autoTopup.thresholdUsd,
      autoTopup.topupAmountUsd,
      autoTopup.fundingSource,
    ].join(":");
    if (lastAutoTopupKeyRef.current === runKey) return;
    lastAutoTopupKeyRef.current = runKey;
    autoTopupMutation.mutate();
  }, [
    balanceUsd,
    canAutoTopup,
    autoTopup.thresholdUsd,
    autoTopup.topupAmountUsd,
    autoTopup.fundingSource,
    ppq.account?.credit_id,
    resolveFundingWallet,
    autoTopupMutation.isPending,
    autoTopupMutation.mutate,
    autoTopupRun.isRunning,
  ]);

  const triggerAutoTopup = useCallback(async () => {
    return autoTopupMutation.mutateAsync();
  }, [autoTopupMutation]);

  const manualTopupMutation = useMutation<
    AutoTopupRunResult,
    Error,
    { amountUsd: number; source: PpqFundingSource }
  >({
    mutationFn: async ({ amountUsd, source }) => {
      if (!ppq.account) throw new Error("ppq account not initialized");
      const fundingWallet = resolveFundingWallet(source);
      if (!fundingWallet) throw new Error(`${source} funding wallet not connected`);
      return runManualTopupOnce({
        wallet: fundingWallet.handle,
        ppqApiKey: ppq.account.api_key,
        amountUsd,
      });
    },
    onSuccess: (_result, variables) => {
      ppq.refreshBalance();
      refreshFundingWallet(variables.source);
      refreshPpqQueryHistory();
    },
  });

  /* ---------- Result ---------- */

  return useMemo<UseWalletResult>(
    () => ({
      handle,
      isConnecting,
      connectError,
      info: infoQuery.data,
      isInfoLoading: infoQuery.isLoading,
      infoError: infoQuery.error ?? undefined,
      refreshInfo,
      payments: paymentsQuery.data,
      refreshPayments,
      receive: (args) => receiveMutation.mutateAsync(args),
      isReceiving: receiveMutation.isPending,
      receiveError: receiveMutation.error ?? undefined,
      send: (args) => sendMutation.mutateAsync(args),
      isSending: sendMutation.isPending,
      sendError: sendMutation.error ?? undefined,
      ppqBalanceUsd: ppq.balance?.balance_usd,
      ppqAccount: ppq.account,
      rotatePpqAccount: ppq.rotateAccount,
      isPpqRotating: ppq.isRotating,
      ppqRotateError: ppq.rotateError ?? undefined,
      isPpqBalanceLoading: ppq.isBalanceLoading,
      refreshPpqBalance: ppq.refreshBalance,
      ppqQueryHistory: ppqQueryHistoryQuery.data?.data,
      isPpqQueryHistoryLoading: ppqQueryHistoryQuery.isLoading,
      ppqQueryHistoryError: ppqQueryHistoryQuery.error ?? undefined,
      refreshPpqQueryHistory,
      autoTopup,
      setAutoTopup,
      autoTopupRun,
      triggerAutoTopup,
      fundingSources,
      manualTopup: (amountUsd, source = autoTopup.fundingSource) =>
        manualTopupMutation.mutateAsync({ amountUsd, source }),
      isManualTopupRunning: manualTopupMutation.isPending,
      manualTopupError: manualTopupMutation.error ?? undefined,
      manualTopupResult: manualTopupMutation.data,
    }),
    [
      handle,
      isConnecting,
      connectError,
      infoQuery.data,
      infoQuery.isLoading,
      infoQuery.error,
      refreshInfo,
      paymentsQuery.data,
      refreshPayments,
      receiveMutation,
      sendMutation,
      ppq.balance?.balance_usd,
      ppq.account,
      ppq.rotateAccount,
      ppq.isRotating,
      ppq.rotateError,
      ppq.isBalanceLoading,
      ppq.refreshBalance,
      ppqQueryHistoryQuery.data,
      ppqQueryHistoryQuery.isLoading,
      ppqQueryHistoryQuery.error,
      refreshPpqQueryHistory,
      autoTopup,
      setAutoTopup,
      autoTopupRun,
      triggerAutoTopup,
      fundingSources,
      manualTopupMutation,
    ],
  );
}
