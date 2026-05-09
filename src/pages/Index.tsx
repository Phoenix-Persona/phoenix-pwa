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
          {/* Layered backdrop: warm cream wash + Imigongo motif on the right */}
          <div className="absolute inset-0 bg-gradient-to-br from-imigongo-cream via-background to-imigongo-cream/40 pointer-events-none" />
          <div
            className="absolute -right-12 top-0 bottom-0 w-2/3 imigongo-pattern text-imigongo-clay opacity-[0.09] pointer-events-none"
            aria-hidden="true"
          />

          <div className="container relative py-20 md:py-32 grid md:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-imigongo-clay/30 bg-imigongo-clay/5 px-3 py-1.5 text-xs font-medium text-imigongo-clay">
                <span className="size-1.5 rounded-full bg-imigongo-clay animate-pulse" />
                AI Hack for Freedom · HRF
              </div>

              <h1 className="font-display text-5xl md:text-7xl font-medium tracking-tight leading-[0.98]">
                Voices that{" "}
                <span className="italic text-primary">
                  can&rsquo;t be silenced
                </span>
                .
              </h1>

              <p className="text-xl text-muted-foreground max-w-xl leading-relaxed">
                Phoenix lets activists spin up an AI-assisted persona that
                lives on Nostr. Dictators silence people. Phoenix keeps the
                voice alive — privately operated, publicly heard.
              </p>

              <div className="flex flex-wrap gap-3">
                {user ? (
                  <>
                    <Button asChild size="lg" className="rounded-full px-8 shadow-lg shadow-primary/20">
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
                  <Button asChild size="lg" className="rounded-full px-8" disabled>
                    <span>Sign in to begin</span>
                  </Button>
                )}
              </div>

              <p className="text-sm text-muted-foreground max-w-xl">
                Sign in with your Nostr identity. Your persona gets its own
                keypair and posts independently; the link between you and the
                persona is encrypted and never leaves your device.
              </p>
            </div>

            {/* Hero visual: phoenix logo orbiting an Imigongo seal */}
            <div className="relative aspect-square max-w-md mx-auto w-full">
              <div className="absolute inset-6 rounded-full bg-gradient-to-br from-rw-gold/30 via-imigongo-ochre/30 to-imigongo-clay/30 blur-3xl" />

              {/* Outer Imigongo seal that rotates slowly */}
              <ImigongoSeal
                size={420}
                colorClass="text-imigongo-clay"
                className="absolute inset-0 m-auto opacity-30 motion-safe:animate-[spin_120s_linear_infinite]"
              />

              {/* Center phoenix mark */}
              <div className="absolute inset-0 grid place-items-center">
                <img
                  src="/icon.svg"
                  alt=""
                  className="w-1/2 h-1/2 drop-shadow-2xl motion-safe:animate-pulse"
                  style={{ animationDuration: "5s" }}
                />
              </div>

              {/* Three small dots representing flag colors */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
                <span className="size-2 rounded-full bg-rw-sky" />
                <span className="size-2 rounded-full bg-rw-gold" />
                <span className="size-2 rounded-full bg-rw-green" />
              </div>
            </div>
          </div>
        </section>

        <ImigongoBand variant="muted" />

        {/* HOW IT WORKS */}
        <section className="container py-24 space-y-14">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
              How Phoenix works
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
              Three layers. None of them depend on a single point of failure.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                n: "01",
                title: "Build the persona",
                body: "Walk through the wizard. Pick a cause and region. Curate sources. Define the voice. Generate the persona's Nostr keypair.",
                accentClass: "bg-imigongo-ochre",
              },
              {
                n: "02",
                title: "Speak through it",
                body: "Type a raw thought. The persona's AI styles it in voice. Preview, then publish. Posts are signed by the persona — not you.",
                accentClass: "bg-rw-green",
              },
              {
                n: "03",
                title: "Outlive censorship",
                body: "Posts live on Nostr relays around the world. Kill the operator's machine — content survives. Anyone can resume the voice.",
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
        <section className="container py-24 grid md:grid-cols-[1fr_auto] gap-12 items-start max-w-5xl">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.18em] text-rw-green-deep font-semibold">
              Our mission
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
              For Rwanda. For every silenced cause.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
              Activists get arrested, exiled, killed. Their voice dies with
              them. Phoenix amplifies activist voices — with cryptographic
              attribution that&rsquo;s private to the operator, and a feed no
              government can take down.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
              The launch persona speaks from Rwanda, and the aesthetic is{" "}
              <em className="font-display">Imigongo</em>: traditional Rwandan
              geometric art, made centuries ago from cow dung and ash on the
              walls of homes. Bold, mathematical, unapologetic. Every persona
              inherits the visual heritage of its region.
            </p>
          </div>

          <ImigongoSeal
            size={140}
            colorClass="text-imigongo-clay"
            className="hidden md:block flex-shrink-0 mt-8"
          />
        </section>

        <ImigongoBand variant="bold" />

        <footer className="bg-imigongo-charcoal text-imigongo-cream py-10">
          <div className="container flex flex-wrap items-center justify-between gap-4 text-sm">
            <span className="opacity-80">Built at HRF AI Hack for Freedom</span>
            <span className="opacity-80">
              Phoenix is open source ·{" "}
              <a
                href="https://soapbox.pub"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-rw-gold transition-colors"
              >
                Soapbox
              </a>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
