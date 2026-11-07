"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Every navigation animates.
 *
 * Next.js remounts `template.tsx` on each route change — that is the
 * hook for a page transition that `layout.tsx` cannot give (a layout
 * mounts once and persists). The entering page rises and fades in; the
 * leaving one simply unmounts, which reads as motion forward rather than
 * as a jump cut. Under prefers-reduced-motion the page is simply there.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("mk-route-enter");
    const done = () => el.classList.remove("mk-route-enter");
    el.addEventListener("animationend", done, { once: true });
    return () => el.removeEventListener("animationend", done);
  }, []);

  return (
    <div ref={ref} className="mk-route">
      {children}
    </div>
  );
}
