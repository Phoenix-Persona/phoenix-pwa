/**
 * Reusable wallet panel — used inside WalletDialog (Dashboard) and
 * directly in the /dev/wallet harness. Reads everything from the
 * `useWallet` result passed in as `wallet`.
 *
 * Sections:
 *   - Balance (sats + USD where available)
 *   - Lightning Address (copy)
 *   - Receive / Send buttons (open child dialogs)
 *   - PPQ credits + auto-topup state
 *   - Recent payments
 */

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  QrCode,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import {
  isValidLightningUsername,
  slugifyForUsername,
} from "@/lib/wallet/lightningAddress";
import type { UseWalletResult } from "@/hooks/useWallet";
import { ReceiveDialog } from "./ReceiveDialog";
import { SendDialog } from "./SendDialog";

export interface WalletPanelRegisterProps {
  /** Callback invoked when the user submits a username to register. */
  onSubmit: (baseUsername: string) => void;
  /** Truthy while the registration mutation is in flight. */
  isPending: boolean;
  /** Default value seeded into the username input. */
  suggestedUsername?: string;
}

interface WalletPanelProps {
  wallet: UseWalletResult;
  /**
   * When provided, render an inline "Register Lightning Address" form
   * in place of the "Not registered yet" message. Used by Dashboard
   * for backfilling pre-existing personas.
   */
  registerLightningAddress?: WalletPanelRegisterProps;
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

export function WalletPanel({ wallet, registerLightningAddress }: WalletPanelProps) {
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
          <p>No wallet seed available. Mint a new persona to get a wallet.</p>
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

      {/* Lightning Address + static LNURL */}
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Lightning Address
        </p>
        {lightningAddress ? (
          <>
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
                  {showLnurl ? "Hide LNURL / QR" : "Show LNURL / QR"}
                  {showLnurl ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
                {showLnurl ? (
                  <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex justify-center">
                      <div className="rounded bg-white p-2">
                        <QRCodeCanvas value={lnurlPay} size={192} />
                      </div>
                    </div>
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
                      Scan the QR or paste the bech32 LNURL into any wallet
                      that supports LNURL-pay — same destination as the
                      Lightning Address above.
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : registerLightningAddress ? (
          <RegisterAddressForm {...registerLightningAddress} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Not registered yet. Use Receive to generate an invoice instead.
          </p>
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

function RegisterAddressForm({
  onSubmit,
  isPending,
  suggestedUsername,
}: WalletPanelRegisterProps) {
  const [username, setUsername] = useState(
    suggestedUsername ? slugifyForUsername(suggestedUsername) : "",
  );

  function onChange(next: string) {
    setUsername(next.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  function submit() {
    if (!isValidLightningUsername(username)) return;
    onSubmit(username);
  }

  const valid = isValidLightningUsername(username);

  return (
    <div className="space-y-2 rounded-md border border-dashed border-imigongo-clay/30 bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        This persona doesn't have a Lightning Address yet. Pick a username and
        register one on <code className="font-mono">spark.money</code>.
      </p>
      <div className="flex items-center gap-1.5 min-w-0">
        <Input
          value={username}
          onChange={(e) => onChange(e.target.value)}
          placeholder="username"
          className="font-mono text-sm flex-1 min-w-0"
          autoComplete="off"
          spellCheck={false}
          disabled={isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !isPending) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          @spark.money
        </span>
      </div>
      <Button
        onClick={submit}
        disabled={!valid || isPending}
        size="sm"
        className="w-full"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            Registering…
          </>
        ) : (
          "Register Lightning Address"
        )}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        If the username is taken, we'll add a 4-character suffix. The persona's
        Nostr profile is updated automatically.
      </p>
    </div>
  );
}
