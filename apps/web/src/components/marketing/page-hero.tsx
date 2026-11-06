"use client";

import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/**
 * The top of a marketing page.
 *
 * Every public page opens the same way — eyebrow, oversized display
 * heading, one sentence of lede, the actions — so a visitor who has read
 * one page already knows how to read the next. `media` sits beside the
 * copy on wide screens and under it on narrow ones; use it for a product
 * frame, a photograph, or a stat band.
 */
export function PageHero({
  eyebrow,
  eyebrowTone = "insight",
  title,
  lede,
  actions,
  media,
  children,
}: {
  eyebrow: string;
  eyebrowTone?: "signal" | "verified" | "insight";
  title: string;
  lede?: string;
  actions?: ReactNode;
  media?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="mk-section" style={{ paddingTop: "132px", paddingBottom: "24px" }}>
      <div className="mk-container">
        <div
          className={`mk-hero-split${media ? " mk-hero-split--with-media" : ""}`}
          style={{ gap: "clamp(28px, 4vw, 56px)", alignItems: "center" }}
        >
          <Reveal>
            <div style={{ display: "grid", gap: "20px", justifyItems: "start" }}>
              <span className={`mk-eyebrow mk-eyebrow--${eyebrowTone}`}>
                <span className="mk-eyebrow__rule" aria-hidden="true" />
                {eyebrow}
              </span>
              <h1 className="mk-display">{title}</h1>
              {lede ? (
                <p className="mk-lede" style={{ maxWidth: "56ch" }}>
                  {lede}
                </p>
              ) : null}
              {actions ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "4px" }}>{actions}</div>
              ) : null}
              {children}
            </div>
          </Reveal>
          {media ? (
            <Reveal delay={120}>
              <div style={{ width: "100%" }}>{media}</div>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** The heading block that opens every section inside a page. */
export function SectionHeading({
  eyebrow,
  eyebrowTone,
  title,
  lede,
  align = "start",
  level = 2,
}: {
  eyebrow?: string;
  eyebrowTone?: "signal" | "verified" | "insight";
  /** A node, so a section can put its anchor id on the heading itself. */
  title: ReactNode;
  lede?: string;
  align?: "start" | "center";
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <header
      style={{
        display: "grid",
        gap: "14px",
        justifyItems: align === "center" ? "center" : "start",
        textAlign: align === "center" ? "center" : "start",
        maxWidth: "62ch",
        marginBottom: "clamp(28px, 4vw, 44px)",
      }}
    >
      {eyebrow ? (
        <span className={`mk-eyebrow${eyebrowTone ? ` mk-eyebrow--${eyebrowTone}` : ""}`}>
          <span className="mk-eyebrow__rule" aria-hidden="true" />
          {eyebrow}
        </span>
      ) : null}
      <Heading className="mk-section-heading" style={level === 3 ? { fontSize: "1.35rem" } : undefined}>
        {title}
      </Heading>
      {lede ? (
        <p className="mk-lede" style={{ margin: 0 }}>
          {lede}
        </p>
      ) : null}
    </header>
  );
}
