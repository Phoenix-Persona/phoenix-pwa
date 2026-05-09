import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ShieldCheck } from "lucide-react";
import { nip19 } from "nostr-tools";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { PostCard } from "@/components/PostCard";
import { PostListSkeleton } from "@/components/Skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const PersonaFeed = () => {
  const { npub = "" } = useParams();
  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const posts = usePersonaPosts(npub, 50);

  const displayName =
    author.data?.metadata?.display_name ??
    author.data?.metadata?.name ??
    (personaHex ? genUserName(personaHex) : "Unknown persona");
  const bio = author.data?.metadata?.about ?? "";
  const picture = author.data?.metadata?.picture;

  useSeoMeta({
    title: `${displayName} — Phoenix`,
    description: bio || undefined,
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PhoenixHeader />

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
          <section className="relative overflow-hidden hero-mat text-imigongo-cream">
            <div
              className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
              aria-hidden="true"
            />
            <div
              className="absolute -top-40 -right-32 w-[36rem] h-[36rem] rounded-full bg-rw-gold/10 blur-3xl pointer-events-none"
              aria-hidden="true"
            />

            <div className="container relative py-12 md:py-16 max-w-4xl">
              <div className="flex items-start gap-6 flex-wrap md:flex-nowrap">
                {/* Avatar disc — uses the persona's picture if available */}
                <div className="relative flex-shrink-0">
                  <div
                    className="absolute -inset-2 rounded-full bg-gradient-to-br from-rw-gold/40 via-imigongo-ochre/40 to-imigongo-clay/40 blur-2xl"
                    aria-hidden="true"
                  />
                  <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden ring-2 ring-rw-gold/40 shadow-2xl shadow-black/40 bg-imigongo-charcoal flex items-center justify-center">
                    {picture ? (
                      <img
                        src={picture}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="eager"
                      />
                    ) : (
                      <ImigongoSeal size={72} colorClass="text-rw-gold/80" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                  <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                    <span className="h-px w-6 bg-rw-gold" />
                    Public persona
                  </p>
                  <h1 className="font-display text-3xl md:text-5xl font-medium tracking-tight leading-tight">
                    {displayName}
                  </h1>
                  {bio && (
                    <p className="text-imigongo-cream/85 max-w-2xl leading-relaxed">
                      {bio}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1 items-center">
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] bg-imigongo-cream/15 text-imigongo-cream border-0"
                    >
                      {npub.slice(0, 16)}…
                    </Badge>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-full border-imigongo-cream/30 text-imigongo-cream bg-transparent hover:bg-imigongo-cream/10 hover:text-imigongo-cream"
                    >
                      <Link to={`/verify/${npub}`}>
                        <ShieldCheck className="mr-2 size-4" />
                        Verify
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <FlagStripe height={4} />
          </section>
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
    </div>
  );
};

export default PersonaFeed;
