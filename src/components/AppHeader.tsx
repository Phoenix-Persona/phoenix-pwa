import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Zap } from "lucide-react";

import { FlagStripe } from "@/components/ImigongoBand";
import { LoginArea } from "@/components/auth/LoginArea";
import { WalletBadge } from "@/components/wallet/WalletBadge";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOperatorWallet } from "@/hooks/useOperatorWallet";
import { useToast } from "@/hooks/useToast";

export function AppHeader() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const isLoggedIn = Boolean(user);
  const [walletOpen, setWalletOpen] = useState(false);
  const operatorWallet = useOperatorWallet();
  const operator = operatorWallet.operator;

  // The operator envelope is auto-minted by `<OperatorWalletInit />` on
  // first login, but that path can miss (slow relay, signer race, a
  // transient mint failure). Surface a manual fallback so a logged-in
  // user is never stuck without a wallet AND has no way to recover.
  // When `mintError` is set, the CTA goes destructive so the user knows
  // the auto-mint already tried and failed.
  async function setupWallet() {
    try {
      await operator.mint(undefined);
      toast({
        title: "Wallet ready",
        description: "Operator wallet provisioned.",
      });
    } catch (err) {
      toast({
        title: "Wallet setup failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }
  const showSetupCta =
    isLoggedIn && !operatorWallet.seed && !operator.isLoading;
  const setupFailed = Boolean(operator.mintError);

  return (
    <header className="relative bg-card/85 backdrop-blur-md sticky top-safe z-30 border-b border-imigongo-clay/15">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-imigongo-charcoal focus:text-imigongo-cream focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <div className="container flex items-center justify-between gap-3 py-4">
        <Link
          to="/"
          className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          aria-label="Zuka home"
        >
          <span className="relative">
            <span className="absolute -inset-1 rounded-xl bg-rw-gold/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
            <img
              src="/icon.svg"
              alt=""
              width={36}
              height={36}
              className="relative rounded-lg shadow-sm group-hover:scale-105 transition-transform"
            />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-display font-semibold text-xl tracking-tight">
              Zuka
            </span>
            <span className="hidden sm:inline text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Uncensorable voices
            </span>
          </div>
        </Link>

        {/* Desktop nav — persona-management links only when signed in. */}
        {isLoggedIn && (
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <Link
              to="/my-personas"
              className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:text-foreground"
            >
              My personas
            </Link>
            <Link
              to="/onboard"
              className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:text-foreground"
            >
              New persona
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {isLoggedIn && operatorWallet.seed ? (
            <WalletBadge
              wallet={operatorWallet.wallet}
              onClick={() => setWalletOpen(true)}
            />
          ) : showSetupCta ? (
            <Button
              variant={setupFailed ? "destructive" : "outline"}
              size="sm"
              onClick={setupWallet}
              disabled={operator.isMinting}
              aria-label={
                setupFailed
                  ? "Retry operator wallet setup"
                  : "Set up operator wallet"
              }
            >
              {operator.isMinting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden />
                  Setting up…
                </>
              ) : setupFailed ? (
                <>
                  <Zap className="h-4 w-4 mr-1" aria-hidden />
                  Wallet setup failed — retry
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-1 text-rw-gold" aria-hidden />
                  Set up wallet
                </>
              )}
            </Button>
          ) : null}
          <LoginArea className="max-w-60" />
        </div>
      </div>

      {/* Rwandan-flag accent stripe */}
      <FlagStripe height={3} />

      {operatorWallet.seed ? (
        <WalletDialog
          wallet={operatorWallet.wallet}
          walletScope="operator"
          open={walletOpen}
          onOpenChange={setWalletOpen}
          personaName="Operator"
        />
      ) : null}
    </header>
  );
}
