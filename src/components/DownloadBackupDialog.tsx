/**
 * DownloadBackupDialog — export the user's nsec as a NIP-49
 * passphrase-encrypted file (`.ncryptsec`).
 *
 * The exported file is portable across Nostr clients: any client that
 * reads NIP-49 can re-import it with the same passphrase. This is the
 * primitive behind the demo's "kill-and-resurrect" arc — the user can
 * walk to a different device, drop the file in, and continue.
 *
 * The export passphrase is independent of the at-rest passphrase used
 * by `<UnlockGate>`. Users can pick the same one or a different one;
 * we recommend distinct so a leak of one doesn't compromise the other.
 *
 * Only available for nsec-type logins (Phoenix-managed or pasted
 * nsec). NIP-07 / NIP-46 users hold their key in an external signer
 * — Zuka never sees the plaintext, so it can't export.
 */

import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import { nip19 } from "nostr-tools";

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
import { encryptNsec } from "@/lib/nip49Storage";
import { useToast } from "@/hooks/useToast";

interface DownloadBackupDialogProps {
  /** The user's nsec (bech32) — only available for nsec-type logins. */
  nsec: string;
  /** Trigger button content; defaults to a labelled icon button. */
  children?: React.ReactNode;
}

/** Generate a date-stamped filename for the export. */
function exportFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `zuka-backup-${stamp}.ncryptsec`;
}

export function DownloadBackupDialog({
  nsec,
  children,
}: DownloadBackupDialogProps) {
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [encrypting, setEncrypting] = useState(false);
  const { toast } = useToast();

  function reset() {
    setPassphrase("");
    setConfirm("");
    setError(null);
    setEncrypting(false);
  }

  async function handleDownload() {
    setError(null);
    if (passphrase.length < 12) {
      setError("Use at least 12 characters.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases do not match.");
      return;
    }

    setEncrypting(true);
    // Yield to the event loop so the spinner paints before scrypt
    // grabs the main thread for several hundred ms (log_n=18).
    await new Promise((r) => setTimeout(r, 0));

    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") {
        throw new Error("Not an nsec-type login.");
      }
      const ncryptsec = encryptNsec(decoded.data, passphrase);

      // Trigger file download in-browser.
      const blob = new Blob([ncryptsec], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exportFilename();
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast({
        title: "Backup saved",
        description: "Store this file somewhere safe and offline.",
      });
      setOpen(false);
      reset();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not generate backup."
      );
    } finally {
      setEncrypting(false);
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
            <Download className="mr-2 size-4" />
            Download key backup
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download key backup</DialogTitle>
          <DialogDescription>
            Set a passphrase to protect the file. Anyone with both the
            file and the passphrase can sign as you, so save them
            separately and offline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="export-passphrase">Export passphrase</Label>
            <Input
              id="export-passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="new-password"
              disabled={encrypting}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-passphrase-confirm">
              Confirm passphrase
            </Label>
            <Input
              id="export-passphrase-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={encrypting}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !encrypting) {
                  e.preventDefault();
                  handleDownload();
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
            At least 12 characters. We recommend a different passphrase
            than your at-rest one. Zuka can't recover this file for
            you — write the passphrase down somewhere offline.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={encrypting}
          >
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={encrypting}>
            {encrypting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Encrypting…
              </>
            ) : (
              <>
                <Download className="mr-2 size-4" />
                Download
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
