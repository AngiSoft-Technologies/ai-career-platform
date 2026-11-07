"use client";

import { useEffect, useRef } from "react";

/**
 * A reading-progress line at the very top.
 *
 * It is the one always-on motion on the site: it fills as the visitor
 * reads, and it doubles as an orientation cue on pages that are long
 * enough to need one. Written straight to the style node inside a rAF —
 * no state, no re-render per scroll event — and absent under
 * prefers-reduced-motion.
 */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.style.opacity = "0";
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      el.style.transform = `scaleX(${progress.toFixed(4)})`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="mk-scroll-progress" aria-hidden="true" />;
}
