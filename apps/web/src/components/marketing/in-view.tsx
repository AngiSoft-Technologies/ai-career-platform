"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Adds `is-inview` to the element when it scrolls into view, once.
 *
 * The CSS does the work (`mk-reveal`); this is only the observer. Kept
 * separate so a section can also use the purely CSS `mk-stagger` when it
 * wants the children to arrive in sequence instead of the whole block.
 */
export function InView({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-inview");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
            window.setTimeout(() => el.classList.add("is-inview"), delay);
            observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  const Tag = as as "div";
  return (
    <Tag ref={ref as React.Ref<HTMLDivElement>} className={className}>
      {children}
    </Tag>
  );
}
