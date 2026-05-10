import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, Settings as SettingsIcon } from "lucide-react";

import { FlagStripe } from "@/components/ImigongoBand";
import { LoginArea } from "@/components/auth/LoginArea";
import { WalletBadge } from "@/components/wallet/WalletBadge";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOperatorWallet } from "@/hooks/useOperatorWallet";

export function AppHeader() {
  const { user } = useCurrentUser();
  const isLoggedIn = Boolean(user);
  const [walletOpen, setWalletOpen] = useState(false);
  const operatorWallet = useOperatorWallet(walletOpen);

  return (
    <header className="relative bg-card/85 backdrop-blur-md sticky top-0 z-30 border-b border-imigongo-clay/15">
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
          ) : null}
          <LoginArea className="max-w-60" />

          {/* Mobile menu trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="font-display text-2xl">Zuka</SheetTitle>
              </SheetHeader>
              <nav className="px-4 pb-6 flex flex-col gap-1 text-base font-medium">
                {isLoggedIn && (
                  <>
                    <SheetClose asChild>
                      <Link
                        to="/my-personas"
                        className="rounded-lg px-3 py-3 hover:bg-muted transition-colors"
                      >
                        My personas
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        to="/onboard"
                        className="rounded-lg px-3 py-3 hover:bg-muted transition-colors"
                      >
                        New persona
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        to="/settings"
                        className="rounded-lg px-3 py-3 hover:bg-muted transition-colors flex items-center gap-2"
                      >
                        <SettingsIcon className="size-4" />
                        Settings
                      </Link>
                    </SheetClose>
                    <div className="my-2 border-t border-border" />
                  </>
                )}
                <SheetClose asChild>
                  <Link
                    to="/"
                    className="rounded-lg px-3 py-3 text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Home
                  </Link>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Rwandan-flag accent stripe */}
      <FlagStripe height={3} />

      {operatorWallet.seed ? (
        <WalletDialog
          wallet={operatorWallet.wallet}
          open={walletOpen}
          onOpenChange={setWalletOpen}
          personaName="Operator"
        />
      ) : null}
    </header>
  );
}
