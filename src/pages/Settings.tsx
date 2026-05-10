/**
 * Settings — account, relays, media servers, and persona management.
 *
 * Logged-in only. Four sections on a single scrollable page:
 *   - Account: Zuka-managed user nsec, lock / forget device,
 *     change passphrase, download key backup
 *   - Relays: NIP-65 inbox/outbox via RelayListManager
 *   - Media: BUD-03 Blossom server list via BlossomServerListManager
 *     (where persona pictures, post images, and generated videos are
 *     uploaded)
 *   - Personas: thin list with edit/delete affordances on top of the
 *     same useMyPersonas query that powers /my-personas
 */

import { Link, useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import {
  Lock,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  User as UserIcon,
} from "lucide-react";
import { useNostrLogin } from "@nostrify/react/login";
import { nip19 } from "nostr-tools";

import { AppHeader } from "@/components/AppHeader";
import { BlossomServerListManager } from "@/components/BlossomServerListManager";
import { ChangePassphraseDialog } from "@/components/ChangePassphraseDialog";
import { DownloadBackupDialog } from "@/components/DownloadBackupDialog";
import { FlagStripe } from "@/components/ImigongoBand";
import { PersonaStatsBadge } from "@/components/PersonaStatsBadge";
import { RelayListManager } from "@/components/RelayListManager";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLoggedInAccounts } from "@/hooks/useLoggedInAccounts";
import { useMyPersonas, usePersonaActivityStats } from "@/hooks/usePersona";
import { useDeletePersona } from "@/hooks/useDeletePersona";
import { useToast } from "@/hooks/useToast";
import {
  clearSessionUnlocked,
  clearUserNcryptsec,
  hasUserNcryptsec,
  NOSTR_LOGIN_STORAGE_KEY,
} from "@/lib/nip49Storage";

