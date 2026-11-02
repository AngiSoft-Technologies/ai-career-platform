"use client";

import Image from "next/image";
import { Slider } from "./slider";

export interface MediaSlide {
  id: string;
  /** Image path under /public, used with a real caption for SEO/accessibility. */
  image: string;
  alt: string;
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
          <div className="jr-media-slide__figure">
            <Image
              src={slide.image}
              alt={slide.alt}
              fill
              sizes="(max-width: 900px) 100vw, 46vw"
              className="jr-media-slide__image"
            />
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
