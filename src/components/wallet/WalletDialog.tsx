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
import { WalletPanel, type WalletPanelRegisterProps } from "./WalletPanel";

interface WalletDialogProps {
  wallet: UseWalletResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personaName?: string;
  /** Forwarded to WalletPanel — see its prop docs. */
  registerLightningAddress?: WalletPanelRegisterProps;
}

export function WalletDialog({
  wallet,
  open,
  onOpenChange,
  personaName,
  registerLightningAddress,
}: WalletDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {personaName ? `${personaName}'s wallet` : "Wallet"}
          </DialogTitle>
          <DialogDescription>
            This persona's Spark Lightning wallet. Donations land here; AI
            inference is paid from here automatically.
          </DialogDescription>
        </DialogHeader>
        <WalletPanel
          wallet={wallet}
          registerLightningAddress={registerLightningAddress}
        />
      </DialogContent>
    </Dialog>
  );
}
