/**
 * UnlockGate — gates the app behind the user's NIP-49 passphrase.
 *
 * Mounting decision tree:
 *   1. No `phoenix:user:ncryptsec` stored → render children (BYO user
 *      or first-time visitor; Phoenix has nothing to unlock).
 *   2. ncryptsec stored AND there's already a Nostrify login → render
 *      children. The user already unlocked this tab; refresh-survival
 *      is intentional UX. (Tab-close clears via the beforeunload
 *      handler below — best effort.)
 *   3. ncryptsec stored AND no Nostrify login → render the unlock
 *      modal. After a successful unlock, the decrypted nsec is handed
 *      to Nostrify's standard nsec login flow.
 *
 * Trade-off: during an active session, the unlocked nsec lives in
 * Nostrify's localStorage (under `nostr:login`). When the tab closes
 * we attempt to clear it via `beforeunload`, but that's not reliable
 * on mobile. The "Lock now" affordance in Settings is the real escape
 * hatch — it calls `removeLogin()` and forces a re-unlock without
 * touching the ncryptsec.
 *
 * NOT a defense against XSS — see `nip49Storage.ts` header for the
 * threat-model boundary.
 */

import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { nip19 } from "nostr-tools";
import { useNostrLogin } from "@nostrify/react/login";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginActions } from "@/hooks/useLoginActions";
import {
  clearUserNcryptsec,
  decryptNcryptsec,
  hasUserNcryptsec,
  loadUserNcryptsec,
} from "@/lib/nip49Storage";

interface UnlockGateProps {
  children: React.ReactNode;
}

export function UnlockGate({ children }: UnlockGateProps) {
  const { logins, removeLogin } = useNostrLogin();
  const login = useLoginActions();

  // Snapshot at mount: do we have a Phoenix-managed key parked here?
  // We don't reactively re-read `phoenix:user:ncryptsec` after mount —
  // the only writers are AuthDialog signup (creates) and Settings
  // "Forget device" (clears), both of which trigger a route change
  // anyway.
  const [needsUnlock, setNeedsUnlock] = useState<boolean>(() => {
    return hasUserNcryptsec() && logins.length === 0;
  });

  const [passphrase, setPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort tab-close clear. If the tab is closed while a Phoenix
  // session is active, drop the Nostrify login so the next session
  // starts at the unlock prompt and not at the unlocked dashboard.
  // BYO users (no ncryptsec stored) keep their sessions intact.
  useEffect(() => {
    function onBeforeUnload() {
      if (!hasUserNcryptsec()) return;
      const current = logins[0];
      if (current && current.type === "nsec") {
        try {
          removeLogin(current.id);
        } catch {
          // best effort
        }
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [logins, removeLogin]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase) return;
    setUnlocking(true);
    setError(null);

    // Yield to the event loop so the spinner paints before scrypt
    // grabs the main thread for several hundred ms.
    await new Promise((r) => setTimeout(r, 0));

    try {
      const ncryptsec = loadUserNcryptsec();
      if (!ncryptsec) {
        // Edge case: storage was cleared between mount and submit.
        setNeedsUnlock(false);
        return;
      }
      const skBytes = decryptNcryptsec(ncryptsec, passphrase);
      const nsec = nip19.nsecEncode(skBytes);
      login.nsec(nsec);
      setPassphrase("");
      setNeedsUnlock(false);
    } catch {
      setError("Incorrect passphrase. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  function handleForgetDevice() {
    const ok = window.confirm(
      "Forget this device? You'll need your nsec backup to use Feniksi on this browser again. Personas survive — they're stored on relays."
    );
    if (!ok) return;
    clearUserNcryptsec();
    setNeedsUnlock(false);
  }

  if (!needsUnlock) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-xl space-y-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Lock className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-display text-2xl font-medium tracking-tight">
              Unlock Feniksi
            </h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Enter the passphrase you set when you created this user
            account. It decrypts your Nostr key for this browser session.
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unlock-passphrase">Passphrase</Label>
            <Input
              id="unlock-passphrase"
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="current-password"
              disabled={unlocking}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={!passphrase || unlocking}
            className="w-full"
          >
            {unlocking ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Unlocking…
              </>
            ) : (
              "Unlock"
            )}
          </Button>
        </form>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={handleForgetDevice}
            disabled={unlocking}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Forget this device
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnlockGate;
