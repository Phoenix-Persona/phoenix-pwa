/**
 * Inline balance chip. Click toggles the full WalletDialog. Renders a
 * skeleton while the wallet is connecting or the initial balance is
 * loading.
 *
 * `inverse` switches the colour vocabulary so the chip remains legible
 * when placed on a dark hero mat (Dashboard's persona header).
 */

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { UseWalletResult } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtSats } from "./WalletPanelFormat";

interface WalletBadgeProps {
  wallet: UseWalletResult;
  onClick?: () => void;
  /** Render with cream-on-charcoal styling for placement on dark backgrounds. */
  inverse?: boolean;
}

const INVERSE_CLASS =
  "rounded-full border-imigongo-cream/30 text-imigongo-cream bg-transparent hover:bg-imigongo-cream/10 hover:text-imigongo-cream";

export function WalletBadge({ wallet, onClick, inverse = false }: WalletBadgeProps) {
  if (wallet.isConnecting || (wallet.handle && wallet.isInfoLoading && !wallet.info)) {
    return <Skeleton className={cn("h-9 w-28", inverse && "bg-imigongo-cream/15")} />;
  }
  if (!wallet.handle) {
    // Inactive state — no SDK handle yet (initial render before
    // connect resolves, or no seed configured). Render an enabled CTA
    // so the user can always click through to the wallet dialog.
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        aria-label="Open wallet"
        className={cn(inverse && INVERSE_CLASS)}
      >
        <Zap className="h-4 w-4 mr-1 text-rw-gold" aria-hidden /> Wallet
      </Button>
    );
  }
  const sats = wallet.info?.balanceSats ?? 0;
  const aiCredits = Number.isFinite(wallet.ppqBalanceUsd)
    ? fmtMoney(wallet.ppqBalanceUsd)
    : undefined;
  const balanceLabel = aiCredits
    ? `${fmtSats(sats)}, ${aiCredits} AI credits`
    : fmtSats(sats);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label={`Wallet: ${balanceLabel} — open wallet panel`}
      className={cn(inverse && INVERSE_CLASS)}
    >
      <Zap className="h-4 w-4 mr-1 text-rw-gold" aria-hidden />
      {fmtSats(sats)}
      {aiCredits ? (
        <span className="ml-1 text-muted-foreground">· {aiCredits} AI</span>
      ) : null}
    </Button>
  );
}
