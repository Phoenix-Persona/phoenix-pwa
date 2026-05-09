/**
 * Imigongo-rooted decorative components.
 *
 * `ImigongoBand` — horizontal repeating pattern strip used as a section
 *                  divider. Color comes from `text-*` utility on the wrapper.
 * `ImigongoSeal` — a single Imigongo tile rendered inline; useful as a
 *                  decorative seal next to headings or beside a verification
 *                  block.
 */

import { cn } from "@/lib/utils";

interface ImigongoBandProps {
  className?: string;
  height?: number;
  /** "muted" softens with reduced opacity; "bold" uses full opacity. */
  variant?: "muted" | "default" | "bold";
}

export function ImigongoBand({
  className,
  height = 28,
  variant = "default",
}: ImigongoBandProps) {
  const opacity =
    variant === "bold" ? "opacity-100" : variant === "muted" ? "opacity-40" : "opacity-70";
  return (
    <div
      className={cn(
        "imigongo-pattern w-full text-imigongo-clay",
        opacity,
        className
      )}
      style={{ height }}
      aria-hidden="true"
    />
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
