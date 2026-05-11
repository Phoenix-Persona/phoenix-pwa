/**
 * UnlockGate — gates the app behind the user's NIP-49 passphrase.
 *
 * The encrypted-session boundary works as a two-step coordination with
 * `main.tsx`:
 *
 *   1. `main.tsx` runs `clearStaleNostrLoginIfLocked()` BEFORE React
 *      boots. If a `zuka:user:ncryptsec` is parked, it clears
 *      `nostr:login` from localStorage so Nostrify hydrates with
 *      empty logins.
 *   2. `<UnlockGate>` renders the unlock modal whenever
 *      `hasUserNcryptsec()` AND `logins.length === 0`. After a
 *      successful unlock, it sets the session flag for the live tab.
 *
 * Refresh/new tab = no persisted active nsec = re-prompt.
 *
 * The previous design relied on a `beforeunload` handler to clear
 * `nostr:login` on tab close — that doesn't work reliably (mobile
 * Safari skips it; React state effects don't flush before unload).
 * The pre-render hook is a strict improvement.
 *
 * NOT a defense against XSS — see `nip49Storage.ts` header for the
 * threat-model boundary.
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { nip19 } from "nostr-tools";
import { useNostrLogin } from "@nostrify/react/login";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginActions } from "@/hooks/useLoginActions";
import {
  clearPersistedNostrLogin,
  decryptNcryptsec,
  hasUserNcryptsec,
  loadUserNcryptsec,
  markSessionUnlocked,
} from "@/lib/nip49Storage";
import { clearOperatorDeviceSecrets } from "@/lib/operatorSessionState";

interface UnlockGateProps {
  children: React.ReactNode;
}

export function UnlockGate({ children }: UnlockGateProps) {
  const { logins } = useNostrLogin();
  const login = useLoginActions();
  const queryClient = useQueryClient();

  // Reactive — recomputed every render from current logins state.
  // When Settings → Lock now removes the login, this flips true on
  // the next render and the modal appears OVER whatever route is
  // mounted (children stay rendered underneath, see below). When
  // the user unlocks, login.nsec(...) repopulates logins → flips
  // back to false → modal hides without remounting children.
  //
  // hasUserNcryptsec() is a localStorage read; cheap, but we still
  // only re-render this component when `logins` changes (it has no
  // other reactive dependencies), so this isn't a hot path.
  const needsUnlock = hasUserNcryptsec() && logins.length === 0;

  const [passphrase, setPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasUserNcryptsec() || logins.length === 0) return;
    clearPersistedNostrLogin();
    const id = window.setTimeout(clearPersistedNostrLogin, 0);
    return () => window.clearTimeout(id);
  }, [logins.length]);

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
        // The reactive needsUnlock will pick that up automatically.
        return;
      }
      const skBytes = decryptNcryptsec(ncryptsec, passphrase);
      const nsec = nip19.nsecEncode(skBytes);
      login.nsec(nsec);
      // Mark this live tab as unlocked. The persisted Nostrify nsec is
      // still cleared, so refresh/new tab re-prompts.
      markSessionUnlocked();
      setPassphrase("");
      setError(null);
    } catch {
      setError("Incorrect passphrase. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleForgetDevice() {
    const ok = window.confirm(
      "Forget this device? You'll need your encrypted key backup to use Zuka on this browser again. Personas survive — they're stored on relays."
    );
    if (!ok) return;

    // Clear all the zuka- and nostr-side state for the active user,
    // then hard-reload to root. Hard reload because:
    //   1. Drops Nostrify's in-memory login state (otherwise stale
    //      until next state cycle).
    //   2. Drops React Query caches keyed on the prior user.
    //   3. Drops the Spark SDK handle / wallet runtime tied to the
    //      prior mnemonic.
    //   4. Drops React state across the whole app.
    // localStorage we deliberately keep: AppContext config (theme,
    // relay list, blossom servers), the install-banner dismissal —
    // those are app preferences, not personal data.
    await clearOperatorDeviceSecrets(queryClient);
    window.location.assign("/");
  }

  return (
    <>
      {children}
      {needsUnlock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4"
          // Block scroll on the underlying page while the modal is up.
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-xl space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="size-5 text-primary" aria-hidden="true" />
                <h2
                  id="unlock-title"
                  className="font-display text-2xl font-medium tracking-tight"
                >
                  Unlock Zuka
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
      )}
    </>
  );
}

export default UnlockGate;
