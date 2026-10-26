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
}

export function Slider({
  children,
  autoPlay = true,
  autoPlayInterval = 5000,
  showArrows = true,
  showDots = true,
  className,
  pauseOnHover = true,
}: SliderProps) {
  const slides = Array.isArray(children) ? children : [children];
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);

  const goTo = (i: number) => {
    setIndex((prev) => (prev + count) % count);
    setDirection((prev) => (prev === "next" ? "prev" : "next"));
  };

  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1);

  useEffect(() => {
    if (!autoPlay || count <= 1) return;
    const timer = setTimeout(next, autoPlayInterval);
    timerRef.current = timer;
    return () => clearTimeout(timer);
  }, [index, autoPlay, autoPlayInterval, count, next]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !pauseOnHover) return;
    const onEnter = () => { isHoveredRef.current = true; };
    const onLeave = () => { isHoveredRef.current = false; };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("mouseenter", onEnter); el.removeEventListener("mouseleave", onLeave); };
  }, [pauseOnHover]);

  return (
    <div ref={containerRef} className={clsx("mk-slider", className)} role="region" aria-label="Carousel" aria-roledescription="carousel">
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