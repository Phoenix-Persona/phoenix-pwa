/**
 * Chapter 02 — Speak
 *
 * Side-by-side mockup: a raw operator thought on the left transforms into
 * a polished, cited, persona-signed post on the right. The transformation
 * arrow between them carries the technical caption.
 */

import { ArrowRight, ArrowDown, FileText } from "lucide-react";

import { useInView } from "@/hooks/useInView";
import { ImigongoSeal } from "@/components/ImigongoBand";

export function SpeakVisual() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <div
      ref={ref}
      className="relative w-full max-w-[640px] mx-auto"
      data-visible={inView}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-2">
        {/* LEFT — operator's raw draft */}
        <div
          className="rounded-2xl bg-card ring-1 ring-border shadow-md p-4 motion-safe:transition-all motion-safe:duration-500 data-[visible=false]:opacity-0 data-[visible=false]:-translate-x-2 data-[visible=true]:opacity-100 data-[visible=true]:translate-x-0"
          data-visible={inView}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
              Your draft
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              private
            </span>
          </div>
          <p className="font-mono text-[13px] leading-relaxed text-foreground">
            need to say something about the press house raid yesterday — angry
            but not ranty. cite the HRW report.
          </p>
        </div>

        {/* CENTER — transformation arrow */}
        <div className="flex flex-row sm:flex-col items-center justify-center gap-2 px-1 py-2">
          <span
            aria-hidden="true"
            className="hidden sm:inline-block text-imigongo-clay motion-safe:transition-all motion-safe:duration-500 motion-safe:delay-300 data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
            data-visible={inView}
          >
            <ArrowRight className="size-5" />
          </span>
          <span
            aria-hidden="true"
            className="sm:hidden text-imigongo-clay motion-safe:transition-all motion-safe:duration-500 motion-safe:delay-300 data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
            data-visible={inView}
          >
            <ArrowDown className="size-5" />
          </span>
        </div>

        {/* RIGHT — persona's published post */}
        <div
          className="rounded-2xl bg-card ring-1 ring-imigongo-clay/30 shadow-xl shadow-imigongo-charcoal/15 p-4 motion-safe:transition-all motion-safe:duration-500 motion-safe:delay-200 data-[visible=false]:opacity-0 data-[visible=false]:translate-x-2 data-[visible=true]:opacity-100 data-[visible=true]:translate-x-0"
          data-visible={inView}
        >
          {/* Persona avatar + name */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className="relative size-8 shrink-0 rounded-full bg-imigongo-cream ring-1 ring-imigongo-clay/30 grid place-items-center">
              <ImigongoSeal size={28} colorClass="text-imigongo-clay" />
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-display text-sm font-medium tracking-tight truncate">
                Iyongera
              </span>
              <span className="font-mono text-[10px] text-muted-foreground truncate">
                npub1k2…6t · just now
              </span>
            </div>
          </div>

          {/* Styled post */}
          <p className="text-[13px] leading-relaxed text-foreground">
            Yesterday's raid on Press House is not the first — and silence will
            not make it the last. Reporters were detained, equipment seized,
            and yet the work continues. The world is watching.
          </p>

          {/* Citation chip */}
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-imigongo-cream border border-imigongo-clay/25 px-2.5 py-1 text-[10px] font-medium text-imigongo-charcoal motion-safe:transition-all motion-safe:duration-300 motion-safe:delay-700 data-[visible=false]:opacity-0 data-[visible=false]:scale-95 data-[visible=true]:opacity-100 data-[visible=true]:scale-100"
            data-visible={inView}
          >
            <FileText className="size-3 text-imigongo-clay" aria-hidden="true" />
            HRW report · 2026-04-12
          </div>

          {/* Publish row */}
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
            <span className="text-[10px] text-muted-foreground">
              Signed by persona
            </span>
            <span className="rounded-full bg-rw-green/15 text-rw-green-deep border border-rw-green/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Transformation caption */}
      <div
        className="mt-5 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground motion-safe:transition-opacity motion-safe:duration-500 motion-safe:delay-500 data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
        data-visible={inView}
      >
        <span>styled in voice</span>
        <span className="text-imigongo-clay">·</span>
        <span>cited</span>
        <span className="text-imigongo-clay">·</span>
        <span>signed by persona</span>
      </div>
    </div>
  );
}
