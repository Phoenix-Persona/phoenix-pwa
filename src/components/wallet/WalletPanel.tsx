/**
 * Reusable wallet panel — used inside WalletDialog (Dashboard) and
 * directly in the /dev/wallet harness. Reads everything from the
 * `useWallet` result passed in as `wallet`.
 *
 * Sections:
 *   - Balance (sats + USD where available)
 *   - Lightning Address (copy + LNURL/QR toggle)
 *   - Receive / Send buttons (open child dialogs)
 *   - PPQ credits + auto-topup state
 *   - Recent payments
 *
 * Lightning Address registration lives on the EditPersona page —
 * changing it requires re-publishing kind 0 and the encrypted backup,
 * so the wallet panel only renders the read-only address (or a hint
 * pointing at the edit page when missing).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Eye,
  EyeOff,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/useToast";
import type { UseWalletResult } from "@/hooks/useWallet";
import type { AutoTopupConfig } from "@/lib/wallet/types";
import { ReceiveDialog } from "./ReceiveDialog";
import { SendDialog } from "./SendDialog";

interface WalletPanelProps {
  wallet: UseWalletResult;
  /**
   * When provided AND the wallet has no Lightning Address registered,
   * the missing-address state renders a hint linking here so the user
   * can claim a username from the persona profile editor. Omitted in
   * the dev harness (no persona context).
   */
  editPersonaHref?: string;
  onAutoTopupSave?: (config: AutoTopupConfig) => void | Promise<void>;
}

function fmtSats(n: number | undefined): string {
  if (typeof n !== "number") return "—";
  return `${n.toLocaleString("en-US")} sats`;
}

