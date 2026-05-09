/**
 * Chapter 02 — Speak
 *
 * Side-by-side mockup: an operator's idea (with sources + style hints)
 * on the left transforms into an AI-generated video posted to Nostr
 * AND cross-posted to Twitter/X / Facebook / Instagram on the right.
 * The transformation arrow between them carries the technical caption.
 *
 * Visual reflects the V1.5 product pivot: video is the primary content
 * format. See `tasks/derek-plan.md` "Cross-post + video composer".
 */

import { ArrowRight, ArrowDown, FileText, Play } from "lucide-react";

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
        {/* LEFT — operator's idea + sources + style hints */}
        <div
          className="rounded-2xl bg-card ring-1 ring-border shadow-md p-4 motion-safe:transition-all motion-safe:duration-500 data-[visible=false]:opacity-0 data-[visible=false]:-translate-x-2 data-[visible=true]:opacity-100 data-[visible=true]:translate-x-0"
          data-visible={inView}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
              Your brief
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              private
            </span>
          </div>

          <p className="font-mono text-[12px] leading-relaxed text-foreground mb-3">
            cover the press house raid. angry but not ranty. 90 sec
            vertical, talking-head style.
          </p>

          {/* Source URLs */}
          <div className="space-y-1 mb-3">
            <p className="text-[9px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
              Sources
            </p>
            <div className="flex items-center gap-1.5">
              <FileText className="size-3 text-imigongo-clay shrink-0" aria-hidden="true" />
              <span className="font-mono text-[10px] text-foreground truncate">
                hrw.org/.../press-raid
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileText className="size-3 text-imigongo-clay shrink-0" aria-hidden="true" />
              <span className="font-mono text-[10px] text-foreground truncate">
                cpj.org/.../detentions
              </span>
            </div>
          </div>

          {/* Style hints */}
          <div className="space-y-1">
            <p className="text-[9px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
              Style hints
            </p>
            <div className="flex flex-wrap gap-1">
              {["measured", "first-person", "cite sources"].map((h) => (
                <span
                  key={h}
                  className="rounded-full bg-imigongo-cream border border-imigongo-clay/20 px-1.5 py-0.5 text-[9px] font-medium text-imigongo-charcoal"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
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

        {/* RIGHT — persona's video post + cross-post badges */}
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

          {/* Video thumbnail with play overlay */}
          <div
            className="relative aspect-[9/16] max-h-40 mx-auto rounded-lg overflow-hidden ring-1 ring-imigongo-clay/20 bg-gradient-to-br from-imigongo-charcoal via-imigongo-clay/40 to-imigongo-ochre/30 motion-safe:transition-all motion-safe:duration-500 motion-safe:delay-400 data-[visible=false]:opacity-0 data-[visible=false]:scale-95 data-[visible=true]:opacity-100 data-[visible=true]:scale-100"
            data-visible={inView}
            aria-label="AI-generated video preview"
          >
            <div
              className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.12]"
              aria-hidden="true"
            />
            <div className="absolute inset-0 grid place-items-center">
              <div className="size-10 rounded-full bg-imigongo-cream/95 grid place-items-center shadow-lg">
                <Play
                  className="size-5 text-imigongo-charcoal translate-x-0.5"
                  aria-hidden="true"
                  fill="currentColor"
                />
              </div>
            </div>
            <div className="absolute bottom-1.5 right-1.5 rounded-md bg-imigongo-charcoal/80 text-imigongo-cream px-1.5 py-0.5 text-[9px] font-mono">
              0:90
            </div>
          </div>

          {/* Caption */}
          <p className="text-[12px] leading-relaxed text-foreground mt-3">
            Yesterday's raid on Press House isn't isolated — and silence
            won't make it the last. The world is watching.
          </p>

          {/* Cross-post + signature row */}
          <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                Posted to
              </span>
              <div
                className="flex items-center gap-1 motion-safe:transition-opacity motion-safe:duration-500 motion-safe:delay-700 data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
                data-visible={inView}
              >
                <PostBadge color="bg-rw-green text-imigongo-cream" label="N" title="Nostr" />
                <PostBadge color="bg-imigongo-charcoal text-imigongo-cream" label="X" title="Twitter / X" />
                <PostBadge color="bg-rw-sky text-imigongo-cream" label="f" title="Facebook" />
                <PostBadge color="bg-imigongo-clay text-imigongo-cream" label="IG" title="Instagram" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Signed by persona
              </span>
              <span className="rounded-full bg-rw-green/15 text-rw-green-deep border border-rw-green/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                Live
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Transformation caption */}
      <div
        className="mt-5 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground motion-safe:transition-opacity motion-safe:duration-500 motion-safe:delay-500 data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
        data-visible={inView}
      >
        <span>video generated</span>
        <span className="text-imigongo-clay">·</span>
        <span>signed by persona</span>
        <span className="text-imigongo-clay">·</span>
        <span>cross-posted</span>
      </div>
    </div>
  );
}

interface PostBadgeProps {
  color: string;
  label: string;
  title: string;
}

function PostBadge({ color, label, title }: PostBadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex size-5 items-center justify-center rounded-full text-[9px] font-bold ${color}`}
    >
      {label}
    </span>
  );
}
