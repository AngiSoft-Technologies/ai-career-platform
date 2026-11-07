"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A layer that moves with the scroll.
 *
 * Parallax is what separates a page that has been *laid out* from a page
 * that has been *built*: the media drifts at a different rate to the
 * copy, so depth is felt rather than described. The transform is written
 * straight to the style node inside a rAF — no state, no re-render per
 * frame — and it is simply absent under prefers-reduced-motion.
 */
export function Parallax({
  children,
  speed = 0.18,
  className,
}: {
  children: ReactNode;
  /** Positive drifts down slower than the page; negative, faster. */
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight;
      // Only animate while the element is somewhere on screen.
      if (rect.bottom < -200 || rect.top > viewport + 200) return;
      const progress = (rect.top + rect.height / 2 - viewport / 2) / viewport;
      el.style.transform = `translate3d(0, ${(progress * speed * 100).toFixed(2)}%, 0)`;
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
  }, [speed]);

  return (
    <div ref={ref} className={`mk-parallax ${className ?? ""}`.trim()}>
      {children}
    </div>
  );
}
