/**
 * Modal wrapper around <WalletPanel> for use in the Dashboard. The
 * panel itself is reused un-wrapped in the /dev/wallet harness.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { UseWalletResult } from "@/hooks/useWallet";
import type { AutoTopupConfig } from "@/lib/wallet/types";
import { WalletPanel } from "./WalletPanel";

interface WalletDialogProps {
  wallet: UseWalletResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletScope?: "persona" | "operator";
  personaName?: string;
  /** Forwarded to WalletPanel — see its prop docs. */
  editPersonaHref?: string;
  onAutoTopupSave?: (config: AutoTopupConfig) => void | Promise<void>;
}

export function WalletDialog({
  wallet,
  open,
  onOpenChange,
  walletScope = "persona",
  personaName,
  editPersonaHref,
  onAutoTopupSave,
}: WalletDialogProps) {
  const description =
    walletScope === "operator"
      ? "Operator Spark Lightning wallet. Use it to fund AI credits and send or receive sats."
      : "This persona's Spark Lightning wallet. Donations land here; AI inference is paid from here automatically.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[min(90vh,760px)] max-w-lg grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {personaName ? `${personaName}'s wallet` : "Wallet"}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div
          data-testid="wallet-dialog-body"
          className="min-h-0 overflow-y-auto pr-1"
        >
          <WalletPanel
            wallet={wallet}
            walletScope={walletScope}
            editPersonaHref={editPersonaHref}
            onAutoTopupSave={onAutoTopupSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
