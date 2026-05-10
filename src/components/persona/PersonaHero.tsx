import type { ReactNode } from "react";

import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { cn } from "@/lib/utils";

export interface PersonaHeroProps {
  eyebrow: string;
  name: string;
  bio?: string;
  pictureUrl: string | null;
  avatarSize: "dashboard" | "public";
  badges?: ReactNode;
  actions?: ReactNode;
}

const avatarClasses = {
  dashboard: {
    frame: "w-24 h-24 md:w-28 md:h-28",
    seal: 56,
    padding: "py-10 md:py-14",
  },
  public: {
    frame: "w-28 h-28 md:w-32 md:h-32",
    seal: 72,
    padding: "py-12 md:py-16",
  },
} as const;

export function PersonaHero({
  eyebrow,
  name,
  bio,
  pictureUrl,
  avatarSize,
  badges,
  actions,
}: PersonaHeroProps) {
  const size = avatarClasses[avatarSize];

  return (
    <section className="relative overflow-hidden hero-mat text-imigongo-cream">
      <div
        className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -top-40 -right-32 w-[36rem] h-[36rem] rounded-full bg-rw-gold/10 blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className={cn("container relative max-w-4xl", size.padding)}>
        <div className="flex items-start gap-6 flex-wrap md:flex-nowrap">
          <div className="relative flex-shrink-0">
            <div
              className="absolute -inset-2 rounded-full bg-gradient-to-br from-rw-gold/40 via-imigongo-ochre/40 to-imigongo-clay/40 blur-2xl"
              aria-hidden="true"
            />
            <div
              className={cn(
                "relative rounded-full overflow-hidden ring-2 ring-rw-gold/40 shadow-2xl shadow-black/40 bg-imigongo-charcoal flex items-center justify-center",
                size.frame,
              )}
            >
              {pictureUrl ? (
                <img
                  src={pictureUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="eager"
                  crossOrigin="anonymous"
                />
              ) : (
                <ImigongoSeal
                  size={size.seal}
                  colorClass="text-rw-gold/80"
                />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
              <span className="h-px w-6 bg-rw-gold" />
              {eyebrow}
            </p>
            <h1 className="font-display text-3xl md:text-5xl font-medium tracking-tight leading-tight">
              {name}
            </h1>
            {bio ? (
              <p className="text-imigongo-cream/85 max-w-2xl leading-relaxed">
                {bio}
              </p>
            ) : null}
            {badges}
            {actions}
          </div>
        </div>
      </div>
      <FlagStripe height={4} />
    </section>
  );
}
