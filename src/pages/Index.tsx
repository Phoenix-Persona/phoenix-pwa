import { useState } from "react";
import { Link } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ArrowRight } from "lucide-react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import {
  FlagStripe,
  ImigongoBand,
  ImigongoSeal,
} from "@/components/ImigongoBand";
import { HowItWorks } from "@/components/HowItWorks";
import { Button } from "@/components/ui/button";
import AuthDialog from "@/components/auth/AuthDialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const Index = () => {
  useSeoMeta({
    title: "Phoenix — Uncensorable Voices",
    description:
      "AI personas on Nostr. Voices that can be amplified but not silenced.",
  });

  const { user } = useCurrentUser();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <PhoenixHeader />

      <main id="main-content" className="flex-1">
        {/* HERO — charcoal mat with warm clay glow + bold pattern overlay */}
        <section className="relative overflow-hidden hero-mat text-imigongo-cream">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute -top-32 -right-32 w-[40rem] h-[40rem] rounded-full bg-rw-gold/10 blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="container relative py-20 md:py-28 grid md:grid-cols-[1fr_1.05fr] gap-10 md:gap-14 items-center">
            <div className="space-y-7 order-2 md:order-1">
              <h1 className="font-display text-5xl md:text-7xl font-medium tracking-tight leading-[0.98]">
                Voices that{" "}
                <span className="italic text-rw-gold">
                  can&rsquo;t be silenced
                </span>
                .
              </h1>

              <p className="text-xl text-imigongo-cream/85 max-w-xl leading-relaxed">
                For every cause that deserves to be heard. A voice that no
                power can take down.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                {user ? (
                  <>
                    <Button
                      asChild
                      size="lg"
                      className="rounded-full px-8 bg-rw-gold text-imigongo-charcoal hover:bg-rw-gold/90 shadow-xl shadow-rw-gold/30"
                    >
                      <Link to="/onboard">
                        Create a persona
                        <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      className="rounded-full px-8 border-imigongo-cream/30 text-imigongo-cream bg-transparent hover:bg-imigongo-cream/10 hover:text-imigongo-cream"
                    >
                      <Link to="/my-personas">My personas</Link>
                    </Button>
                  </>
                ) : (
                  <Button
                    size="lg"
                    className="rounded-full px-8 bg-rw-gold text-imigongo-charcoal hover:bg-rw-gold/90 shadow-xl shadow-rw-gold/30"
                    onClick={() => setAuthOpen(true)}
                  >
                    Sign in to begin
                    <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>

              {/* Trust ribbon — outcome-focused promises */}
              <ul className="grid grid-cols-3 gap-3 pt-6 max-w-md text-[12px] tracking-tight text-imigongo-cream/85 font-medium leading-snug">
                <li className="border-l-2 border-imigongo-clay pl-3">
                  Your identity<br />stays hidden
                </li>
                <li className="border-l-2 border-rw-gold pl-3">
                  A voice<br />fully its own
                </li>
                <li className="border-l-2 border-rw-green pl-3">
                  Impossible<br />to silence
                </li>
              </ul>
            </div>

            {/* Hero image: joyful Rwandan creator on a Kigali rooftop */}
            <div className="relative order-1 md:order-2">
              <div
                className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-rw-gold/40 via-imigongo-ochre/40 to-imigongo-clay/40 blur-3xl opacity-90"
                aria-hidden="true"
              />
              <div className="relative rounded-[1.75rem] overflow-hidden shadow-2xl shadow-imigongo-charcoal/60 ring-1 ring-rw-gold/30">
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
                {/* Bold flag stripe at top of frame */}
                <FlagStripe className="absolute top-0 left-0 right-0" height={4} />
              </div>

              {/* Floating Imigongo seal accent */}
              <ImigongoSeal
                size={104}
                colorClass="text-rw-gold"
                className="hidden md:block absolute -bottom-8 -left-8 bg-imigongo-charcoal rounded-2xl p-3 shadow-2xl ring-1 ring-rw-gold/30"
              />
            </div>
          </div>

          {/* Bottom flag stripe seals the hero */}
          <FlagStripe className="relative" height={4} />
        </section>

        {/* HOW IT WORKS — cream wash with pattern texture */}
        <section className="relative cream-wash">
          <div
            className="absolute inset-0 imigongo-pattern-soft text-imigongo-clay opacity-30 pointer-events-none"
            aria-hidden="true"
          />
          <div className="relative">
            <HowItWorks />
          </div>
        </section>

        {/* Bold parchment divider */}
        <ImigongoBand variant="parchment" />

        {/* CRAFT — operator at work, dark mat */}
        <section className="relative overflow-hidden hero-mat text-imigongo-cream py-20 md:py-28">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.04] pointer-events-none"
            aria-hidden="true"
          />
          <div className="container relative grid md:grid-cols-[1fr_1fr] gap-10 md:gap-14 items-center max-w-6xl">
            <div className="relative order-2 md:order-1">
              <div
                className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-rw-gold/30 via-imigongo-ochre/40 to-imigongo-clay/30 blur-2xl opacity-90"
                aria-hidden="true"
              />
              <div className="relative rounded-[1.75rem] overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-imigongo-cream/15">
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
                <FlagStripe className="absolute top-0 left-0 right-0" height={4} />
              </div>
            </div>

            <div className="space-y-5 order-1 md:order-2">
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                <span className="h-px w-8 bg-rw-gold" />
                The craft
              </p>
              <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
                Your words. Their voice.{" "}
                <span className="italic text-rw-gold">The world&rsquo;s ears.</span>
              </h2>
              <p className="text-lg text-imigongo-cream/80 leading-relaxed">
                Curate the sources. Shape the tone. Phoenix turns a raw thought
                into a styled post in your persona&rsquo;s voice — every time,
                with citations attached.
              </p>
              <p className="text-lg text-imigongo-cream/80 leading-relaxed">
                You stay in control. The persona stays consistent. The truth
                stays cited.
              </p>
            </div>
          </div>
        </section>

        {/* Parchment divider — flag-rooted accent */}
        <ImigongoBand variant="parchment" />

        {/* MISSION — cream wash with seal */}
        <section className="relative cream-wash py-20 md:py-24">
          <div
            className="absolute inset-0 imigongo-pattern-soft text-imigongo-clay opacity-25 pointer-events-none"
            aria-hidden="true"
          />
          <div className="container relative grid md:grid-cols-[1fr_auto] gap-12 items-center max-w-5xl">
            <div className="space-y-5">
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
                <span className="h-px w-8 bg-imigongo-clay" />
                The mission
              </p>
              <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
                For Rwanda. For every{" "}
                <span className="italic text-rw-green-deep">silenced cause.</span>
              </h2>
              <div className="h-1 w-24 flag-underline rounded-full" />
              <div className="rounded-2xl bg-card border border-imigongo-clay/15 shadow-sm p-6 max-w-2xl">
                <p className="text-lg text-foreground leading-relaxed">
                  The launch persona speaks from Rwanda. The aesthetic is{" "}
                  <em className="font-display text-imigongo-clay">Imigongo</em> —
                  traditional Rwandan geometric art. Every persona inherits the
                  visual heritage of its region.
                </p>
              </div>
            </div>

            <div className="relative hidden md:block">
              <div
                className="absolute -inset-4 rounded-full bg-gradient-to-br from-rw-gold/30 to-imigongo-clay/30 blur-2xl"
                aria-hidden="true"
              />
              <div className="relative bg-card rounded-3xl p-4 shadow-xl ring-1 ring-imigongo-clay/20">
                <ImigongoSeal size={148} colorClass="text-imigongo-clay" />
              </div>
            </div>
          </div>
        </section>

        <ImigongoBand variant="parchment" />

        {/* CLOSING — full charcoal section, conviction moment */}
        <section className="relative overflow-hidden hero-mat text-imigongo-cream py-20 md:py-28">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
            aria-hidden="true"
          />
          <div className="container relative grid md:grid-cols-[1fr_1fr] gap-10 md:gap-16 items-center max-w-6xl">
            <div className="relative">
              <div
                className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-rw-gold/30 via-imigongo-ochre/30 to-rw-green/30 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative rounded-[1.75rem] overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-rw-gold/20">
                <img
                  src="/images/design-board.webp"
                  srcSet="/images/design-board-sm.webp 800w, /images/design-board.webp 1400w"
                  sizes="(max-width: 768px) 100vw, 600px"
                  alt="A design board mapping the persona-creation flow."
                  width={1400}
                  height={1217}
                  loading="lazy"
                  className="w-full h-auto block"
                />
                <FlagStripe className="absolute top-0 left-0 right-0" height={4} />
              </div>
            </div>

            <div className="space-y-6">
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                <span className="h-px w-8 bg-rw-gold" />
                Designed deliberately
              </p>
              <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight leading-[1.05]">
                For the people whose words{" "}
                <span className="italic text-rw-gold">have weight.</span>
              </h2>
              <p className="text-lg text-imigongo-cream/80 leading-relaxed max-w-prose">
                Phoenix is built where compromise isn&rsquo;t an option. Every
                choice — what&rsquo;s encrypted, what&rsquo;s signed, what
                survives — was made with one question in mind: what happens
                when someone&rsquo;s safety depends on this?
              </p>

              <div className="pt-2">
                {user ? (
                  <Button
                    asChild
                    size="lg"
                    className="rounded-full px-8 bg-rw-gold text-imigongo-charcoal hover:bg-rw-gold/90 shadow-xl shadow-rw-gold/30"
                  >
                    <Link to="/onboard">
                      Create a persona
                      <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="rounded-full px-8 bg-rw-gold text-imigongo-charcoal hover:bg-rw-gold/90 shadow-xl shadow-rw-gold/30"
                    onClick={() => setAuthOpen(true)}
                  >
                    Sign in to begin
                    <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <FlagStripe height={6} />

        {/* FOOTER — proper charcoal footer with brand mark + links */}
        <footer className="relative bg-imigongo-charcoal text-imigongo-cream/80">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.03] pointer-events-none"
            aria-hidden="true"
          />
          <div className="container relative py-14 grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src="/icon.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="rounded-lg"
                />
                <span className="font-display font-semibold text-2xl text-imigongo-cream">
                  Phoenix
                </span>
              </div>
              <p className="text-sm text-imigongo-cream/60 max-w-sm leading-relaxed">
                AI-assisted personas on Nostr. Voices that can be amplified
                but not silenced. Built with care for the people whose words
                have weight.
              </p>
              <div className="pt-2">
                <ImigongoSeal size={32} colorClass="text-rw-gold/70" />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                The product
              </p>
              <ul className="space-y-2 text-sm">
                {user ? (
                  <>
                    <li>
                      <Link
                        to="/my-personas"
                        className="hover:text-rw-gold transition-colors"
                      >
                        My personas
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/onboard"
                        className="hover:text-rw-gold transition-colors"
                      >
                        Create a persona
                      </Link>
                    </li>
                  </>
                ) : (
                  <li>
                    <button
                      type="button"
                      onClick={() => setAuthOpen(true)}
                      className="hover:text-rw-gold transition-colors"
                    >
                      Sign in
                    </button>
                  </li>
                )}
              </ul>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                The work
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://github.com/Phoenix-Persona/phoenix-pwa"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-rw-gold transition-colors"
                  >
                    Open source
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/nostr-protocol/nips"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-rw-gold transition-colors"
                  >
                    Nostr protocol
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-imigongo-cream/10">
            <div className="container py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-imigongo-cream/50">
              <span>
                © {new Date().getFullYear()} Phoenix. Built for voices that
                can&rsquo;t be silenced.
              </span>
              <span className="font-mono">
                Encrypted · Signed · Replicated
              </span>
            </div>
          </div>
        </footer>
      </main>

      <AuthDialog isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
};

export default Index;
