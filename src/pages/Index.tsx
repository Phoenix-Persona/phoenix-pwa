import { Link } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { ImigongoBand, ImigongoSeal } from "@/components/ImigongoBand";
import { HowItWorks } from "@/components/HowItWorks";
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
            className="absolute -right-20 top-0 bottom-0 w-1/2 imigongo-pattern text-imigongo-clay opacity-[0.07] pointer-events-none"
            aria-hidden="true"
          />

          <div className="container relative py-16 md:py-24 grid md:grid-cols-[1fr_1.05fr] gap-10 md:gap-14 items-center">
            <div className="space-y-7 order-2 md:order-1">
              <h1 className="font-display text-5xl md:text-7xl font-medium tracking-tight leading-[0.98]">
                Voices that{" "}
                <span className="italic text-primary">
                  can&rsquo;t be silenced
                </span>
                .
              </h1>

              <p className="text-xl text-muted-foreground max-w-xl leading-relaxed">
                For every cause that deserves to be heard. A voice that no
                power can take down.
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

            {/* Hero image: joyful Rwandan creator on a Kigali rooftop */}
            <div className="relative order-1 md:order-2">
              <div
                className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-rw-gold/30 via-imigongo-ochre/30 to-imigongo-clay/30 blur-2xl opacity-80"
                aria-hidden="true"
              />
              <div className="relative rounded-[1.75rem] overflow-hidden shadow-2xl shadow-imigongo-charcoal/30 ring-1 ring-imigongo-clay/20">
                <img
                  src="/images/hero-kigali.webp"
                  srcSet="/images/hero-kigali-sm.webp 800w, /images/hero-kigali.webp 1600w"
                  sizes="(max-width: 768px) 100vw, 600px"
                  alt="A young creator on a rooftop in Kigali, smiling as she records into her phone."
                  width={1600}
                  height={1346}
                  loading="eager"
                  className="w-full h-auto block"
                />
                {/* Subtle Imigongo accent stripe at the top of the frame */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-imigongo-clay via-rw-gold to-rw-green"
                  aria-hidden="true"
                />
              </div>

              {/* Floating Imigongo seal accent */}
              <ImigongoSeal
                size={88}
                colorClass="text-imigongo-clay"
                className="hidden md:block absolute -bottom-6 -left-6 bg-card rounded-2xl p-2 shadow-xl ring-1 ring-imigongo-clay/20"
              />
            </div>
          </div>
        </section>

        <ImigongoBand variant="muted" />

        <HowItWorks />

        <ImigongoBand variant="muted" />

        {/* CRAFT — operator at work */}
        <section className="container py-20 grid md:grid-cols-[1fr_1fr] gap-10 md:gap-14 items-center max-w-6xl">
          <div className="relative order-2 md:order-1">
            <div className="relative rounded-[1.75rem] overflow-hidden shadow-2xl shadow-imigongo-charcoal/40 ring-1 ring-imigongo-clay/20">
              <img
                src="/images/operator-craft.webp"
                srcSet="/images/operator-craft-sm.webp 800w, /images/operator-craft.webp 1400w"
                sizes="(max-width: 768px) 100vw, 500px"
                alt="A creator reading a printed page in a city café, headphones on, lit by neon city light."
                width={1400}
                height={1217}
                loading="lazy"
                className="w-full h-auto block"
              />
            </div>
          </div>

          <div className="space-y-5 order-1 md:order-2">
            <p className="text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
              The craft
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
              Your words. Their voice. The world&rsquo;s ears.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Curate the sources. Shape the tone. Phoenix turns a raw thought
              into a styled post in your persona&rsquo;s voice — every time,
              with citations attached.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              You stay in control. The persona stays consistent. The truth
              stays cited.
            </p>
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

        <ImigongoBand variant="muted" />

        {/* QUIET PROMISES — trust section, Proton-pattern: each promise
            answers a real activist concern with a concrete capability. */}
        <section className="container py-20 md:py-28 max-w-5xl space-y-14">
          <div className="space-y-4 max-w-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
              Quiet promises
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight leading-[1.05]">
              Built to be earned,{" "}
              <span className="italic text-imigongo-clay">
                not assumed.
              </span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
              Three commitments. Every one of them enforced by cryptography,
              not by us asking you to trust us.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-x-10 gap-y-12 md:gap-x-14">
            {[
              {
                n: "01",
                headline: "Drafts never leave your device.",
                body: (
                  <>
                    Encrypted to your Nostr key in your browser, before
                    anything crosses the wire. Phoenix never sees what
                    you&rsquo;re thinking — even if compelled to.
                  </>
                ),
              },
              {
                n: "02",
                headline: "No single relay can silence you.",
                body: (
                  <>
                    Posts replicate to a quorum of relays you choose. Coercing
                    one isn&rsquo;t enough. Coercing them all isn&rsquo;t
                    possible.
                  </>
                ),
              },
              {
                n: "03",
                headline: "The voice can be inherited.",
                body: (
                  <>
                    Hand the persona to a successor with one signed event.
                    Same key. Same conviction. The voice continues — even if
                    you can&rsquo;t.
                  </>
                ),
              },
            ].map((p) => (
              <div
                key={p.n}
                className="space-y-3 md:border-l md:border-imigongo-clay/20 md:pl-6 first:md:border-l-0 first:md:pl-0"
              >
                <div className="font-mono text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
                  {p.n}
                </div>
                <h3 className="font-display text-2xl font-medium tracking-tight leading-tight">
                  {p.headline}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
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
