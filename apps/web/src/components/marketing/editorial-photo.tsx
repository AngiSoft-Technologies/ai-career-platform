"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/**
 * Photography used editorially.
 *
 * Stock photography on a careers site is usually wallpaper — a smiling
 * stranger behind a gradient. Here a photograph always carries a caption
 * that says what it is for, and a credit naming the author the licence
 * requires, so the picture is doing a job rather than filling a hole.
 */
export function EditorialPhoto({
  src,
  alt,
  caption,
  credit,
  height = 420,
  priority,
  className,
}: {
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure className={`mk-photo ${className ?? ""}`.trim()} style={{ margin: 0, minHeight: height }}>
      <Image
        className="mk-photo__image"
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 900px) 100vw, 50vw"
        priority={priority}
      />
      {caption || credit ? <span className="mk-photo__scrim" aria-hidden="true" /> : null}
      {caption || credit ? (
        <figcaption className="mk-photo__caption">
          {caption ? <span className="mk-photo__caption-text">{caption}</span> : <span />}
          {credit ? <cite className="mk-photo__credit">{credit}</cite> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * A full-bleed band of copy over a photograph — the magazine layout.
 *
 * The veil keeps text readable over any picture, and a warm light from
 * the sign side tints the photograph so it belongs to the palette.
 */
export function EditorialBand({
  image,
  alt,
  imageCredit,
  eyebrow,
  eyebrowTone = "signal",
  title,
  children,
  aside,
}: {
  image: string;
  alt: string;
  imageCredit?: string;
  eyebrow: string;
  eyebrowTone?: "signal" | "verified" | "insight";
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="mk-editorial">
      <div className="mk-editorial__media" aria-hidden="true">
        <Image src={image} alt="" fill sizes="100vw" priority />
        <span className="mk-editorial__veil" />
      </div>
      <div className="mk-container">
        <Reveal>
          <div className="mk-editorial__inner">
            <span className={`mk-eyebrow mk-eyebrow--${eyebrowTone}`}>
              <span className="mk-eyebrow__rule" aria-hidden="true" />
              {eyebrow}
            </span>
            <h2 className="mk-display mk-display--sm">{title}</h2>
            {children ? (
              <div className="grid gap-4 text-[1.02rem] leading-[1.7] text-text-soft max-w-prose-wide">
                {children}
              </div>
            ) : null}
            {aside}
            {imageCredit ? (
              <p className="m-0 text-[0.68rem] tracking-[0.05em] text-[rgba(238,242,255,0.55)]">
                Photograph: {imageCredit}
              </p>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
