"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface SliderProps {
  children: ReactNode;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showArrows?: boolean;
  showDots?: boolean;
  className?: string;
  pauseOnHover?: boolean;
  /** Accessible name for the carousel region. */
  label?: string;
}

export function Slider({
  children,
  autoPlay = true,
  autoPlayInterval = 5000,
  showArrows = true,
  showDots = true,
  className,
  pauseOnHover = true,
  label = "Carousel",
}: SliderProps) {
  const slides = Array.isArray(children) ? children : [children];
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const paused = hovered || hidden;

  const goTo = (i: number) => {
    // A slide index has to stay on the track. Without the wrap, leaving
    // the last slide steps to `count` — the carousel translates past its
    // own final panel and parks the visitor in front of blank space,
    // where it keeps walking away into more of nothing.
    const wrapped = ((i % count) + count) % count;
    setDirection(wrapped > index ? "next" : "prev");
    setIndex(wrapped);
  };

  const goToPrev = () => {
    setIndex((prev) => (prev - 1 + count) % count);
    setDirection("prev");
  };

  const next = () => goTo(index + 1);
  const prev = () => goToPrev();

  // Autoplay is paused while the pointer or keyboard focus is inside the
  // carousel, while the tab is hidden, and whenever the visitor has asked for
  // reduced motion.
  useEffect(() => {
    if (!autoPlay || count <= 1 || paused) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const timer = setTimeout(next, autoPlayInterval);
    timerRef.current = timer;
    return () => clearTimeout(timer);
  }, [index, autoPlay, autoPlayInterval, count, paused, next]);

  useEffect(() => {
    const onVisibility = () => setHidden(Boolean(document.hidden));
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prev, next]);

  // Pointer, keyboard focus and a hidden tab each pause autoplay.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !pauseOnHover) return;
    const stop = () => setHovered(true);
    const resume = () => setHovered(false);
    const onFocusIn = stop;
    const onFocusOut = (event: FocusEvent) => {
      if (!el.contains(event.relatedTarget as Node)) resume();
    };
    el.addEventListener("mouseenter", stop);
    el.addEventListener("mouseleave", resume);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    return () => {
      el.removeEventListener("mouseenter", stop);
      el.removeEventListener("mouseleave", resume);
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, [pauseOnHover]);

  return (
    <div ref={containerRef} className={clsx("mk-slider", className)} role="region" aria-label={label} aria-roledescription="carousel">
      <div className="mk-slider__viewport" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide, i) => (
          <div key={i} className="mk-slider__slide" data-direction={direction} role="group" aria-roledescription="slide" aria-label={`Slide ${i + 1} of ${count}`}>
            {slide}
          </div>
        ))}
      </div>

      {showArrows && count > 1 && (
        <>
          <button className="mk-slider__arrow mk-slider__arrow--prev" onClick={prev} aria-label="Previous slide">
            <ChevronLeft aria-hidden="true" />
          </button>
          <button className="mk-slider__arrow mk-slider__arrow--next" onClick={next} aria-label="Next slide">
            <ChevronRight aria-hidden="true" />
          </button>
        </>
      )}

      {showDots && count > 1 && (
        <div className="mk-slider__dots" role="tablist" aria-label="Slide navigation">
          {slides.map((_, i) => (
            <button
              key={i}
              className={clsx("mk-slider__dot", index === i && "is-active")}
              onClick={() => goTo(i)}
              role="tab"
              aria-selected={index === i}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}