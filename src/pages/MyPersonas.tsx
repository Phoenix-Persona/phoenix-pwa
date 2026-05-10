import { Link } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { LayoutDashboard, Plus, Radio, Sparkles } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { PersonaActionsMenu } from "@/components/PersonaActionsMenu";
import { PersonaGridSkeleton } from "@/components/Skeletons";
import { PersonaStatsBadge } from "@/components/PersonaStatsBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMyPersonas, usePersonaActivityStats } from "@/hooks/usePersona";
import { sanitizeHttpUrl } from "@/lib/url";

const MyPersonas = () => {
  useSeoMeta({ title: "My personas — Zuka" });
  const { user } = useCurrentUser();
  const { data, isLoading, isError, error } = useMyPersonas();
  // Batched activity query keyed on the union of persona pubkeys —
  // single round-trip covers every card in the grid.
  const personaPubkeys = data?.map((d) => d.envelope.persona.pubkey);
  const stats = usePersonaActivityStats(personaPubkeys);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Cover band — charcoal mat with bold pattern (matches Settings) */}
        <section className="relative overflow-hidden hero-mat text-imigongo-cream">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
            aria-hidden="true"
          />
          <div className="container relative py-10 md:py-14 max-w-5xl space-y-2">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
              <span className="h-px w-6 bg-rw-gold" />
              Your voices
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
              My personas
            </h1>
          </div>
          <FlagStripe height={4} />
        </section>

        <div className="container py-10 max-w-5xl space-y-8">
          {user && data && data.length > 0 && (
            <div className="flex justify-end">
              <Button
                asChild
                size="lg"
                className="rounded-full px-6 bg-rw-gold text-imigongo-charcoal hover:bg-rw-gold/90 shadow-xl shadow-rw-gold/30"
              >
                <Link to="/onboard">
                  <Plus className="mr-2 size-4" />
                  New persona
                </Link>
              </Button>
            </div>
          )}
        {!user ? (
          <Card className="border-dashed border-imigongo-clay/30 bg-imigongo-cream/40">
            <CardContent className="py-12 px-8 text-center text-muted-foreground">
              Sign in to view your personas.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <PersonaGridSkeleton count={3} />
        ) : isError ? (
          <Card className="border-dashed border-destructive/30 bg-destructive/5">
            <CardContent className="py-12 px-8 text-center text-muted-foreground space-y-2">
              <p>Couldn't load your personas.</p>
              <p className="text-xs">{String(error)}</p>
            </CardContent>
          </Card>
        ) : data && data.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.map(({ event, envelope, npub }, idx) => {
              const persona = envelope.persona;
              const picture = sanitizeHttpUrl(persona.reference_image_url);
              // Rotate accent colors so the grid doesn't feel monochrome.
              const accent = idx % 3 === 0
                ? "from-imigongo-clay to-imigongo-ochre"
                : idx % 3 === 1
                ? "from-rw-green to-rw-green-deep"
                : "from-rw-gold to-imigongo-ochre";
              return (
                <article
                  key={event.id}
                  className="group relative flex flex-col rounded-2xl border border-border bg-card hover:border-imigongo-clay/60 hover:shadow-2xl hover:shadow-imigongo-clay/20 transition-all overflow-hidden"
                >
                  <Link
                    to={`/dashboard/${npub}`}
                    className="block flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-2xl"
                  >
                    {/* Color cap header */}
                    <div className={`relative h-24 bg-gradient-to-br ${accent} overflow-hidden`}>
                      <div
                        className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.18]"
                        aria-hidden="true"
                      />
                      <ImigongoSeal
                        size={64}
                        colorClass="text-imigongo-cream/40"
                        className="absolute -right-3 -bottom-3"
                      />
                      <FlagStripe className="absolute bottom-0 left-0 right-0" height={3} />
                    </div>

                    {/* Avatar — overlaps the cap by half its height. Picture
                        when set on the persona, Imigongo seal as fallback. */}
                    <div className="px-5 -mt-8 relative">
                      <div className="size-16 rounded-full ring-4 ring-card shadow-lg overflow-hidden bg-imigongo-charcoal flex items-center justify-center">
                        {picture ? (
                          <img
                            src={picture}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <ImigongoSeal
                            size={36}
                            colorClass="text-rw-gold/80"
                          />
                        )}
                      </div>
                    </div>

                    <div className="p-5 pt-3 space-y-2.5">
                      <h3 className="font-display text-2xl font-medium tracking-tight group-hover:text-primary transition-colors leading-tight">
                        {persona.name}
                      </h3>
                      <PersonaStatsBadge
                        stats={stats.data?.get(persona.pubkey)}
                        loading={stats.isLoading}
                      />
                    </div>
                  </Link>

                  <div className="grid grid-cols-2 gap-2 border-t border-border/70 bg-muted/20 p-3">
                    <Button
                      asChild
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                    >
                      <Link to={`/dashboard/${npub}`}>
                        <LayoutDashboard className="mr-1.5 size-3.5" />
                        Dashboard
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                    >
                      <Link to={`/p/${npub}`}>
                        <Radio className="mr-1.5 size-3.5" />
                        Public feed
                      </Link>
                    </Button>
                  </div>

                  {/* Sibling of <Link>, not nested — clicks don't bubble. */}
                  <div className="absolute top-3 right-3 z-10">
                    <PersonaActionsMenu
                      npub={npub}
                      backupEvent={event}
                      personaPubkey={persona.pubkey}
                      personaName={persona.name}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed border-imigongo-clay/30 bg-gradient-to-br from-imigongo-cream/40 to-rw-gold-soft/20 overflow-hidden">
            <CardContent className="py-14 px-8 text-center space-y-5">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-rw-gold/20 blur-xl rounded-full" />
                  <ImigongoSeal
                    size={64}
                    colorClass="text-imigongo-clay relative"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-display text-2xl text-foreground">
                  No personas yet
                </p>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Create the first voice. Choose a cause, shape the tone,
                  and Zuka will mint a fresh keypair just for it.
                </p>
              </div>
              <Button
                asChild
                size="lg"
                className="rounded-full px-8 shadow-lg shadow-primary/20"
              >
                <Link to="/onboard">
                  <Sparkles className="mr-2 size-4" />
                  Create your first persona
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
        </div>
      </main>
    </div>
  );
};

export default MyPersonas;
