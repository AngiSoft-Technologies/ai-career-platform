"use client";

import { useEffect, useRef, useState } from "react";

interface CounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  delay?: number;
  className?: string;
}

export function Counter({ value, suffix = "", prefix = "", duration = 1800, delay = 0, className }: CounterProps) {
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          setTimeout(() => {
            const start = 0;
            const end = value;
            const startTime = performance.now();

            function animate(now: number) {
              const progress = Math.min(1, (now - startTime) / duration);
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.floor(start + (end - start) * eased);
              setDisplay(current);
              if (progress < 1) requestAnimationFrame(animate);
            }
            requestAnimationFrame(animate);
          }, delay);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5, rootMargin: "0px 0px -80px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration, delay, started]);

  return (
    <div ref={ref} className={className} aria-live="polite" aria-label={`${value} ${suffix}`.trim()}>
      <span className="mk-counter__value">{display.toLocaleString()}</span>
      {suffix && <span className="mk-counter__suffix">{suffix}</span>}
      {prefix && <span className="mk-counter__prefix">{prefix}</span>}
    </div>
  );
}