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
  personaName?: string;
  /** Forwarded to WalletPanel — see its prop docs. */
  editPersonaHref?: string;
  onAutoTopupSave?: (config: AutoTopupConfig) => void | Promise<void>;
}

export function WalletDialog({
  wallet,
  open,
  onOpenChange,
  personaName,
  editPersonaHref,
  onAutoTopupSave,
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
          editPersonaHref={editPersonaHref}
          onAutoTopupSave={onAutoTopupSave}
        />
      </DialogContent>
    </Dialog>
  );
}
