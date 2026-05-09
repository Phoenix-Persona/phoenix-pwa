/**
 * Trigger a one-shot reveal when an element scrolls into view.
 *
 * Usage:
 *   const { ref, inView } = useInView();
 *   <div ref={ref} data-visible={inView}>...</div>
 *
 * Pair with `data-[visible=true]:` Tailwind variants for CSS-driven motion,
 * gated behind motion-safe variants. Falls back gracefully when
 * IntersectionObserver is unavailable (treats element as always visible).
 */

import { useEffect, useRef, useState } from "react";

export interface UseInViewOptions {
  /** Intersection threshold (0..1). Default 0.3. */
  threshold?: number;
  /** Stop observing after first reveal. Default true. */
  once?: boolean;
  /** Root margin for early triggering. */
  rootMargin?: string;
}

export function useInView<T extends Element = HTMLElement>(
  options: UseInViewOptions = {}
) {
  const { threshold = 0.3, once = true, rootMargin = "0px" } = options;
  const ref = useRef<T | null>(null);
  // If IntersectionObserver isn't available (SSR / very old environment),
  // initialize as visible so dependent UI doesn't get stuck hidden.
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined"
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);

  return { ref, inView };
}
