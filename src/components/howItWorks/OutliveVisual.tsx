/**
 * Chapter 03 — Outlive
 *
 * SVG constellation: a central Imigongo seal radiating to a ring of relay
 * nodes. Lines draw in via stroke-dashoffset on scroll-into-view. Beneath,
 * the operator silhouette is shown faded/struck-through, while the
 * constellation continues to glow. The italic punchline lands the moral
 * payload.
 */

import { useInView } from "@/hooks/useInView";

interface RelayNode {
  url: string;
  /** angle in degrees, 0 = right, increasing counter-clockwise */
  angle: number;
  /** radius from center */
  radius: number;
  /** node tint color css var */
  color: "rw-green" | "rw-gold" | "imigongo-ochre";
}

const RELAYS: RelayNode[] = [
  { url: "relay.damus.io", angle: 18, radius: 165, color: "rw-gold" },
  { url: "relay.primal.net", angle: 62, radius: 175, color: "rw-green" },
  { url: "nos.lol", angle: 105, radius: 160, color: "imigongo-ochre" },
  { url: "relay.snort.social", angle: 148, radius: 175, color: "rw-gold" },
  { url: "eden.nostr.land", angle: 195, radius: 165, color: "rw-green" },
  { url: "nostr.wine", angle: 235, radius: 175, color: "imigongo-ochre" },
  { url: "relay.nostr.band", angle: 280, radius: 160, color: "rw-gold" },
  { url: "relay.ditto.pub", angle: 325, radius: 175, color: "rw-green" },
];

const VB = 480; // viewBox size, square
const CX = VB / 2;
const CY = VB / 2;

function nodeXY(n: RelayNode): { x: number; y: number } {
  const rad = (n.angle * Math.PI) / 180;
  return {
    x: CX + n.radius * Math.cos(rad),
    y: CY - n.radius * Math.sin(rad),
  };
}

function colorVar(c: RelayNode["color"]): string {
  switch (c) {
    case "rw-green":
      return "var(--rw-green)";
    case "rw-gold":
      return "var(--rw-gold)";
    case "imigongo-ochre":
      return "var(--imigongo-ochre)";
  }
}

