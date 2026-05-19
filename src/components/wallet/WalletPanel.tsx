/**
 * Reusable wallet panel — used inside WalletDialog (Dashboard) and
 * directly in the /dev/wallet harness. Reads everything from the
 * `useWallet` result passed in as `wallet`.
 *
 * Sections:
 *   - Balance (sats + USD where available)
 *   - Lightning Address for persona wallets (copy + LNURL/QR toggle)
 *   - Receive / Send buttons (open child dialogs)
 *   - PPQ credits + auto-topup state
 *   - Recent payments
 *
 * Lightning Address registration lives on the EditPersona page —
 * changing it requires re-publishing kind 0 and the encrypted backup,
 * so the wallet panel only renders the read-only address (or a hint
 * pointing at the edit page when missing).
 */

import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/useToast";
import type { UseWalletResult } from "@/hooks/useWallet";
import type { AutoTopupConfig } from "@/lib/wallet/types";
import { OperatorWalletView } from "./OperatorWalletView";
import { PersonaWalletView } from "./PersonaWalletView";
import { PpqFundingSection } from "./PpqFundingSection";
import { ReceiveDialog } from "./ReceiveDialog";
import { SendDialog } from "./SendDialog";
import type { OperatorWalletDiagnostics } from "./WalletPanelSections";

interface WalletPanelProps {
  wallet: UseWalletResult;
  walletScope?: "persona" | "operator";
  operatorDiagnostics?: OperatorWalletDiagnostics;
  /**
   * When provided AND the wallet has no Lightning Address registered,
   * the missing-address state renders a hint linking here so the user
   * can claim a username from the persona profile editor. Omitted in
   * the dev harness (no persona context).
   */
  editPersonaHref?: string;
  onAutoTopupSave?: (config: AutoTopupConfig) => void | Promise<void>;
}

export type { OperatorWalletDiagnostics } from "./WalletPanelSections";

export function WalletPanel({
  wallet,
  walletScope = "persona",
  operatorDiagnostics,
  editPersonaHref,
  onAutoTopupSave,
}: WalletPanelProps) {
  const { toast } = useToast();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const lightningAddress = wallet.info?.lightningAddress;

  function copyAddress() {
    if (!lightningAddress) return;
    navigator.clipboard.writeText(lightningAddress);
    toast({ title: "Lightning Address copied" });
  }

  if (!wallet.handle) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        {wallet.isConnecting ? (
          <>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : wallet.connectError ? (
          <p className="text-destructive">
            Wallet failed to connect: {wallet.connectError.message}
          </p>
        ) : (
          <p>No wallet seed available. Create a new persona to get a wallet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="lightning" className="gap-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lightning">Lightning</TabsTrigger>
          <TabsTrigger value="ppq">AI Credits</TabsTrigger>
        </TabsList>

        <TabsContent value="lightning" className="mt-0 space-y-5">
          {walletScope === "operator" ? (
            <OperatorWalletView
              wallet={wallet}
              onReceive={() => setReceiveOpen(true)}
              onSend={() => setSendOpen(true)}
            />
          ) : (
            <PersonaWalletView
              wallet={wallet}
              editPersonaHref={editPersonaHref}
              onReceive={() => setReceiveOpen(true)}
              onSend={() => setSendOpen(true)}
              onCopyLightningAddress={copyAddress}
            />
          )}
        </TabsContent>

        <TabsContent value="ppq" className="mt-0 space-y-3">
          <PpqFundingSection
            wallet={wallet}
            walletScope={walletScope}
            onAutoTopupSave={onAutoTopupSave}
          />
        </TabsContent>
      </Tabs>

      <ReceiveDialog
        wallet={wallet}
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
      />
      <SendDialog wallet={wallet} open={sendOpen} onOpenChange={setSendOpen} />
    </div>
  );
}
