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
import { Textarea } from "@/components/ui/textarea";
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send sats</DialogTitle>
          <DialogDescription>
            Paste a BOLT11 invoice. The persona's Spark wallet will pay it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invoice">BOLT11 invoice</Label>
            <Textarea
              id="invoice"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="lnbc..."
              rows={4}
              className="font-mono text-xs"
            />
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
