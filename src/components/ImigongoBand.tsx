/**
 * Imigongo-rooted decorative components.
 *
 * `ImigongoBand` — horizontal repeating pattern strip used as a section
 *                  divider. Color comes from `text-*` utility on the wrapper.
 * `ImigongoSeal` — a single Imigongo tile rendered inline; useful as a
 *                  decorative seal next to headings or beside a verification
 *                  block.
 * `FlagStripe`   — Rwandan-flag three-color band (sky + gold + green).
 *                  Matches the modern (2001+) Rwandan flag. Used as a
 *                  confident architectural divider.
 */

import { cn } from "@/lib/utils";

interface ImigongoBandProps {
  className?: string;
  height?: number;
  /**
   * `bold`     — full opacity, the default for confident dividers.
   * `default`  — 80% opacity, blends with solid section backgrounds.
   * `muted`    — 50% opacity, subtle on cream surfaces.
   * `parchment` — pattern atop a cream wash mat for double-height dividers.
   */
  variant?: "muted" | "default" | "bold" | "parchment";
}

export function ImigongoBand({
  className,
  height,
  variant = "bold",
}: ImigongoBandProps) {
  const opacity =
    variant === "bold"
      ? "opacity-100"
      : variant === "muted"
      ? "opacity-50"
      : variant === "parchment"
      ? "opacity-90"
      : "opacity-80";

  // Default heights per variant — bigger than the legacy 28px sliver.
  const fallbackHeight =
    variant === "parchment" ? 96 : variant === "muted" ? 36 : 56;

  const resolvedHeight = height ?? fallbackHeight;

  if (variant === "parchment") {
    // Layered: cream wash mat with the pattern at full strength on top.
    return (
      <div
        className={cn("relative w-full overflow-hidden", className)}
        style={{ height: resolvedHeight }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 cream-wash" />
        <div
          className={cn("absolute inset-0 imigongo-pattern text-imigongo-clay", opacity)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "imigongo-pattern w-full text-imigongo-clay",
        opacity,
        className
      )}
      style={{ height: resolvedHeight }}
      aria-hidden="true"
    />
  );
}

interface FlagStripeProps {
  className?: string;
  height?: number;
}

/**
 * Rwandan-flag three-band divider — sky-blue + sun-gold + hills-green.
 * Matches the modern (2001+) Rwandan flag. Confident architectural
 * rule that doubles as a brand mark.
 */
export function FlagStripe({ className, height = 6 }: FlagStripeProps) {
  return (
    <div
      className={cn("flex w-full", className)}
      style={{ height }}
      aria-hidden="true"
    >
      <div className="flex-1 bg-rw-sky" />
      <div className="flex-1 bg-rw-gold" />
      <div className="flex-1 bg-rw-green" />
    </div>
  );
}

interface ImigongoSealProps {
  className?: string;
  size?: number;
  /** Override color via tailwind text-* utility */
  colorClass?: string;
}

export function ImigongoSeal({
  className,
  size = 56,
  colorClass = "text-imigongo-clay",
}: ImigongoSealProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 112 112"
      width={size}
      height={size}
      fill="none"
      className={cn(colorClass, className)}
      aria-hidden="true"
    >
      {/* outer diamond */}
      <path
        d="M56 4 L108 56 L56 108 L4 56 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        opacity="0.7"
      />
      {/* inner diamond */}
      <path
        d="M56 22 L90 56 L56 90 L22 56 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        opacity="0.6"
      />
      {/* core square (rotated) */}
      <path
        d="M56 38 L74 56 L56 74 L38 56 Z"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M56 38 L74 56 L56 74 L38 56 Z"
        stroke="currentColor"
        strokeWidth="0.8"
        fill="none"
        opacity="0.7"
      />
      {/* spiral quadrant triangles */}
      <path d="M56 38 L66 56 L56 56 Z" fill="currentColor" opacity="0.7" />
      <path d="M56 74 L46 56 L56 56 Z" fill="currentColor" opacity="0.7" />
      {/* corner accents */}
      <path d="M0 0 L20 0 L0 20 Z" fill="currentColor" opacity="0.5" />
      <path d="M112 0 L92 0 L112 20 Z" fill="currentColor" opacity="0.5" />
      <path d="M0 112 L20 112 L0 92 Z" fill="currentColor" opacity="0.5" />
      <path d="M112 112 L92 112 L112 92 Z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
