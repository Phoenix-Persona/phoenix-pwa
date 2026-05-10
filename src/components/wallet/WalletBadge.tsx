/**
 * Inline balance chip for the Dashboard header. Click toggles the
 * full WalletDialog. Renders a skeleton while the wallet is connecting
 * or initial balance is loading.
 */

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { UseWalletResult } from "@/hooks/useWallet";

interface WalletBadgeProps {
  wallet: UseWalletResult;
  onClick?: () => void;
}

function fmtSats(n: number): string {
  return n.toLocaleString("en-US");
}

export function WalletBadge({ wallet, onClick }: WalletBadgeProps) {
  if (wallet.isConnecting || (wallet.handle && wallet.isInfoLoading && !wallet.info)) {
    return <Skeleton className="h-9 w-28" />;
  }
  if (!wallet.handle) {
    // Inactive state — the wallet hook lazy-connects when the dialog opens
    // (`useOperatorWallet(walletOpen)`), so the badge MUST stay clickable
    // here. Clicking flips walletOpen → enables the hook → connect kicks off.
    return (
      <Button variant="outline" size="sm" onClick={onClick}>
        <Zap className="h-4 w-4 mr-1" /> Wallet
      </Button>
    );
  }
  const sats = wallet.info?.balanceSats ?? 0;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label={`Wallet: ${fmtSats(sats)} sats — open wallet panel`}
    >
      <Zap className="h-4 w-4 mr-1 text-rw-gold" aria-hidden />
      {fmtSats(sats)} sats
    </Button>
  );
}
