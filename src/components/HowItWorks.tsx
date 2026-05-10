/**
 * "How it works" — three full-width editorial chapters.
 *
 * Replaces the old 3-card text grid. Each chapter is a two-column
 * layout (alternating zig-zag) of marginalia + headline + body + tag pills
 * on one side, and a bespoke visual artifact on the other. On mobile, the
 * visual stacks below the copy so reading order stays intact.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

import { BuildVisual } from "./howItWorks/BuildVisual";
import { SpeakVisual } from "./howItWorks/SpeakVisual";
import { OutliveVisual } from "./howItWorks/OutliveVisual";

interface ChapterProps {
  number: string;
  eyebrow: string;
  headline: ReactNode;
  body: ReactNode;
  pills: string[];
  visual: ReactNode;
  /** When true, render the visual on the left (desktop). */
  reverse?: boolean;
}

function Chapter({
  number,
  eyebrow,
  headline,
  body,
  pills,
  visual,
  reverse,
}: ChapterProps) {
  return (
    <div
      className={cn(
        "grid md:grid-cols-2 gap-10 md:gap-16 items-center",
        reverse && "md:[&>*:first-child]:order-2"
      )}
    >
      {/* Copy column */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
          <span>{number}</span>
          <span className="h-px flex-1 max-w-[60px] bg-imigongo-clay/40" />
          <span>{eyebrow}</span>
        </div>
        <h3 className="font-display text-3xl md:text-5xl font-medium tracking-tight leading-[1.05]">
          {headline}
        </h3>
        {/* Body sits on a clean white reading surface so the patterned
            section background doesn't fight the prose. */}
        <div className="rounded-2xl bg-card border border-imigongo-clay/15 shadow-sm p-6 max-w-prose">
          <p className="text-lg text-foreground leading-relaxed">{body}</p>
        </div>
        <ul className="flex flex-wrap gap-1.5 pt-2">
          {pills.map((p) => (
            <li
              key={p}
              className="inline-flex items-center rounded-full border border-imigongo-clay/20 bg-card px-2.5 py-1 text-[11px] font-medium text-imigongo-charcoal/80 shadow-sm"
            >
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* Visual column */}
      <div className="w-full">{visual}</div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="container py-20 md:py-28 max-w-6xl space-y-20 md:space-y-28">
      {/* Section eyebrow */}
      <div className="max-w-2xl space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
          How it works
        </p>
        <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
          Three steps. One unstoppable voice.
        </h2>
      </div>

      <Chapter
        number="01"
        eyebrow="Build"
        headline={
          <>
            Forge a voice the world has{" "}
            <span className="italic text-imigongo-clay">never heard.</span>
          </>
        }
        body={
          <>
            Choose the cause. Curate the sources it speaks from. Shape the
            tone, the cadence, the conviction. Zuka creates the persona&rsquo;s
            own keypair on creation — a fresh identity, cryptographically
            separate from yours.
          </>
        }
        pills={[
          "Fresh keypair",
          "Curated sources",
          "Voice profile",
          "No operator linkage on-chain",
        ]}
        visual={<BuildVisual />}
      />

      <Chapter
        reverse
        number="02"
        eyebrow="Speak"
        headline={
          <>
            Your brief. Their voice.{" "}
            <span className="italic text-rw-green-deep">Everywhere at once.</span>
          </>
        }
        body={
          <>
            Drop in your idea, your sources, a few style hints. Zuka
            generates the video in the persona&rsquo;s likeness and voice,
            posts it to Nostr signed by the persona&rsquo;s key, and
            cross-posts it to X, Facebook, and Instagram in the same
            click. You stay invisible. The persona reaches everywhere.
          </>
        }
        pills={[
          "Video generation",
          "Auto-cited",
          "Signed by persona",
          "Cross-posted to X / Facebook / Instagram",
        ]}
        visual={<SpeakVisual />}
      />

      <Chapter
        number="03"
        eyebrow="Outlive"
        headline={
          <>
            A voice no power can{" "}
            <span className="italic text-imigongo-clay">take down.</span>
          </>
        }
        body={
          <>
            Every post lives on dozens of public Nostr relays — independently
            operated, globally distributed, censorship-resistant by design.
            Silence the operator and the voice keeps speaking. Hand the
            persona to a successor, and the voice continues — same key, same
            conviction.
          </>
        }
        pills={[
          "Replicated to N relays",
          "Successor-resilient",
          "No central server",
          "No takedown surface",
        ]}
        visual={<OutliveVisual />}
      />
    </section>
  );
}
