import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { nip19 } from "nostr-tools";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthor } from "@/hooks/useAuthor";
import { usePersonaPosts } from "@/hooks/usePersona";
import { genUserName } from "@/lib/genUserName";

function npubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") return null;
    return decoded.data;
  } catch {
    return null;
  }
}

const Verify = () => {
  const { npub = "" } = useParams();
  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const posts = usePersonaPosts(npub, 200);

  const displayName =
    author.data?.metadata?.display_name ??
    author.data?.metadata?.name ??
    (personaHex ? genUserName(personaHex) : "Unknown persona");

  useSeoMeta({ title: `Verify ${displayName} — Phoenix` });

  const firstPost = posts.data?.[posts.data.length - 1];
  const lastPost = posts.data?.[0];
  const postCount = posts.data?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PhoenixHeader />

      <main id="main-content" className="flex-1">
        {/* Cover band — green-tinted "verified" mat */}
        <section className="relative overflow-hidden hero-mat text-imigongo-cream">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute -top-40 -right-32 w-[36rem] h-[36rem] rounded-full bg-rw-green/15 blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="container relative py-12 md:py-16 max-w-3xl">
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <div
                  className="absolute -inset-3 rounded-full bg-rw-green/30 blur-2xl"
                  aria-hidden="true"
                />
                <div className="relative w-20 h-20 rounded-full bg-rw-green/20 ring-2 ring-rw-green/50 flex items-center justify-center">
                  <ShieldCheck className="size-10 text-rw-gold" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                  <span className="h-px w-6 bg-rw-gold" />
                  Phoenix attestation
                </p>
                <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
                  Persona verification
                </h1>
                <p className="text-imigongo-cream/80 text-sm">
                  Public-facing identity for {displayName}.
                </p>
              </div>
            </div>
          </div>
          <FlagStripe height={4} />
        </section>

        <div className="container py-10 max-w-3xl space-y-6">
          {posts.isLoading || author.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !personaHex ? (
            <Card className="border-dashed border-destructive/30 bg-destructive/5">
              <CardContent className="py-12 text-center text-muted-foreground">
                Invalid npub.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-imigongo-clay/20 bg-gradient-to-br from-card to-rw-gold-soft/10 overflow-hidden">
                <div className="bg-gradient-to-r from-imigongo-clay/10 via-rw-gold/10 to-rw-green/10 px-6 py-4 border-b border-imigongo-clay/15 flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-rw-green" />
                  <CardTitle className="text-lg">Identity</CardTitle>
                </div>
                <CardContent className="space-y-4 text-sm pt-5">
                  <Field label="Persona name" value={displayName} />
                  <Field label="Persona npub" value={npub} mono />
                  <Field label="Operator" value="Private by design" />
                  <p className="text-xs text-muted-foreground pt-2 leading-relaxed">
                    The human accountable for this voice is{" "}
                    <strong>intentionally not disclosed</strong> on the network.
                    Phoenix is built for activists who would be at risk if the
                    operator-persona link were public. The persona's
                    configuration is encrypted to the operator's Nostr key —
                    only they can operate the persona, and only they can prove
                    ownership privately.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-imigongo-clay/20 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-imigongo-clay/10 via-rw-gold/10 to-rw-green/10 border-b border-imigongo-clay/15 flex flex-row items-center gap-2">
                  <ImigongoSeal size={20} colorClass="text-imigongo-clay" />
                  <CardTitle className="text-lg">Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm pt-5">
                  <Field label="Posts on relays" value={String(postCount)} />
                  {firstPost && (
                    <Field
                      label="First post"
                      value={new Date(firstPost.created_at * 1000).toLocaleString()}
                    />
                  )}
                  {lastPost && (
                    <Field
                      label="Latest post"
                      value={new Date(lastPost.created_at * 1000).toLocaleString()}
                    />
                  )}
                </CardContent>
              </Card>

              <div className="pt-2">
                <Link to={`/p/${npub}`} className="text-sm text-primary hover:underline">
                  ← Back to feed
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid sm:grid-cols-[160px_1fr] gap-1 sm:gap-4">
      <div className="text-muted-foreground text-[11px] uppercase tracking-[0.14em] font-semibold">
        {label}
      </div>
      <div className={mono ? "font-mono break-all" : ""}>{value}</div>
    </div>
  );
}

export default Verify;
