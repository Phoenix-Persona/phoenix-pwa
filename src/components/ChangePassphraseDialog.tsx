/**
 * ChangePassphraseDialog — rotate the at-rest passphrase that
 * protects the user's nsec on this device.
 *
 * Reads the current `zuka:user:ncryptsec` from localStorage,
 * decrypts with the old passphrase, re-encrypts with the new one,
 * and writes the new ncryptsec back. The Nostrify session stays
 * untouched (the user's plaintext nsec is already in memory) — only
 * the at-rest layer rotates.
 *
 * Only meaningful for Phoenix-managed accounts (those with an
 * `zuka:user:ncryptsec` parked in localStorage). For BYO logins
 * we don't render the affordance.
 */

import { useState } from "react";
import { Loader2, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  decryptNcryptsec,
  encryptNsec,
  loadUserNcryptsec,
  storeUserNcryptsec,
} from "@/lib/nip49Storage";
import { useToast } from "@/hooks/useToast";

interface ChangePassphraseDialogProps {
  children?: React.ReactNode;
}

export function ChangePassphraseDialog({
  children,
}: ChangePassphraseDialogProps) {
  const [open, setOpen] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const { toast } = useToast();

  function reset() {
    setOldPass("");
    setNewPass("");
    setConfirm("");
    setError(null);
    setWorking(false);
  }

  async function handleSubmit() {
    setError(null);
    if (!oldPass) {
      setError("Enter your current passphrase.");
      return;
    }
    if (newPass.length < 12) {
      setError("New passphrase must be at least 12 characters.");
      return;
    }
    if (newPass === oldPass) {
      setError("New passphrase must differ from the current one.");
      return;
    }
    if (newPass !== confirm) {
      setError("New passphrases do not match.");
      return;
    }

    setWorking(true);
    // Yield to the event loop so the spinner paints before scrypt
    // grabs the main thread (twice — decrypt + encrypt at log_n=18).
    await new Promise((r) => setTimeout(r, 0));

    try {
      const stored = loadUserNcryptsec();
      if (!stored) {
        throw new Error("No encrypted key found on this device.");
      }

      let skBytes: Uint8Array;
      try {
        skBytes = decryptNcryptsec(stored, oldPass);
      } catch {
        throw new Error("Current passphrase is incorrect.");
      }

      // Re-encrypt with the new passphrase and replace.
      const next = encryptNsec(skBytes, newPass);
      storeUserNcryptsec(next);

      toast({
        title: "Passphrase changed",
        description: "Use the new passphrase next session.",
      });
      setOpen(false);
      reset();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not change passphrase. Try again."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm">
            <KeyRound className="mr-2 size-4" />
            Change passphrase
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change passphrase</DialogTitle>
          <DialogDescription>
            Rotate the at-rest passphrase that unlocks your key on this
            browser. Your active session stays open; the next session
            will use the new passphrase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cp-old">Current passphrase</Label>
            <Input
              id="cp-old"
              type="password"
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
              autoComplete="current-password"
              disabled={working}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-new">New passphrase</Label>
            <Input
              id="cp-new"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              autoComplete="new-password"
              disabled={working}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-confirm">Confirm new passphrase</Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={working}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !working) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            At least 12 characters. Zuka can't recover this for you
            — write it down somewhere offline.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={working}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={working}>
            {working ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <KeyRound className="mr-2 size-4" />
                Change
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
