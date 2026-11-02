"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { Slider } from "./slider";

export interface MediaSlide {
  id: string;
  /** Path under /public for a photograph, with a caption for SEO and a11y. */
  image?: string;
  alt?: string;
  /**
   * Optional visual that replaces the photograph — used for product
   * illustrations so the slider can show what the app itself does.
   */
  illustration?: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
}

/**
 * Picture-and-words carousel for the public marketing pages. Images come with
 * descriptive alt text (indexed by search and read aloud), the carousel is
 * keyboard reachable, and autoplay pauses on hover, focus, hidden tabs and
 * reduced-motion preferences (see Slider).
 */
export function MediaSlider({
  slides,
  label,
  interval = 6500,
}: {
  slides: MediaSlide[];
  label: string;
  interval?: number;
}) {
  return (
    <Slider
      label={label}
      autoPlay
      autoPlayInterval={interval}
      className="jr-media-slider"
    >
      {slides.map((slide) => (
        <article className="jr-media-slide" key={slide.id}>
          <div
            className={
              slide.illustration
                ? "jr-media-slide__figure jr-media-slide__figure--illustration"
                : "jr-media-slide__figure"
            }
          >
            {slide.illustration ? (
              slide.illustration
            ) : (
              <Image
                src={slide.image ?? ""}
                alt={slide.alt ?? ""}
                fill
                sizes="(max-width: 900px) 100vw, 46vw"
                className="jr-media-slide__image"
              />
            )}
          </div>
          <div className="jr-media-slide__copy">
            <span className="jr-eyebrow">{slide.eyebrow}</span>
            <h3 className="jr-media-slide__title">{slide.title}</h3>
            <p className="jr-media-slide__body">{slide.body}</p>
          </div>
        </article>
      ))}
    </Slider>
  );
}
