/**
 * Chapter 04 — Sustain
 *
 * Persona disc at the center; three "donation" bolts arrive from the
 * cardinal points; one outgoing arrow flows down to a small ledger row
 * labelled "AI inference paid". Each layer fades in via useInView so the
 * animation lands as the chapter scrolls into view, matching the rhythm
 * of the other three visuals.
 */

import { useInView } from "@/hooks/useInView";

const VB = 480;
const CX = VB / 2;
const CY = VB / 2 - 40;

interface Donor {
  /** angle in degrees, 0 = right, increasing counter-clockwise */
  angle: number;
  radius: number;
  amount: string;
  /** flag emoji to suggest "from anywhere" without using flag images */
  origin: string;
}

const DONORS: Donor[] = [
  { angle: 35, radius: 175, amount: "+ 2,400 sats", origin: "🇸🇪" },
  { angle: 145, radius: 175, amount: "+ 800 sats", origin: "🇧🇷" },
  { angle: 230, radius: 175, amount: "+ 5,000 sats", origin: "🇰🇪" },
];

function donorXY(d: Donor) {
  const rad = (d.angle * Math.PI) / 180;
  return {
    x: CX + d.radius * Math.cos(rad),
    y: CY - d.radius * Math.sin(rad),
  };
}

export function SustainVisual() {
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
          {/* Faint Imigongo diamond backdrop */}
          <g opacity="0.18">
            <path
              d={`M ${CX} ${CY - 200} L ${CX + 200} ${CY} L ${CX} ${CY + 200} L ${CX - 200} ${CY} Z`}
              fill="none"
              stroke="var(--imigongo-clay)"
              strokeWidth="1.2"
            />
            <path
              d={`M ${CX} ${CY - 180} L ${CX + 180} ${CY} L ${CX} ${CY + 180} L ${CX - 180} ${CY} Z`}
              fill="none"
              stroke="var(--imigongo-clay)"
              strokeWidth="0.8"
            />
          </g>

          {/* Incoming donation streams — animated draw-in */}
          {DONORS.map((d, i) => {
            const { x, y } = donorXY(d);
            const length = Math.hypot(x - CX, y - CY);
            const delay = i * 150;
            return (
              <line
                key={`stream-${i}`}
                x1={x}
                y1={y}
                x2={CX}
                y2={CY}
                stroke="var(--rw-gold)"
                strokeWidth="1.4"
                strokeOpacity="0.65"
                strokeDasharray={length}
                strokeDashoffset={inView ? 0 : length}
                style={{
                  transition: `stroke-dashoffset 1100ms ease-out ${delay}ms`,
                }}
              />
            );
          })}

          {/* Central radial halo (gold for sats) */}
          <circle
            cx={CX}
            cy={CY}
            r={56}
            fill="var(--rw-gold)"
            opacity="0.20"
          />
          <circle
            cx={CX}
            cy={CY}
            r={36}
            fill="var(--imigongo-clay)"
            opacity="0.10"
          />

          {/* Persona avatar disc */}
          <circle
            cx={CX}
            cy={CY}
            r={28}
            fill="var(--card)"
            stroke="var(--imigongo-clay)"
            strokeWidth="2"
          />
          {/* Lightning bolt inside the disc */}
          <path
            d={`M ${CX - 7} ${CY - 12} L ${CX + 4} ${CY - 12} L ${CX - 2} ${CY - 1} L ${CX + 8} ${CY - 1} L ${CX - 6} ${CY + 14} L ${CX + 1} ${CY + 2} L ${CX - 8} ${CY + 2} Z`}
            fill="var(--rw-gold)"
            opacity="0.95"
          />

          {/* Donor nodes — pulse in after their stream draws */}
          {DONORS.map((d, i) => {
            const { x, y } = donorXY(d);
            const delay = i * 150 + 700;
            return (
              <g
                key={`donor-${i}`}
                style={{
                  transition: `opacity 400ms ease-out ${delay}ms, transform 400ms ease-out ${delay}ms`,
                  transformOrigin: `${x}px ${y}px`,
                  opacity: inView ? 1 : 0,
                  transform: inView ? "scale(1)" : "scale(0.4)",
                }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={11}
                  fill="var(--rw-gold)"
                  opacity="0.22"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={5.5}
                  fill="var(--rw-gold)"
                  stroke="var(--card)"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {/* Outflow: persona → AI inference (rendered as a downward arrow) */}
          <g
            style={{
              transition: "opacity 600ms ease-out 1400ms, transform 600ms ease-out 1400ms",
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0)" : "translateY(-8px)",
            }}
          >
            <line
              x1={CX}
              y1={CY + 32}
              x2={CX}
              y2={CY + 110}
              stroke="var(--imigongo-clay)"
              strokeWidth="1.4"
              strokeOpacity="0.55"
              strokeDasharray="4 4"
            />
            <path
              d={`M ${CX - 6} ${CY + 104} L ${CX} ${CY + 116} L ${CX + 6} ${CY + 104}`}
              fill="none"
              stroke="var(--imigongo-clay)"
              strokeWidth="1.4"
              strokeOpacity="0.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>

        {/* Donor amount labels — overlaid HTML so the typography matches the rest of the page */}
        {DONORS.map((d, i) => {
          const { x, y } = donorXY(d);
          const xPct = (x / VB) * 100;
          const yPct = (y / VB) * 100;
          const onLeft = x < CX;
          const delay = i * 150 + 800;
          return (
            <span
              key={`label-${i}`}
              className="hidden sm:block absolute font-mono text-[10px] text-muted-foreground whitespace-nowrap pointer-events-none motion-safe:transition-opacity motion-safe:duration-500"
              style={{
                left: `${xPct}%`,
                top: `${yPct}%`,
                transform: `translate(${onLeft ? "-100%" : "0"}, -50%) translateX(${onLeft ? "-12px" : "12px"})`,
                opacity: inView ? 1 : 0,
                transitionDelay: `${delay}ms`,
              }}
            >
              <span className="mr-1">{d.origin}</span>
              <span className="text-imigongo-charcoal/80">{d.amount}</span>
            </span>
          );
        })}
      </div>

      {/* AI-inference ledger row */}
      <div className="mt-2 border-t border-dashed border-border pt-6 space-y-4">
        <div
          className="flex items-center justify-between gap-3 motion-safe:transition-opacity motion-safe:duration-700 motion-safe:delay-[1500ms] data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
          data-visible={inView}
        >
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-rw-green" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">
              AI inference paid · automatically
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-rw-green-deep">
            persona-funded
          </span>
        </div>

        <p
          className="font-display italic text-base md:text-lg text-imigongo-charcoal/80 leading-relaxed motion-safe:transition-all motion-safe:duration-700 motion-safe:delay-[2000ms] data-[visible=false]:opacity-0 data-[visible=false]:translate-y-1 data-[visible=true]:opacity-100 data-[visible=true]:translate-y-0"
          data-visible={inView}
        >
          &ldquo;The voice the world believes in pays for itself.&rdquo;
        </p>
      </div>
    </div>
  );
}
