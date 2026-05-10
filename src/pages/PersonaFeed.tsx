import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Copy, QrCode, Zap } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { ImigongoSeal } from "@/components/ImigongoBand";
import { PersonaHero } from "@/components/persona/PersonaHero";
import { PostCard } from "@/components/PostCard";
import { PostListSkeleton } from "@/components/Skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { useAppContext } from "@/hooks/useAppContext";
import { useAuthor } from "@/hooks/useAuthor";
import { usePersonaPosts } from "@/hooks/usePersona";
import { useToast } from "@/hooks/useToast";
import { genUserName } from "@/lib/genUserName";
import { npubToHex } from "@/lib/nostrIds";
import { encodePubkeyAsNprofile } from "@/lib/nostrViewer";
import { sanitizeHttpUrl } from "@/lib/url";

const NPROFILE_RELAY_HINT_LIMIT = 3;

const PersonaFeed = () => {
  const { npub = "" } = useParams();
  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const posts = usePersonaPosts(npub, 50);
  const { toast } = useToast();
  const { config } = useAppContext();
  const [donateOpen, setDonateOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const displayName =
    author.data?.metadata?.display_name ??
    author.data?.metadata?.name ??
    (personaHex ? genUserName(personaHex) : "Unknown persona");
  const bio = author.data?.metadata?.about ?? "";
  const picture = sanitizeHttpUrl(author.data?.metadata?.picture);
  const lud16 = author.data?.metadata?.lud16;
  const donateUri = lud16 ? `lightning:${lud16}` : null;

  const relayHints = useMemo(
    () =>
      config.relayMetadata.relays
        .filter((r) => r.write)
        .slice(0, NPROFILE_RELAY_HINT_LIMIT)
        .map((r) => r.url),
    [config.relayMetadata.relays],
  );
  const nprofile = useMemo(
    () => (personaHex ? encodePubkeyAsNprofile(personaHex, relayHints) : null),
    [personaHex, relayHints],
  );

  function copyLud16() {
    if (!lud16) return;
    navigator.clipboard.writeText(lud16);
    toast({ title: "Lightning Address copied" });
  }

  function copyNprofile() {
    if (!nprofile) return;
    navigator.clipboard.writeText(nprofile);
    toast({ title: "nprofile copied" });
  }

  useSeoMeta({
    title: `${displayName} — Zuka`,
    description: bio || undefined,
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Persona cover band — charcoal mat with avatar disc + bio */}
        {!personaHex ? (
          <section className="cream-wash py-20">
            <div className="container max-w-3xl">
              <Card className="border-dashed border-destructive/30 bg-destructive/5">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Invalid persona npub.
                </CardContent>
              </Card>
            </div>
          </section>
        ) : (
          <PersonaHero
            eyebrow="Public persona"
            name={displayName}
            bio={bio || undefined}
            pictureUrl={picture ?? null}
            avatarSize="public"
            badges={
              <div className="flex flex-wrap gap-2 pt-1 items-center">
                {lud16 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDonateOpen(true)}
                    className="rounded-full border-rw-gold/40 text-rw-gold bg-transparent hover:bg-rw-gold/10 hover:text-rw-gold"
                  >
                    <Zap className="mr-2 size-4" aria-hidden="true" />
                    Donate
                  </Button>
                ) : null}
                {nprofile ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScanOpen(true)}
                    className="rounded-full border-imigongo-cream/30 text-imigongo-cream bg-transparent hover:bg-imigongo-cream/10 hover:text-imigongo-cream"
                  >
                    <QrCode className="mr-2 size-4" aria-hidden="true" />
                    Scan
                  </Button>
                ) : null}
              </div>
            }
          />
        )}

        {/* Feed */}
        <section className="container py-10 max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-medium tracking-tight">
              Feed
            </h2>
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Live on Nostr relays
            </span>
          </div>
          {posts.isLoading ? (
            <PostListSkeleton count={3} />
          ) : posts.data && posts.data.length > 0 ? (
            <ul className="space-y-3">
              {posts.data.map((p) => (
                <li key={p.id}>
                  <PostCard event={p} />
                </li>
              ))}
            </ul>
          ) : (
            <Card className="border-dashed border-imigongo-clay/30 bg-gradient-to-br from-imigongo-cream/30 to-rw-gold-soft/10">
              <CardContent className="py-14 px-8 text-center text-muted-foreground space-y-3">
                <ImigongoSeal
                  size={56}
                  colorClass="text-imigongo-clay/60"
                  className="mx-auto"
                />
                <p>No posts yet. The voice is preparing to speak.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>

      <Dialog open={donateOpen} onOpenChange={setDonateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Donate to {displayName}</DialogTitle>
            <DialogDescription>
              Scan the QR or copy the Lightning Address into any wallet that
              supports LNURL-pay.
            </DialogDescription>
          </DialogHeader>
          {donateUri && lud16 ? (
            <div className="space-y-3 min-w-0">
              <div className="flex justify-center">
                <div className="rounded bg-white p-2">
                  <QRCodeCanvas value={donateUri} size={224} />
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <code className="flex-1 min-w-0 text-sm bg-muted px-2 py-1 rounded truncate">
                  {lud16}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={copyLud16}
                  aria-label="Copy Lightning Address"
                  className="shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan {displayName}</DialogTitle>
            <DialogDescription>
              Scan the QR or copy the nprofile into any Nostr client to follow
              this persona.
            </DialogDescription>
          </DialogHeader>
          {nprofile ? (
            <div className="space-y-3 min-w-0">
              <div className="flex justify-center">
                <div className="rounded bg-white p-2">
                  <QRCodeCanvas value={nprofile} size={224} />
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <code className="flex-1 min-w-0 text-[11px] font-mono bg-muted px-2 py-1 rounded truncate">
                  {nprofile}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={copyNprofile}
                  aria-label="Copy nprofile"
                  className="shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PersonaFeed;
