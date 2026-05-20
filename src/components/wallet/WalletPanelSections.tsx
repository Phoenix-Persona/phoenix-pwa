import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { Skeleton } from "@/components/ui/skeleton";
import type { UseWalletResult } from "@/hooks/useWallet";
import { fmtPreciseMoney } from "./WalletPanelFormat";

export interface OperatorWalletDiagnostics {
  hasEnvelopeEvent: boolean;
  hasWalletBackup: boolean;
  hasPpqBackup: boolean;
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

export function OperatorBackupStatus({
  diagnostics,
}: {
  diagnostics: OperatorWalletDiagnostics;
}) {
  const rows = [
    {
      label: diagnostics.hasEnvelopeEvent
        ? "Backup event found"
        : "Backup event missing",
      ok: diagnostics.hasEnvelopeEvent,
    },
    {
      label: diagnostics.hasWalletBackup
        ? "Wallet seed backed up"
        : "Wallet seed not backed up",
      ok: diagnostics.hasWalletBackup,
    },
    {
      label: diagnostics.hasPpqBackup
        ? "AI credentials backed up"
        : "AI credentials not backed up",
      ok: diagnostics.hasPpqBackup,
    },
  ];

  return (
    <section className="space-y-2 rounded-md border bg-muted/20 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Operator backup status
      </p>
      <ul className="space-y-1.5 text-sm">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-2">
            <span>{row.label}</span>
            <span
              className={
                row.ok
                  ? "text-xs font-medium text-emerald-700 dark:text-emerald-400"
                  : "text-xs font-medium text-amber-700 dark:text-amber-400"
              }
            >
              {row.ok ? "OK" : "Check"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LightningAddressSection({
  lightningAddress,
  lnurlPay,
  editPersonaHref,
  onCopy,
}: {
  lightningAddress: string | undefined;
  lnurlPay: string | undefined;
  editPersonaHref: string | undefined;
  onCopy: () => void;
}) {
  return (
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
              onClick={onCopy}
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
  );
}

export function SecretRow({
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

export function PpqUsageActivity({
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

export function RecentActivity({
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

function maskSecret(value: string): string {
  return "•".repeat(Math.min(Math.max(value.length, 8), 24));
}
