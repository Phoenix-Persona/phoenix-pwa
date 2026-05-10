import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ShieldCheck } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { ImigongoSeal } from "@/components/ImigongoBand";
import { PersonaHero } from "@/components/persona/PersonaHero";
import { PostCard } from "@/components/PostCard";
import { PostListSkeleton } from "@/components/Skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthor } from "@/hooks/useAuthor";
import { usePersonaPosts } from "@/hooks/usePersona";
import { genUserName } from "@/lib/genUserName";
import { npubToHex } from "@/lib/nostrIds";
import { sanitizeHttpUrl } from "@/lib/url";

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
  const picture = sanitizeHttpUrl(author.data?.metadata?.picture);

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
    </div>
  );
};

export default PersonaFeed;
