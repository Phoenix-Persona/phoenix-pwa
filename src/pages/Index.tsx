import { Link } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { ImigongoBand } from "@/components/ImigongoBand";
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

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 imigongo-pattern text-imigongo-clay opacity-[0.07] pointer-events-none" />
          <div className="container relative py-20 md:py-32 grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-imigongo-clay/30 bg-imigongo-clay/5 px-3 py-1 text-xs font-medium text-imigongo-clay">
                <span className="size-1.5 rounded-full bg-imigongo-clay animate-pulse" />
                AI Hack for Freedom · HRF
              </div>
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                Voices that <span className="text-primary">can't be silenced.</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-xl">
                Phoenix lets activists spin up an AI-assisted persona that lives on Nostr.
                Dictators kill people. Phoenix keeps the voice alive.
              </p>
              <div className="flex flex-wrap gap-3">
                {user ? (
                  <>
                    <Button asChild size="lg" className="rounded-full px-8">
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
              <p className="text-sm text-muted-foreground">
                Sign in with your Nostr identity to create a persona.
                Your persona gets its own keypair and posts independently.
              </p>
            </div>

            <div className="relative aspect-square max-w-md mx-auto w-full">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-imigongo-ochre/40 via-imigongo-clay/30 to-imigongo-charcoal/20 blur-3xl" />
              <img
                src="/icon.svg"
                alt=""
                className="relative z-10 w-full h-full drop-shadow-2xl motion-safe:animate-pulse"
                style={{ animationDuration: "6s" }}
              />
            </div>
          </div>
        </section>

        <ImigongoBand />

        {/* How it works */}
        <section className="container py-20 space-y-12">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              How Phoenix works
            </h2>
            <p className="mt-3 text-muted-foreground text-lg">
              Three layers. None of them depend on a single point of failure.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: "01",
                title: "Build the persona",
                body: "Walk through the wizard. Pick a cause and region. Curate sources. Define the voice. Generate the persona's Nostr keypair.",
              },
              {
                n: "02",
                title: "Speak through it",
                body: "Type a raw thought. The persona's AI styles it in voice. Preview, then publish. Posts are signed by the persona — not you.",
              },
              {
                n: "03",
                title: "Outlive censorship",
                body: "Posts live on Nostr relays around the world. Kill the operator's machine — content survives. Anyone can resume the voice.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="relative rounded-2xl border border-border bg-card p-6 space-y-3"
              >
                <div className="font-mono text-xs text-imigongo-clay tracking-widest">
                  {s.n}
                </div>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <ImigongoBand />

        {/* Mission */}
        <section className="container py-20 max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            For Rwanda. For every silenced cause.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Activists get arrested, exiled, killed. Their voice dies with them.
            Phoenix amplifies activist voices &mdash; with cryptographic provenance,
            human accountability, and a feed that no government can take down.
          </p>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            The launch persona speaks from Rwanda. The aesthetic is{" "}
            <em>Imigongo</em> &mdash; traditional Rwandan geometric art &mdash; because
            every persona inherits the visual heritage of its region.
          </p>
        </section>

        <footer className="border-t border-border py-8">
          <div className="container flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>Built at HRF AI Hack for Freedom</span>
            <span>
              Phoenix is open source &middot;{" "}
              <a
                href="https://soapbox.pub"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
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
