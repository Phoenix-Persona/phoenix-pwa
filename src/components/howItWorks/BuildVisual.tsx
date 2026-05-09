/**
 * Chapter 01 — Build
 *
 * Staged product mockup of the persona-creation moment. Card shows a
 * filled-in "New persona" form, then animates a fresh keypair appearing
 * line by line on scroll-into-view. The keypair line is the technical
 * proof that the persona is independent of the operator.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";

import { useInView } from "@/hooks/useInView";

const NPUB = "npub1k2rj0pgz4r8s7wlnvc3xeyvg9d5q3xvqz9j5pra2y0wuhe6r4nzs6t";
const FULL_NSEC_MASK = "nsec1✱✱✱✱✱✱✱✱✱✱✱✱✱✱✱✱✱✱✱✱";

function useTypewriter(
  text: string,
  active: boolean,
  msPerChar = 22,
  startDelay = 250
): string {
  const [out, setOut] = useState("");

  useEffect(() => {
    if (!active) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cancelled = false;

    // Reduced-motion: jump straight to the full text on the next microtask.
    if (reduced || typeof window === "undefined") {
      queueMicrotask(() => {
        if (!cancelled) setOut(text);
      });
      return () => {
        cancelled = true;
      };
    }

    // Normal path: animate character-by-character.
    queueMicrotask(() => {
      if (!cancelled) setOut("");
    });

    let i = 0;
    const start = window.setTimeout(() => {
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setOut(text.slice(0, i));
        if (i < text.length) {
          window.setTimeout(tick, msPerChar);
        }
      };
      tick();
    }, startDelay);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [text, active, msPerChar, startDelay]);

  return out;
}

export function BuildVisual() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35 });
  const npub = useTypewriter(NPUB, inView, 18, 350);
  const nsec = useTypewriter(FULL_NSEC_MASK, inView, 35, 350 + NPUB.length * 18);

  const npubDone = npub.length === NPUB.length;
  const nsecDone = nsec.length === FULL_NSEC_MASK.length;

  return (
    <div
      ref={ref}
      className="relative w-full max-w-[520px] mx-auto"
      data-visible={inView}
    >
      {/* Soft Imigongo wash behind, tilted */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 rotate-[-4deg] imigongo-pattern text-imigongo-clay opacity-[0.07] rounded-[2.5rem]"
      />

      {/* Mockup card */}
      <div className="relative rounded-[1.75rem] bg-card ring-1 ring-imigongo-clay/20 shadow-2xl shadow-imigongo-charcoal/15 overflow-hidden">
        {/* Brand stripe */}
        <div
          aria-hidden="true"
          className="h-1 bg-gradient-to-r from-imigongo-clay via-rw-gold to-rw-green"
        />

        <div className="p-6 md:p-7 space-y-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-base font-medium tracking-tight text-imigongo-charcoal">
              New persona
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-imigongo-clay">
              Step 5 of 5
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <Field label="Name" value="Iyongera — The Voice" />
            <Field label="Cause" value="Press freedom in the Great Lakes" />
            <div className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
                Sources
              </span>
              <div className="flex flex-wrap gap-1.5">
                <SourceChip>jeune-afrique.com</SourceChip>
                <SourceChip>hrw.org/africa/rwanda</SourceChip>
                <SourceChip>RSF · 2026 report</SourceChip>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-border" />

          {/* Keypair generation moment */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-imigongo-clay font-semibold">
              <KeyRound className="size-3.5" aria-hidden="true" />
              Persona keypair
              <span className="ml-auto font-mono text-[10px] tracking-normal normal-case text-muted-foreground">
                generated locally
              </span>
            </div>

            <KeyLine label="npub" value={npub} done={npubDone} active={inView} />
            <KeyLine label="nsec" value={nsec} done={nsecDone} active={inView} />

            <p className="text-xs text-muted-foreground motion-safe:transition-opacity motion-safe:duration-500 motion-safe:delay-1000 data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
               data-visible={nsecDone}>
              Encrypted to your Nostr key. Never written to a server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
        {label}
      </span>
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground">
        {value}
      </div>
    </div>
  );
}

function SourceChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-imigongo-clay/25 bg-imigongo-cream px-2.5 py-1 text-[11px] font-medium text-imigongo-charcoal">
      {children}
    </span>
  );
}

function KeyLine({
  label,
  value,
  done,
  active,
}: {
  label: string;
  value: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-md bg-imigongo-charcoal/95 px-3 py-2 font-mono text-[12px] text-imigongo-cream/90"
      data-visible={active}
    >
      <span className="shrink-0 text-imigongo-ochre/90 select-none">
        {label} ›
      </span>
      <span className="flex-1 break-all leading-relaxed">
        {value}
        {active && !done && (
          <span
            className="inline-block w-[7px] h-[14px] -mb-[2px] ml-0.5 bg-rw-gold motion-safe:animate-pulse"
            aria-hidden="true"
          />
        )}
      </span>
      <CheckCircle2
        className="size-3.5 shrink-0 text-rw-green motion-safe:transition-opacity motion-safe:duration-300 data-[visible=false]:opacity-0 data-[visible=true]:opacity-100"
        data-visible={done}
        aria-hidden="true"
      />
    </div>
  );
}
