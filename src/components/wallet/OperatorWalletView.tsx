import { ArrowDownLeft, ArrowUpRight, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { UseWalletResult } from "@/hooks/useWallet";
import { fmtSats } from "./WalletPanelFormat";
import { RecentActivity } from "./WalletPanelSections";

interface OperatorWalletViewProps {
  wallet: UseWalletResult;
  onReceive: () => void;
  onSend: () => void;
}

export function OperatorWalletView({
  wallet,
  onReceive,
  onSend,
}: OperatorWalletViewProps) {
  const balanceSats = wallet.info?.balanceSats;

  return (
    <>
      <section>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Balance
        </p>
        <p className="text-2xl font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-rw-gold" aria-hidden />
          {wallet.isInfoLoading && balanceSats === undefined ? (
            <Skeleton className="h-7 w-28 inline-block" />
          ) : (
            fmtSats(balanceSats)
          )}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onReceive} className="justify-start">
          <ArrowDownLeft className="h-4 w-4 mr-2" />
          Deposit
        </Button>
        <Button variant="outline" onClick={onSend} className="justify-start">
          <ArrowUpRight className="h-4 w-4 mr-2" />
          Withdraw
        </Button>
      </section>

      <RecentActivity payments={wallet.payments} />
    </>
  );
}