function fmtMoney(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtPreciseMoney(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n > 0 && n < 0.1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function fmtTime(ts: number | undefined): string {
  if (typeof ts !== "number") return "";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function fmtHistoryTime(ts: string | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

export function WalletPanel({
  wallet,
  editPersonaHref,
  onAutoTopupSave,
}: WalletPanelProps) {
  const { toast } = useToast();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [showPpqChargeId, setShowPpqChargeId] = useState(false);
  const [showPpqApiKey, setShowPpqApiKey] = useState(false);
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(
    wallet.autoTopup.enabled,
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
  const [isSavingAutoTopup, setIsSavingAutoTopup] = useState(false);

  const balanceSats = wallet.info?.balanceSats;
  const lightningAddress = wallet.info?.lightningAddress;
  const lnurlPay = wallet.info?.lnurlPay;

  function copyAddress() {
    if (!lightningAddress) return;
    navigator.clipboard.writeText(lightningAddress);
    toast({ title: "Lightning Address copied" });
  }

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
      const result = await wallet.manualTopup(amountUsd);
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

  if (!wallet.handle) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        {wallet.isConnecting ? (
          <>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : wallet.connectError ? (
          <p className="text-destructive">
            Wallet failed to connect: {wallet.connectError.message}
          </p>
        ) : (
          <p>No wallet seed available. Create a new persona to get a wallet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Tabs defaultValue="lightning" className="gap-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lightning">Lightning</TabsTrigger>
          <TabsTrigger value="ppq">AI Credits</TabsTrigger>
        </TabsList>

        <TabsContent value="lightning" className="mt-0 space-y-5">
          {/* Balance */}
          <section>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Balance
            </p>
            <p className="text-2xl font-semibold flex items-center gap-2">
              <Zap className="h-5 w-5 text-rw-gold" aria-hidden />
              {wallet.isInfoLoading && balanceSats === undefined ? (
                <Skeleton className="h-7 w-28 inline-block" />
              ) : (
                fmtSats(balanceSats)
              )}
            </p>
          </section>

          {/* LNURL QR + Lightning Address */}
          <section className="space-y-2">
            {lightningAddress ? (
              <>
                {lnurlPay ? (
                  <div className="flex justify-center">
                    <div className="rounded bg-white p-2">
                      <QRCodeCanvas value={lnurlPay} size={192} />
                    </div>
                  </div>
                ) : null}
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Lightning Address
                </p>
                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-sm bg-muted px-2 py-1 rounded truncate min-w-0">
                    {lightningAddress}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyAddress}
                    aria-label="Copy Lightning Address"
                    className="shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : editPersonaHref ? (
              <>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Lightning Address
                </p>
                <p className="text-sm text-muted-foreground">
                  No Lightning Address yet. Set a username on the{" "}
                  <Link
                    to={editPersonaHref}
                    className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    Edit persona
                  </Link>{" "}
                  page to register one.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Lightning Address
                </p>
                <p className="text-sm text-muted-foreground">
                  Not registered yet. Use Receive to generate an invoice instead.
                </p>
              </>
            )}
          </section>

          {/* Actions */}
          <section className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setReceiveOpen(true)}
              className="justify-start"
            >
              <ArrowDownLeft className="h-4 w-4 mr-2" />
              Receive
            </Button>
            <Button
              variant="outline"
              onClick={() => setSendOpen(true)}
              className="justify-start"
            >
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Send
            </Button>
          </section>

          <RecentActivity payments={wallet.payments} />
        </TabsContent>

        <TabsContent value="ppq" className="mt-0 space-y-5">
          {/* PPQ credits + auto-topup */}
          <section>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              AI credits (PPQ)
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-2xl font-semibold">
                {wallet.isPpqBalanceLoading &&
                wallet.ppqBalanceUsd === undefined ? (
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

          <section className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Auto top-up</p>
                <p className="text-xs text-muted-foreground">
                  Buy PPQ credits from this persona's Lightning wallet when the
                  balance gets low.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ppq-auto-topup-enabled"
                  checked={autoTopupEnabled}
                  onCheckedChange={(checked) =>
                    setAutoTopupEnabled(checked === true)
                  }
                />
                <Label htmlFor="ppq-auto-topup-enabled" className="text-sm">
                  Enabled
                </Label>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ppq-auto-threshold">Threshold USD</Label>
                <Input
                  id="ppq-auto-threshold"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={thresholdInput}
                  onChange={(event) => setThresholdInput(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ppq-auto-amount">Top-up amount USD</Label>
                <Input
                  id="ppq-auto-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={topupAmountInput}
                  onChange={(event) => setTopupAmountInput(event.target.value)}
                />
              </div>
            </div>
            {autoTopupError ? (
              <p className="text-xs text-destructive">{autoTopupError}</p>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={saveAutoTopup}
              disabled={isSavingAutoTopup}
            >
              {isSavingAutoTopup ? "Saving..." : "Save auto top-up"}
            </Button>
          </section>

          <section className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div>
              <p className="text-sm font-medium">Manual top-up</p>
              <p className="text-xs text-muted-foreground">
                Buy a specific amount of PPQ credits now.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="ppq-manual-amount">
                  Manual top-up amount
                </Label>
                <Input
                  id="ppq-manual-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={manualTopupInput}
                  onChange={(event) => setManualTopupInput(event.target.value)}
                />
              </div>
              <Button
                type="button"
                className="self-end"
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Active PPQ credentials
            </p>
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

          <PpqUsageActivity
            items={wallet.ppqQueryHistory}
            isLoading={wallet.isPpqQueryHistoryLoading}
            error={wallet.ppqQueryHistoryError}
          />
        </TabsContent>
      </Tabs>

      <ReceiveDialog
        wallet={wallet}
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
      />
      <SendDialog wallet={wallet} open={sendOpen} onOpenChange={setSendOpen} />
    </div>
  );
}

function SecretRow({
  label,
  value,
  revealed,
  onToggle,
  revealLabel,
}: {
  label: string;
  value: string | undefined;
  revealed: boolean;
  onToggle: () => void;
  revealLabel?: string;
}) {
  const accessibleLabel = revealLabel ?? label;
  return (
    <div className="rounded-md border bg-muted/25 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggle}
          disabled={!value}
          aria-label={`${revealed ? "Hide" : "Show"} ${accessibleLabel}`}
          className="h-7 px-2"
        >
          {revealed ? (
            <EyeOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Eye className="size-3.5" aria-hidden="true" />
          )}
          {revealed ? "Hide" : "Show"}
        </Button>
      </div>
      <code className="block min-h-7 rounded bg-background px-2 py-1.5 text-xs font-mono break-all">
        {value ? (revealed ? value : maskSecret(value)) : "Not available"}
      </code>
    </div>
  );
}

function PpqUsageActivity({
  items,
  isLoading,
  error,
}: {
  items: UseWalletResult["ppqQueryHistory"];
  isLoading: boolean;
  error: Error | undefined;
}) {
  return (
    <section>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        Recent PPQ usage
      </p>
      {isLoading && !items ? (
        <Skeleton className="h-12 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">
          Could not load PPQ usage: {error.message}
        </p>
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No PPQ usage yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.slice(0, 6).map((item, index) => (
            <li
              key={`${item.timestamp ?? "unknown"}:${item.model ?? "model"}:${index}`}
              className="flex items-start justify-between gap-3 border-b pb-1.5 last:border-b-0 last:pb-0"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {item.model ?? item.query_type ?? "PPQ query"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {tokenSummary(item.input_count, item.output_count)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono">
                  {fmtPreciseMoney(item.price_in_usd)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {fmtHistoryTime(item.timestamp)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function tokenSummary(
  input: number | undefined,
  output: number | undefined,
): string {
  const inputLabel =
    typeof input === "number" && Number.isFinite(input)
      ? `${input.toLocaleString()} in`
      : null;
  const outputLabel =
    typeof output === "number" && Number.isFinite(output)
      ? `${output.toLocaleString()} out`
      : null;
  return [inputLabel, outputLabel].filter(Boolean).join(" · ") || "Usage";
}

function RecentActivity({
  payments,
}: {
  payments: UseWalletResult["payments"];
}) {
  return (
    <section>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        Recent activity
      </p>
      {!payments ? (
        <Skeleton className="h-12 w-full" />
      ) : payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {payments.slice(0, 6).map((p) => {
            const incoming = p.paymentType === "receive";
            const sats = Number(p.amount);
            return (
              <li
                key={p.id}
                className="flex items-baseline justify-between gap-2 border-b last:border-b-0 pb-1.5 last:pb-0"
              >
                <span className="flex items-center gap-2">
                  {incoming ? (
                    <ArrowDownLeft
                      className="h-3.5 w-3.5 text-emerald-600"
                      aria-hidden
                    />
                  ) : (
                    <ArrowUpRight
                      className="h-3.5 w-3.5 text-amber-600"
                      aria-hidden
                    />
                  )}
                  <span className="font-mono">
                    {incoming ? "+" : "−"}
                    {sats.toLocaleString()} sats
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmtTime(p.timestamp)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function maskSecret(value: string): string {
  return "•".repeat(Math.min(Math.max(value.length, 8), 24));
}
