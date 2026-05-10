/**
 * Send — paste a BOLT11 invoice and pay it from this persona's wallet.
 * Used for manual top-ups out (e.g., to fund another persona) or for
 * settling external invoices the persona owes.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

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
import { useToast } from "@/hooks/useToast";
import type { UseWalletResult } from "@/hooks/useWallet";

interface SendDialogProps {
  wallet: UseWalletResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendDialog({ wallet, open, onOpenChange }: SendDialogProps) {
  const { toast } = useToast();
  const [invoice, setInvoice] = useState("");

  async function pay() {
    const trimmed = invoice.trim();
    if (!trimmed) {
      toast({
        title: "Paste an invoice",
        description: "We need a BOLT11 invoice to pay.",
        variant: "destructive",
      });
      return;
    }
    try {
      await wallet.send({ paymentRequest: trimmed });
      toast({ title: "Payment sent" });
      setInvoice("");
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Payment failed",
        description: e instanceof Error ? e.message : "unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send sats</DialogTitle>
          <DialogDescription>
            Paste a BOLT11 invoice. The persona's Spark wallet will pay it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          <div className="space-y-2 min-w-0">
            <Label htmlFor="invoice">BOLT11 invoice</Label>
            {/* Single-line Input avoids the textarea field-sizing-content
                growth that breaks layout on narrow viewports when a long
                BOLT11 string is pasted. The input scrolls horizontally
                on focus instead of expanding the dialog. */}
            <Input
              id="invoice"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="lnbc..."
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs w-full"
            />
            {invoice ? (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {invoice.trim().length} chars
              </p>
            ) : null}
          </div>
          <Button
            onClick={pay}
            disabled={wallet.isSending || !invoice.trim()}
            className="w-full"
          >
            {wallet.isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Paying…
              </>
            ) : (
              "Pay invoice"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
