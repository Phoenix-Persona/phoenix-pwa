import { Link } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { ImigongoBand, ImigongoSeal } from "@/components/ImigongoBand";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const Index = () => {
  useSeoMeta({
    title: "Phoenix — Uncensorable Voices",
    description:
      "AI personas on Nostr. Voices that can be amplified but not silenced.",
  });

  const { user } = useCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      <PhoenixHeader />

      <main id="main-content" className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-imigongo-cream via-background to-imigongo-cream/40 pointer-events-none" />
          <div
            className="absolute -right-12 top-0 bottom-0 w-2/3 imigongo-pattern text-imigongo-clay opacity-[0.09] pointer-events-none"
            aria-hidden="true"
          />

          <div className="container relative py-20 md:py-32 grid md:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
            <div className="space-y-8">
              <h1 className="font-display text-5xl md:text-7xl font-medium tracking-tight leading-[0.98]">
                Voices that{" "}
                <span className="italic text-primary">
                  can&rsquo;t be silenced
                </span>
                .
              </h1>

              <p className="text-xl text-muted-foreground max-w-xl leading-relaxed">
                Activists get arrested, exiled, killed. Their voice dies with
                them. Phoenix keeps it alive.
              </p>

              <div className="flex flex-wrap gap-3">
                {user ? (
                  <>
                    <Button
                      asChild
                      size="lg"
                      className="rounded-full px-8 shadow-lg shadow-primary/20"
                    >
                      <Link to="/onboard">Create a persona →</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      className="rounded-full px-8"
                    >
                      <Link to="/my-personas">My personas</Link>
                    </Button>
                  </>
                ) : (
                  <Button
                    asChild
                    size="lg"
                    className="rounded-full px-8"
                    disabled
                  >
                    <span>Sign in to begin</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Hero visual */}
            <div className="relative aspect-square max-w-md mx-auto w-full">
              <div className="absolute inset-6 rounded-full bg-gradient-to-br from-rw-gold/30 via-imigongo-ochre/30 to-imigongo-clay/30 blur-3xl" />

              <ImigongoSeal
                size={420}
                colorClass="text-imigongo-clay"
                className="absolute inset-0 m-auto opacity-30 motion-safe:animate-[spin_120s_linear_infinite]"
              />

              <div className="absolute inset-0 grid place-items-center">
                <img
                  src="/icon.svg"
                  alt=""
                  className="w-1/2 h-1/2 drop-shadow-2xl motion-safe:animate-pulse"
                  style={{ animationDuration: "5s" }}
                />
              </div>
            </div>
          </div>
        </section>

        <ImigongoBand variant="muted" />

        {/* HOW IT WORKS */}
        <section className="container py-20 space-y-10">
          <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight max-w-2xl">
            How it works.
          </h2>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                n: "01",
                title: "Build",
                body: "Pick a cause. Curate sources. Define the voice. Phoenix generates the persona's keypair.",
                accentClass: "bg-imigongo-ochre",
              },
              {
                n: "02",
                title: "Speak",
                body: "Type a thought. AI styles it in voice. Preview, edit, publish — signed by the persona, not you.",
                accentClass: "bg-rw-green",
              },
              {
                n: "03",
                title: "Outlive",
                body: "Posts live on relays everywhere. Kill the operator. Content survives. Anyone can resume the voice.",
                accentClass: "bg-imigongo-clay",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="relative rounded-2xl border border-border bg-card p-7 pt-8 space-y-3 hover:border-imigongo-clay/60 transition-colors overflow-hidden"
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${s.accentClass}`}
                />
                <div className="font-mono text-xs text-imigongo-clay tracking-widest">
                  {s.n}
                </div>
                <h3 className="font-display text-2xl font-medium">{s.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <ImigongoBand variant="muted" />

        {/* MISSION */}
        <section className="container py-20 grid md:grid-cols-[1fr_auto] gap-12 items-center max-w-5xl">
          <div className="space-y-5">
            <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
              For Rwanda. For every silenced cause.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
              The launch persona speaks from Rwanda. The aesthetic is{" "}
              <em className="font-display">Imigongo</em> — traditional Rwandan
              geometric art. Every persona inherits the visual heritage of its
              region.
            </p>
          </div>

          <ImigongoSeal
            size={140}
            colorClass="text-imigongo-clay"
            className="hidden md:block flex-shrink-0"
          />
        </section>

        <ImigongoBand variant="bold" />

        <footer className="bg-imigongo-charcoal text-imigongo-cream py-8">
          <div className="container flex flex-wrap items-center justify-between gap-4 text-sm">
            <a
              href="https://github.com/Phoenix-Persona/phoenix-pwa"
              target="_blank"
              rel="noreferrer"
              className="opacity-70 hover:opacity-100 hover:text-rw-gold transition-colors"
            >
              Open source
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
