/**
 * Dashboard — the active persona's composer + recent feed.
 *
 * The composer publishes raw text directly. AI styling (PPQ), image
 * generation, and the wallet/cost layer are Jim's surface area and
 * land separately on this page when they're ready.
 */

import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { PersonaActionsMenu } from "@/components/PersonaActionsMenu";
import { PostCard } from "@/components/PostCard";
import { PostListSkeleton } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/useToast";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersona, usePersonaPosts } from "@/hooks/usePersona";
import { usePersonaPublish } from "@/hooks/usePersonaPublish";
import { buildPersonaPostTemplate } from "@/lib/personaPost";
import { nip19 } from "nostr-tools";

function npubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") return null;
    return decoded.data;
  } catch {
    return null;
  }
}

const Dashboard = () => {
  const { npub = "" } = useParams();
  useSeoMeta({ title: "Dashboard — Feniksi" });

  const { user } = useCurrentUser();
  const { toast } = useToast();
  const persona = usePersona(npub);
  const posts = usePersonaPosts(npub, 20);
  const publish = usePersonaPublish();

  const personaHex = useMemo(() => npubToHex(npub), [npub]);
  const author = useAuthor(personaHex ?? undefined);
  const publicBio = author.data?.metadata?.about ?? "";
  const picture = author.data?.metadata?.picture;

  const [raw, setRaw] = useState("");

  const envelope = persona.data?.envelope ?? null;
  const personaConfig = envelope?.persona ?? null;

  async function onPost() {
    if (!personaConfig || !user || !raw.trim()) return;
    try {
      // No styling step yet — publish the raw text directly. AI
      // styling will run between `raw` and `template` once it's wired.
      const template = buildPersonaPostTemplate({
        text: raw,
        tags: personaConfig.tags,
      });
      await publish.mutateAsync({
        personaNsec: personaConfig.nsec,
        template,
      });
      toast({ title: "Published", description: "Post is live on relays." });
      setRaw("");
      posts.refetch();
    } catch (e) {
      toast({
        title: "Publish failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Persona cover header — charcoal mat with avatar + tags */}
        {!user ? (
          <section className="cream-wash py-20">
            <div className="container max-w-3xl">
              <Card className="border-dashed border-imigongo-clay/30 bg-imigongo-cream/40">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Sign in to access this persona's dashboard.
                </CardContent>
              </Card>
            </div>
          </section>
        ) : persona.isLoading ? (
          <section className="hero-mat text-imigongo-cream">
            <div className="container py-12 md:py-16 max-w-4xl flex items-center gap-6">
              <div className="w-28 h-28 rounded-full bg-imigongo-cream/10 animate-pulse" />
              <div className="flex-1 space-y-3">
                <div className="h-3 w-24 bg-imigongo-cream/15 rounded animate-pulse" />
                <div className="h-10 w-72 bg-imigongo-cream/15 rounded animate-pulse" />
                <div className="h-4 w-96 max-w-full bg-imigongo-cream/10 rounded animate-pulse" />
              </div>
            </div>
            <FlagStripe height={4} />
          </section>
        ) : personaConfig ? (
          <section className="relative overflow-hidden hero-mat text-imigongo-cream">
            <div
              className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
              aria-hidden="true"
            />
            <div
              className="absolute -top-40 -right-32 w-[36rem] h-[36rem] rounded-full bg-rw-gold/10 blur-3xl pointer-events-none"
              aria-hidden="true"
            />

            <div className="container relative py-10 md:py-14 max-w-4xl">
              <div className="flex items-start gap-6 flex-wrap md:flex-nowrap">
                <div className="relative flex-shrink-0">
                  <div
                    className="absolute -inset-2 rounded-full bg-gradient-to-br from-rw-gold/40 via-imigongo-ochre/40 to-imigongo-clay/40 blur-2xl"
                    aria-hidden="true"
                  />
                  <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden ring-2 ring-rw-gold/40 shadow-2xl shadow-black/40 bg-imigongo-charcoal flex items-center justify-center">
                    {picture ? (
                      <img
                        src={picture}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="eager"
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <ImigongoSeal size={56} colorClass="text-rw-gold/80" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                  <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                    <span className="h-px w-6 bg-rw-gold" />
                    Composer
                  </p>
                  <h1 className="font-display text-3xl md:text-5xl font-medium tracking-tight leading-tight">
                    {personaConfig.name}
                  </h1>
                  {publicBio && (
                    <p className="text-imigongo-cream/80 max-w-2xl leading-relaxed">
                      {publicBio}
                    </p>
                  )}
                  {personaConfig.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 items-center">
                      {personaConfig.tags.slice(0, 4).map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="text-[10px] bg-imigongo-cream/15 text-imigongo-cream border-0"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <PersonaActionsMenu
                    npub={npub}
                    backupEvent={persona.data!.event}
                    personaPubkey={personaConfig.pubkey}
                    personaName={personaConfig.name}
                    variant="inline"
                    publicFeedNpub={npub}
                    inverse
                    className="pt-2"
                  />
                </div>
              </div>
            </div>
            <FlagStripe height={4} />
          </section>
        ) : persona.isError ? (
          <section className="cream-wash py-12">
            <div className="container max-w-3xl">
              <Card className="border-dashed border-destructive/30 bg-destructive/5">
                <CardContent className="py-12 px-8 text-center text-muted-foreground space-y-2">
                  <p>
                    Couldn't decrypt this persona. Either it isn't yours, or your
                    signer rejected the decryption request.
                  </p>
                  <p className="text-xs">{String(persona.error)}</p>
                </CardContent>
              </Card>
            </div>
          </section>
        ) : (
          <section className="cream-wash py-12">
            <div className="container max-w-3xl">
              <Card className="border-dashed border-imigongo-clay/30">
                <CardContent className="py-12 px-8 text-center text-muted-foreground">
                  No persona found at this npub for your account. It may not
                  have published yet, or the relays haven't seen it.
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* Composer + feed body */}
        <div className="container py-10 max-w-4xl space-y-8">
          {personaConfig && (
            <Card className="border-imigongo-clay/20 bg-gradient-to-br from-card via-card to-rw-gold-soft/10 overflow-hidden">
              <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-6 py-4 border-b border-imigongo-clay/15 flex items-center gap-2">
                <Sparkles className="size-5 text-imigongo-clay" aria-hidden="true" />
                <h2 className="font-display text-2xl font-medium tracking-tight">
                  Compose
                </h2>
              </div>
              <CardContent className="space-y-5 pt-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="composer-raw" className="text-sm font-medium">
                      Post body
                    </label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {raw.length} chars
                    </span>
                  </div>
                  <Textarea
                    id="composer-raw"
                    rows={5}
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="Type the raw thought. We'll publish it as-is for now; AI styling will run here once it lands."
                    onKeyDown={(e) => {
                      if (
                        (e.metaKey || e.ctrlKey) &&
                        e.key === "Enter" &&
                        raw.trim() &&
                        !publish.isPending
                      ) {
                        e.preventDefault();
                        onPost();
                      }
                    }}
                    className="resize-y min-h-[8rem] bg-background/60"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Press{" "}
                    <kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border text-[10px]">
                      ⌘ Enter
                    </kbd>{" "}
                    to publish.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setRaw("")}
                    disabled={publish.isPending}
                  >
                    Discard
                  </Button>
                  <Button
                    onClick={onPost}
                    disabled={publish.isPending || !raw.trim()}
                    className="shadow-lg shadow-primary/20"
                  >
                    {publish.isPending ? (
                      <>
                        <Loader2
                          className="mr-2 size-4 animate-spin"
                          aria-hidden="true"
                        />
                        Publishing…
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 size-4" aria-hidden="true" />
                        Publish to relays
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent posts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-medium tracking-tight">
                Recent posts
              </h2>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Live on relays
              </span>
            </div>
            {posts.isLoading ? (
              <PostListSkeleton count={2} />
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
                <CardContent className="py-12 px-6 text-center text-muted-foreground space-y-3">
                  <ImigongoSeal
                    size={48}
                    colorClass="text-imigongo-clay/60"
                    className="mx-auto"
                  />
                  <p className="text-sm">
                    No posts yet. Compose the first one above.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
