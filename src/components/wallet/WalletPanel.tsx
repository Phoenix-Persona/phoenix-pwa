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
  ChevronDown,
  ChevronUp,
  Copy,
  QrCode,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import type { UseWalletResult } from "@/hooks/useWallet";
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
}

function fmtSats(n: number | undefined): string {
  if (typeof n !== "number") return "—";
  return `${n.toLocaleString("en-US")} sats`;
}

function fmtMoney(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtTime(ts: number | undefined): string {
  if (typeof ts !== "number") return "";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

export function WalletPanel({ wallet, editPersonaHref }: WalletPanelProps) {
  const { toast } = useToast();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [showLnurl, setShowLnurl] = useState(false);

  const balanceSats = wallet.info?.balanceSats;
  const lightningAddress = wallet.info?.lightningAddress;
  const lnurlPay = wallet.info?.lnurlPay;

  function copyAddress() {
    if (!lightningAddress) return;
    navigator.clipboard.writeText(lightningAddress);
    toast({ title: "Lightning Address copied" });
  }

  function copyLnurl() {
    if (!lnurlPay) return;
    navigator.clipboard.writeText(lnurlPay);
    toast({ title: "LNURL copied" });
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
            {lnurlPay ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowLnurl((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                  {showLnurl ? "Hide LNURL string" : "Show LNURL string"}
                  {showLnurl ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
                {showLnurl ? (
                  <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="flex-1 min-w-0 text-[10px] font-mono bg-background px-2 py-1 rounded truncate">
                        {lnurlPay}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={copyLnurl}
                        aria-label="Copy LNURL"
                        className="shrink-0"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Paste this bech32 string into any wallet that supports
                      LNURL-pay — same destination as the QR and Lightning
                      Address above.
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}
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

      {/* PPQ credits + auto-topup */}
      <section>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          AI credits (PPQ)
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg">
            {wallet.isPpqBalanceLoading && wallet.ppqBalanceUsd === undefined ? (
              <Skeleton className="h-6 w-16 inline-block" />
            ) : (
              fmtMoney(wallet.ppqBalanceUsd)
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {wallet.autoTopup.enabled
              ? `auto-topup at $${wallet.autoTopup.thresholdUsd} → $${wallet.autoTopup.targetUsd}`
              : "auto-topup off"}
          </p>
        </div>
        {wallet.autoTopupRun.lastError ? (
          <p className="text-xs text-destructive mt-1">
            Auto-topup error: {wallet.autoTopupRun.lastError.message}
          </p>
        ) : null}
      </section>

      {/* Recent payments */}
      <section>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Recent activity
        </p>
        {!wallet.payments ? (
          <Skeleton className="h-12 w-full" />
        ) : wallet.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payments yet.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {wallet.payments.slice(0, 6).map((p) => {
              const incoming = p.paymentType === "receive";
              const sats = Number(p.amount);
              return (
                <li
                  key={p.id}
                  className="flex items-baseline justify-between gap-2 border-b last:border-b-0 pb-1.5 last:pb-0"
                >
                  <span className="flex items-center gap-2">
                    {incoming ? (
                      <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 text-amber-600" aria-hidden />
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

      <ReceiveDialog
        wallet={wallet}
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
      />
      <SendDialog wallet={wallet} open={sendOpen} onOpenChange={setSendOpen} />
    </div>
  );
}
