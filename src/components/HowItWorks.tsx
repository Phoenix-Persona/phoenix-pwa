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
import { SustainVisual } from "./howItWorks/SustainVisual";

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
          Four steps. One unstoppable voice.
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
            Every post is saved across dozens of independent servers around
            the world — no single government or platform can delete it. No
            server to seize. No company to pressure. No account to ban. Lose
            your phone, flee the country, switch devices — your persona is
            fully restored in seconds. Pass it to someone you trust, and the
            voice keeps speaking. Unchanged.
          </>
        }
        pills={[
          "Replicated globally",
          "No central server",
          "No takedown surface",
          "Successor-resilient",
        ]}
        visual={<OutliveVisual />}
      />

      <Chapter
        reverse
        number="04"
        eyebrow="Sustain"
        headline={
          <>
            A voice that{" "}
            <span className="italic text-rw-gold">funds itself.</span>
          </>
        }
        body={
          <>
            Each persona has its own Bitcoin wallet — created at setup, locked
            to the persona, never held by Zuka. Supporters anywhere in the
            world can send Bitcoin directly to the voice they believe in.
            Donations automatically fund the AI that keeps it speaking.
          </>
        }
        pills={[
          "Per-persona wallet",
          "Lightning Address",
          "Borderless donations",
          "Self-funding AI",
        ]}
        visual={<SustainVisual />}
      />
    </section>
  );
}