export function OutliveVisual() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <div
      ref={ref}
      className="relative w-full max-w-[520px] mx-auto rounded-2xl bg-card border border-imigongo-clay/15 shadow-sm p-5 sm:p-6"
      data-visible={inView}
    >
      <div className="relative aspect-square">
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="w-full h-full"
          aria-hidden="true"
        >
          {/* Outer Imigongo diamond as a faint backdrop */}
          <g opacity="0.18">
            <path
              d={`M ${CX} ${CY - 220} L ${CX + 220} ${CY} L ${CX} ${CY + 220} L ${CX - 220} ${CY} Z`}
              fill="none"
              stroke="var(--imigongo-clay)"
              strokeWidth="1.2"
            />
            <path
              d={`M ${CX} ${CY - 200} L ${CX + 200} ${CY} L ${CX} ${CY + 200} L ${CX - 200} ${CY} Z`}
              fill="none"
              stroke="var(--imigongo-clay)"
              strokeWidth="0.8"
            />
          </g>

          {/* Connecting lines from center to each node — stroke-dashoffset
              animation for the draw-in effect */}
          {RELAYS.map((n, i) => {
            const { x, y } = nodeXY(n);
            // approximate path length for dasharray
            const length = Math.hypot(x - CX, y - CY);
            const delay = i * 80;
            return (
              <line
                key={n.url}
                x1={CX}
                y1={CY}
                x2={x}
                y2={y}
                stroke="var(--imigongo-clay)"
                strokeWidth="1"
                strokeOpacity="0.6"
                strokeDasharray={length}
                strokeDashoffset={inView ? 0 : length}
                style={{
                  transition: `stroke-dashoffset 900ms ease-out ${delay}ms`,
                }}
              />
            );
          })}

          {/* Central radial halo */}
          <circle
            cx={CX}
            cy={CY}
            r={56}
            fill="var(--rw-gold)"
            opacity="0.18"
          />
          <circle
            cx={CX}
            cy={CY}
            r={36}
            fill="var(--imigongo-clay)"
            opacity="0.10"
          />

          {/* Center: re-drawn Imigongo seal (matches ImigongoSeal motif). */}
          <g transform={`translate(${CX - 44}, ${CY - 44})`}>
            <g color="var(--imigongo-clay)">
              <path
                d="M44 4 L84 44 L44 84 L4 44 Z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                opacity="0.7"
              />
              <path
                d="M44 18 L70 44 L44 70 L18 44 Z"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
                opacity="0.6"
              />
              <path
                d="M44 30 L58 44 L44 58 L30 44 Z"
                fill="currentColor"
                opacity="0.32"
              />
              <path
                d="M44 30 L58 44 L44 44 Z"
                fill="currentColor"
                opacity="0.75"
              />
              <path
                d="M44 58 L30 44 L44 44 Z"
                fill="currentColor"
                opacity="0.75"
              />
            </g>
          </g>

          {/* Relay nodes — appear after their line draws */}
          {RELAYS.map((n, i) => {
            const { x, y } = nodeXY(n);
            const delay = i * 80 + 600;
            return (
              <g
                key={`node-${n.url}`}
                style={{
                  transition: `opacity 400ms ease-out ${delay}ms, transform 400ms ease-out ${delay}ms`,
                  transformOrigin: `${x}px ${y}px`,
                  opacity: inView ? 1 : 0,
                  transform: inView ? "scale(1)" : "scale(0.4)",
                }}
              >
                {/* Glow */}
                <circle
                  cx={x}
                  cy={y}
                  r={11}
                  fill={colorVar(n.color)}
                  opacity="0.22"
                />
                {/* Node */}
                <circle
                  cx={x}
                  cy={y}
                  r={5.5}
                  fill={colorVar(n.color)}
                  stroke="var(--card)"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}
        </svg>

        {/* Relay labels — overlaid HTML so they pick up the system font */}
        {RELAYS.map((n, i) => {
          const { x, y } = nodeXY(n);
          const xPct = (x / VB) * 100;
          const yPct = (y / VB) * 100;
          const onLeft = x < CX;
          const delay = i * 80 + 700;
          return (
            <span
              key={`label-${n.url}`}
              className="hidden sm:block absolute font-mono text-[10px] text-muted-foreground whitespace-nowrap pointer-events-none motion-safe:transition-opacity motion-safe:duration-500"
              style={{
                left: `${xPct}%`,
                top: `${yPct}%`,
                transform: `translate(${onLeft ? "-100%" : "0"}, -50%) translateX(${onLeft ? "-12px" : "12px"})`,
                opacity: inView ? 1 : 0,
                transitionDelay: `${delay}ms`,
              }}
            >
              {n.url}
            </span>
          );
        })}
      </div>

      {/* Operator-silenced tableau */}
      <div className="mt-8 border-t border-dashed border-border pt-6 space-y-4">
        <div
          className="flex items-center gap-3 motion-safe:transition-opacity motion-safe:duration-700 motion-safe:delay-1500 data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
          data-visible={inView}
        >
          {/* Operator silhouette, struck through */}
          <div className="relative size-10 shrink-0 rounded-full bg-muted grid place-items-center text-muted-foreground/50">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-6"
              aria-hidden="true"
            >
              <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" />
            </svg>
            <span
              aria-hidden="true"
              className="absolute inset-x-1 top-1/2 h-px bg-imigongo-clay -rotate-12"
            />
          </div>
          <div className="text-sm text-muted-foreground leading-snug">
            <span className="line-through opacity-70">Operator silenced</span>
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-rw-green-deep">
              · constellation continues
            </span>
          </div>
        </div>

        <p
          className="font-display italic text-base md:text-lg text-imigongo-charcoal/80 leading-relaxed motion-safe:transition-all motion-safe:duration-700 motion-safe:delay-2000 data-[visible=false]:opacity-0 data-[visible=false]:translate-y-1 data-[visible=true]:opacity-100 data-[visible=true]:translate-y-0"
          data-visible={inView}
        >
          &ldquo;Even if the operator is silenced, the relays remember.&rdquo;
        </p>
      </div>
    </div>
  );
}
