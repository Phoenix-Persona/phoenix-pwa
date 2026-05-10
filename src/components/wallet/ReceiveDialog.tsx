/**
 * Receive — generate a BOLT11 invoice the user can pay from any
 * Lightning wallet. Shows the QR + raw invoice. The wallet hook's
 * 15-second balance refresh is what closes the loop; this dialog
 * doesn't poll separately.
 */

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";

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

export function ReceiveDialog({ wallet, open, onOpenChange }: ReceiveDialogProps) {
  const { toast } = useToast();
  const [amountStr, setAmountStr] = useState("5000");
  const [memo, setMemo] = useState("Phoenix top-up");
  const [invoice, setInvoice] = useState<string | null>(null);

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
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
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
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <QRCodeCanvas value={invoice} size={256} />
            </div>
            <div className="space-y-2">
              <Label>BOLT11 invoice</Label>
              <div className="flex gap-2">
                <Input value={invoice} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copy} aria-label="Copy invoice">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Balance updates within ~15 seconds of payment.
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
