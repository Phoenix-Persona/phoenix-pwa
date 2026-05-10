/**
 * InstallBanner — a soft prompt to install Zuka as a PWA.
 *
 * Visibility rules:
 *   - The browser must have fired `beforeinstallprompt` (canInstall).
 *   - The app must not already be running as an installed PWA.
 *   - The user must not have dismissed the banner within the last 30
 *     days.
 *   - The user must be signed in. The first-load experience for a
 *     casual visitor stays banner-free; we only ask people who've
 *     actually engaged.
 *
 * Renders bottom-right on desktop, full-width pinned to the bottom
 * on mobile. Dismissable, non-blocking — it slides over content but
 * never gates UX.
 */

import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export function InstallBanner() {
  const { user } = useCurrentUser();
  const { canInstall, install, dismiss, dismissedAt } = useInstallPrompt();

  // Gate visibility:
  //   - signed in only (engaged user)
  //   - browser actually offered install
  //   - not in the 30-day cooldown after a dismissal
  if (!user) return null;
  if (!canInstall) return null;
  if (dismissedAt) return null;

  return (
    <div
      role="region"
      aria-label="Install Zuka"
      className="fixed bottom-4 right-4 z-40 max-w-sm w-[calc(100%-2rem)] sm:w-auto pointer-events-none"
    >
      <div className="pointer-events-auto rounded-2xl border border-imigongo-clay/20 bg-card shadow-2xl shadow-black/20 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-5 py-3 border-b border-imigongo-clay/15 flex items-center justify-between gap-2">
          <p className="font-display text-base font-medium tracking-tight">
            Install Zuka
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="size-7 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Add Zuka to your home screen for quicker access and
            offline reading. No accounts, no tracking — same app, just
            faster to launch.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Not now
            </Button>
            <Button size="sm" onClick={install}>
              <Download className="mr-2 size-4" aria-hidden="true" />
              Install
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