const Settings = () => {
  useSeoMeta({ title: "Settings — Zuka" });
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { logins, removeLogin } = useNostrLogin();
  const { currentUser } = useLoggedInAccounts();
  const personas = useMyPersonas();
  const personaPubkeys = personas.data?.map((p) => p.envelope.persona.pubkey);
  const personaStats = usePersonaActivityStats(personaPubkeys);
  const deletePersona = useDeletePersona();
  const { toast } = useToast();

  const userNpub = user ? nip19.npubEncode(user.pubkey) : "";
  const phoenixManaged = hasUserNcryptsec();

  // Pull the current login's nsec for the export-backup flow. Only
  // available for nsec-type logins; bunker / extension users hold
  // their key in an external signer that Zuka never sees.
  const currentLogin = logins[0];
  const exportableNsec =
    currentLogin && currentLogin.type === "nsec"
      ? currentLogin.data.nsec
      : null;

  function handleLockNow() {
    // Clear the Nostrify session AND the per-tab session flag. The
    // <UnlockGate> reactively computes its `needsUnlock` state from
    // `logins.length` so removing the login here causes the modal
    // to render IMMEDIATELY over whatever route the user is on —
    // no route change, no remount, no lost scroll/form state. They
    // re-enter the passphrase and the modal hides without disturbing
    // the page underneath.
    const current = logins[0];
    if (current) removeLogin(current.id);
    clearSessionUnlocked();
    toast({
      title: "Locked",
      description: "Enter your passphrase to unlock.",
    });
  }

  function handleForgetDevice() {
    const ok = window.confirm(
      "Forget this device? You'll need your nsec backup to sign in again on this browser. Personas survive — they're stored on relays."
    );
    if (!ok) return;

    // Clear synchronously, then hard-reload to root. Hard reload is
    // intentional — it drops Nostrify's in-memory login state, the
    // React Query cache (keyed on the prior user pubkey), the Spark
    // SDK handle, and all React state, leaving a clean slate for
    // the next sign-in. Soft navigate would leak prior-user data
    // through caches.
    //
    // We bypass Nostrify's removeLogin and write to nostr:login
    // directly — removeLogin's localStorage flush is async via a
    // useEffect, which races the page reload.
    clearUserNcryptsec();
    clearSessionUnlocked();
    try {
      window.localStorage.removeItem(NOSTR_LOGIN_STORAGE_KEY);
    } catch {
      /* best effort */
    }
    window.location.assign("/");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Cover band */}
        <section className="relative overflow-hidden hero-mat text-imigongo-cream">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
            aria-hidden="true"
          />
          <div className="container relative py-10 md:py-14 max-w-3xl space-y-2">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
              <span className="h-px w-6 bg-rw-gold" />
              Settings
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
              Account, relays, personas
            </h1>
          </div>
          <FlagStripe height={4} />
        </section>

        {!user ? (
          <div className="container py-10 max-w-2xl">
            <Card className="border-dashed border-imigongo-clay/30 bg-imigongo-cream/40">
              <CardContent className="py-12 text-center text-muted-foreground">
                Sign in to manage your account.
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="container py-10 max-w-3xl space-y-10">
            {/* Account */}
            <section className="space-y-4">
              <SectionHeader
                eyebrow="Account"
                title="Your Nostr identity"
                description="The keypair Zuka signs your encrypted persona backups with."
              />
              <Card className="border-imigongo-clay/20 overflow-hidden">
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="size-12 rounded-full bg-rw-sky/15 ring-1 ring-rw-sky/30 grid place-items-center flex-shrink-0">
                      <UserIcon className="size-5 text-rw-sky" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium">
                        {currentUser?.metadata?.name ??
                          currentUser?.metadata?.display_name ??
                          "Anonymous"}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground break-all">
                        {userNpub}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    {/* Backup is meaningful for any nsec-type login,
                        Phoenix-managed or pasted. Bunker/extension
                        users export their key from their own signer. */}
                    {exportableNsec && (
                      <DownloadBackupDialog nsec={exportableNsec} />
                    )}
                    {phoenixManaged && (
                      <>
                        <ChangePassphraseDialog />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleLockNow}
                        >
                          <Lock className="mr-2 size-4" />
                          Lock now
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive border-destructive/30 hover:bg-destructive/5"
                            >
                              <TriangleAlert className="mr-2 size-4" />
                              Forget this device
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Forget this device?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The encrypted key parked on this browser will be
                                cleared. You'll need your nsec backup to sign in
                                again here. Personas you've already published
                                survive on relays.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleForgetDevice}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Forget device
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                    {!phoenixManaged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const current = logins[0];
                          if (current) removeLogin(current.id);
                          navigate("/");
                        }}
                      >
                        <LogOut className="mr-2 size-4" />
                        Sign out
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Relays */}
            <section className="space-y-4">
              <SectionHeader
                eyebrow="Relays"
                title="Where your events live"
                description="Zuka reads from your inbox relays and writes to your outbox relays. Changes publish a new NIP-65 list automatically."
              />
              <Card className="border-imigongo-clay/20 overflow-hidden">
                <CardContent className="p-6">
                  <RelayListManager />
                </CardContent>
              </Card>
            </section>

            {/* Blossom servers */}
            <section className="space-y-4">
              <SectionHeader
                eyebrow="Media"
                title="Where your images and videos live"
                description="Persona pictures, post images, and generated videos are uploaded to Blossom servers. Add your own to control where the media is hosted; Zuka's defaults stay in the rotation if you keep that toggle on."
              />
              <Card className="border-imigongo-clay/20 overflow-hidden">
                <CardContent className="p-6">
                  <BlossomServerListManager />
                </CardContent>
              </Card>
            </section>

            {/* Personas */}
            <section className="space-y-4">
              <SectionHeader
                eyebrow="Personas"
                title="Voices you operate"
                description="Edit a persona's prompt, voice, or tags. Delete one to unlink it from your account."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/onboard">
                      <Plus className="mr-2 size-4" />
                      New persona
                    </Link>
                  </Button>
                }
              />

              {personas.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Card
                      key={i}
                      className="border-imigongo-clay/20 animate-pulse"
                    >
                      <CardContent className="h-20" />
                    </Card>
                  ))}
                </div>
              ) : personas.data && personas.data.length > 0 ? (
                <ul className="space-y-2">
                  {personas.data.map(({ event, envelope, npub }) => {
                    const persona = envelope.persona;
                    return (
                      <li key={event.id}>
                        <Card className="border-imigongo-clay/20 overflow-hidden">
                          <CardContent className="p-5 flex items-center gap-4 flex-wrap">
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <p className="font-display text-lg font-medium tracking-tight">
                                {persona.name}
                              </p>
                              <PersonaStatsBadge
                                stats={personaStats.data?.get(persona.pubkey)}
                                loading={personaStats.isLoading}
                              />
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {persona.tags.slice(0, 3).map((t) => (
                                  <Badge
                                    key={t}
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {t}
                                  </Badge>
                                ))}
                                {persona.languages.slice(0, 2).map((l) => (
                                  <Badge
                                    key={l}
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {l.toUpperCase()}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-1.5">
                              <Button asChild size="sm" variant="outline">
                                <Link to={`/dashboard/${npub}/edit`}>
                                  <Pencil className="mr-1.5 size-3.5" />
                                  Edit
                                </Link>
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive border-destructive/30 hover:bg-destructive/5"
                                    disabled={deletePersona.isPending}
                                  >
                                    <Trash2 className="mr-1.5 size-3.5" />
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete {persona.name}?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Zuka will publish a deletion request
                                      for this persona's encrypted backup. The
                                      persona keypair becomes inaccessible to
                                      you afterwards. Posts already published
                                      to relays will remain public — Nostr
                                      cannot retract them.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        deletePersona.mutate({
                                          backupEvent: event,
                                          personaPubkey: persona.pubkey,
                                        })
                                      }
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Delete persona
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Card className="border-dashed border-imigongo-clay/30">
                  <CardContent className="py-10 text-center text-muted-foreground space-y-3">
                    <p className="text-sm">No personas yet.</p>
                    <Button asChild size="sm">
                      <Link to="/onboard">
                        <Plus className="mr-2 size-4" />
                        Create your first persona
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
          {eyebrow}
        </p>
        <h2 className="font-display text-2xl font-medium tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground max-w-xl">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export default Settings;
