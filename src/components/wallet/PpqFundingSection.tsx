import { useState } from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import type { UseWalletResult } from "@/hooks/useWallet";
import type { AutoTopupConfig, PpqFundingSource } from "@/lib/wallet/types";
import { fmtMoney } from "./WalletPanelFormat";
import {
  OperatorBackupStatus,
  PpqUsageActivity,
  SecretRow,
  type OperatorWalletDiagnostics,
} from "./WalletPanelSections";

interface PpqFundingSectionProps {
  wallet: UseWalletResult;
  walletScope: "persona" | "operator";
  operatorDiagnostics: OperatorWalletDiagnostics | undefined;
  onAutoTopupSave: ((config: AutoTopupConfig) => void | Promise<void>) | undefined;
}

export function PpqFundingSection({
  wallet,
  walletScope,
  operatorDiagnostics,
  onAutoTopupSave,
}: PpqFundingSectionProps) {
  const { toast } = useToast();
  const [showPpqChargeId, setShowPpqChargeId] = useState(false);
  const [showPpqApiKey, setShowPpqApiKey] = useState(false);
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(
    wallet.autoTopup.enabled,
  );
  const [fundingSource, setFundingSource] = useState<PpqFundingSource>(
    wallet.autoTopup.fundingSource,
  );
  const [thresholdInput, setThresholdInput] = useState(
    String(wallet.autoTopup.thresholdUsd),
  );
  const [topupAmountInput, setTopupAmountInput] = useState(
    String(wallet.autoTopup.topupAmountUsd),
  );
  const [manualTopupInput, setManualTopupInput] = useState(
    String(wallet.autoTopup.topupAmountUsd),
  );
  const [autoTopupError, setAutoTopupError] = useState<string | null>(null);
  const [manualTopupError, setManualTopupError] = useState<string | null>(null);
  const [rotatePpqError, setRotatePpqError] = useState<string | null>(null);
  const [isSavingAutoTopup, setIsSavingAutoTopup] = useState(false);

  async function saveAutoTopup() {
    const thresholdUsd = Number(thresholdInput);
    const topupAmountUsd = Number(topupAmountInput);
    if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
      setAutoTopupError("Enter a threshold greater than $0.");
      return;
    }
    if (!Number.isFinite(topupAmountUsd) || topupAmountUsd <= 0) {
      setAutoTopupError("Enter a top-up amount greater than $0.");
      return;
    }
    const next: AutoTopupConfig = {
      enabled: autoTopupEnabled,
      thresholdUsd,
      topupAmountUsd,
      fundingSource,
    };
    setAutoTopupError(null);
    setIsSavingAutoTopup(true);
    try {
      wallet.setAutoTopup(next);
      await onAutoTopupSave?.(next);
      toast({ title: "Auto top-up updated" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save auto top-up.";
      setAutoTopupError(message);
      toast({
        title: "Auto top-up save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSavingAutoTopup(false);
    }
  }

  async function runManualTopup() {
    const amountUsd = Number(manualTopupInput);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setManualTopupError("Enter an amount greater than $0.");
      return;
    }
    setManualTopupError(null);
    try {
      const result = await wallet.manualTopup(amountUsd, fundingSource);
      toast({
        title: "PPQ top-up sent",
        description: `${fmtMoney(result.toppedUpUsd)} top-up is ${result.status}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not top up PPQ credits.";
      setManualTopupError(message);
      toast({
        title: "PPQ top-up failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  async function rotatePpqCredentials() {
    setRotatePpqError(null);
    try {
      await wallet.rotatePpqAccount();
      setShowPpqApiKey(false);
      setShowPpqChargeId(false);
      toast({ title: "PPQ credentials rotated" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not rotate PPQ credentials.";
      setRotatePpqError(message);
      toast({
        title: "PPQ rotation failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <section>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          AI credits (PPQ)
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold">
            {wallet.isPpqBalanceLoading && wallet.ppqBalanceUsd === undefined ? (
              <Skeleton className="h-7 w-20 inline-block" />
            ) : (
              fmtMoney(wallet.ppqBalanceUsd)
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {wallet.autoTopup.enabled
              ? `auto top-up below $${wallet.autoTopup.thresholdUsd}`
              : "auto-topup off"}
          </p>
        </div>
        {wallet.autoTopupRun.lastResult ? (
          <p className="text-xs text-muted-foreground mt-1">
            Last top-up: {fmtMoney(wallet.autoTopupRun.lastResult.toppedUpUsd)} ·{" "}
            {wallet.autoTopupRun.lastResult.status}
          </p>
        ) : null}
        {wallet.autoTopupRun.lastError ? (
          <p className="text-xs text-destructive mt-1">
            Auto-topup error: {wallet.autoTopupRun.lastError.message}
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-md border bg-muted/20 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Top-ups</p>
          <div className="flex items-center gap-1.5">
            {wallet.fundingSources.length > 1 ? (
              <div
                className="flex rounded-md bg-muted p-0.5"
                aria-label="PPQ funding source"
              >
                {wallet.fundingSources.map((option) => (
                  <Button
                    key={option.source}
                    type="button"
                    variant={
                      fundingSource === option.source ? "secondary" : "ghost"
                    }
                    size="sm"
                    aria-label={`Fund from ${option.label}`}
                    disabled={!option.isAvailable}
                    onClick={() => setFundingSource(option.source)}
                    className="h-7 px-2 text-xs"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}
            <Checkbox
              id="ppq-auto-topup-enabled"
              checked={autoTopupEnabled}
              onCheckedChange={(checked) => setAutoTopupEnabled(checked === true)}
            />
            <Label htmlFor="ppq-auto-topup-enabled" className="text-sm">
              Auto
            </Label>
          </div>
        </div>
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="ppq-auto-threshold" className="text-xs">
              Auto below
            </Label>
            <Input
              id="ppq-auto-threshold"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={thresholdInput}
              className="h-8"
              onChange={(event) => setThresholdInput(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ppq-auto-amount" className="text-xs">
              Buy
            </Label>
            <Input
              id="ppq-auto-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={topupAmountInput}
              className="h-8"
              onChange={(event) => setTopupAmountInput(event.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={saveAutoTopup}
            disabled={isSavingAutoTopup}
            className="col-span-2 h-8 sm:col-span-1"
          >
            {isSavingAutoTopup ? "Saving..." : "Save"}
          </Button>
        </div>
        {autoTopupError ? (
          <p className="text-xs text-destructive">{autoTopupError}</p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="ppq-manual-amount" className="text-xs">
              Manual top-up
            </Label>
            <Input
              id="ppq-manual-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={manualTopupInput}
              className="h-8"
              onChange={(event) => setManualTopupInput(event.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 self-end"
            onClick={runManualTopup}
            disabled={wallet.isManualTopupRunning}
          >
            {wallet.isManualTopupRunning ? "Topping up..." : "Top up now"}
          </Button>
        </div>
        {manualTopupError || wallet.manualTopupError ? (
          <p className="text-xs text-destructive">
            {manualTopupError ?? wallet.manualTopupError?.message}
          </p>
        ) : null}
        {wallet.manualTopupResult ? (
          <p className="text-xs text-muted-foreground">
            Last manual top-up: {fmtMoney(wallet.manualTopupResult.toppedUpUsd)} ·{" "}
            {wallet.manualTopupResult.status}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Active PPQ credentials
          </p>
          {walletScope === "operator" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={rotatePpqCredentials}
              disabled={wallet.isPpqRotating}
              aria-label="Rotate PPQ credentials"
              className="h-8"
            >
              <RotateCw
                className={`mr-2 size-3.5 ${wallet.isPpqRotating ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {wallet.isPpqRotating ? "Rotating..." : "Rotate"}
            </Button>
          ) : null}
        </div>
        {walletScope === "operator" && (rotatePpqError || wallet.ppqRotateError) ? (
          <p className="text-xs text-destructive">
            {rotatePpqError ?? wallet.ppqRotateError?.message}
          </p>
        ) : null}
        <SecretRow
          label="PPQ charge id"
          value={wallet.ppqAccount?.credit_id}
          revealed={showPpqChargeId}
          onToggle={() => setShowPpqChargeId((v) => !v)}
        />
        <SecretRow
          label="API key"
          value={wallet.ppqAccount?.api_key}
          revealed={showPpqApiKey}
          onToggle={() => setShowPpqApiKey((v) => !v)}
          revealLabel="PPQ API key"
        />
      </section>

      {walletScope === "operator" && operatorDiagnostics ? (
        <OperatorBackupStatus diagnostics={operatorDiagnostics} />
      ) : null}

      <PpqUsageActivity
        items={wallet.ppqQueryHistory}
        isLoading={wallet.isPpqQueryHistoryLoading}
        error={wallet.ppqQueryHistoryError}
      />
    </>
  );
}
