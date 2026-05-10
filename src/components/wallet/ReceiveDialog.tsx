/**
 * Receive — generate a BOLT11 invoice the user can pay from any
 * Lightning wallet. Shows the QR + raw invoice. While the invoice is
 * displayed the dialog subscribes to the SDK's event stream and
 * dismisses itself once the matching `paymentSucceeded` event lands —
 * the user gets a brief "received" confirmation, then the modal closes.
 */

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { useToast } from "@/hooks/useToast";
import type { UseWalletResult } from "@/hooks/useWallet";

interface ReceiveDialogProps {
  wallet: UseWalletResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RECEIVED_AUTO_CLOSE_MS = 1800;

export function ReceiveDialog({ wallet, open, onOpenChange }: ReceiveDialogProps) {
  const { toast } = useToast();
  const [amountStr, setAmountStr] = useState("5000");
  const [memo, setMemo] = useState("Phoenix top-up");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [received, setReceived] = useState(false);

  async function generate() {
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a positive number of sats.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await wallet.receive({ amountSats: amount, description: memo });
      setInvoice(res.paymentRequest);
      setReceived(false);
    } catch (e) {
      toast({
        title: "Could not generate invoice",
        description: e instanceof Error ? e.message : "unknown error",
        variant: "destructive",
      });
    }
  }

  function copy() {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice);
    toast({ title: "Invoice copied" });
  }

  function reset() {
    setInvoice(null);
    setReceived(false);
  }

  // Subscribe to SDK events while an invoice is on screen. When a
  // `paymentSucceeded` event fires for the BOLT11 string we generated,
  // refresh balances, flip to a success state, and auto-dismiss the
  // dialog after a short delay so the user sees the confirmation.
  const handle = wallet.handle;
  useEffect(() => {
    if (!handle || !invoice || !open) return;

    let listenerId: string | undefined;
    let cancelled = false;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    void handle
      .addEventListener({
        onEvent: (event) => {
          if (cancelled) return;
          if (event.type !== "paymentSucceeded") return;
          const p = event.payment;
          if (p.paymentType !== "receive") return;
          // Match by BOLT11 string — the SDK echoes the same paymentRequest
          // back inside `details.invoice` for lightning receive payments.
          const matched =
            p.details?.type === "lightning" && p.details.invoice === invoice;
          if (!matched) return;

          setReceived(true);
          wallet.refreshInfo();
          wallet.refreshPayments();
          closeTimer = setTimeout(() => {
            if (cancelled) return;
            onOpenChange(false);
            reset();
          }, RECEIVED_AUTO_CLOSE_MS);
        },
      })
      .then((id) => {
        if (cancelled) {
          void handle.removeEventListener(id).catch(() => undefined);
          return;
        }
        listenerId = id;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (closeTimer) clearTimeout(closeTimer);
      if (listenerId) {
        void handle.removeEventListener(listenerId).catch(() => undefined);
      }
    };
  }, [handle, invoice, open, onOpenChange, wallet]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive sats</DialogTitle>
          <DialogDescription>
            Generate a BOLT11 invoice. Pay it from any Lightning wallet to fund
            this persona.
          </DialogDescription>
        </DialogHeader>

        {!invoice ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (sats)</Label>
              <Input
                id="amount"
                type="number"
                min={1}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">Memo</Label>
              <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
            <Button
              onClick={generate}
              disabled={wallet.isReceiving}
              className="w-full"
            >
              {wallet.isReceiving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate invoice"
              )}
            </Button>
          </div>
        ) : received ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-2 ring-emerald-500/30">
              <Check className="h-8 w-8" aria-hidden="true" />
            </div>
            <p className="text-lg font-semibold">Payment received</p>
            <p className="text-sm text-muted-foreground">
              Balance updated. Closing…
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <QRCodeCanvas value={invoice} size={256} />
            </div>
            <div className="space-y-2 min-w-0">
              <Label>BOLT11 invoice</Label>
              <div className="flex gap-2 min-w-0">
                <Input
                  value={invoice}
                  readOnly
                  className="font-mono text-xs flex-1 min-w-0"
                />
                <Button variant="outline" size="icon" onClick={copy} aria-label="Copy invoice" className="shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Waiting for payment… this dialog closes automatically once the
                wallet confirms.
              </p>
            </div>
            <Button variant="outline" onClick={reset} className="w-full">
              Generate another
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
