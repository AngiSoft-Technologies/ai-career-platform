"use client";

import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/**
 * A grid whose cells are not all the same size.
 *
 * A four-card row of equal boxes is the shape of every template on the
 * internet. The bento lets one feature take the space its explanation
 * needs and leaves the smaller ones tight, which reads as editing rather
 * than layout.
 */
export function Bento({
  children,
  columns = 3,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={`mk-bento mk-bento--${columns}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  icon,
  title,
  body,
  tone = "insight",
  span = 1,
  delay = 0,
  footer,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  tone?: "signal" | "verified" | "insight" | "plain";
  /** How many of the grid's columns this cell spans on wide screens. */
  span?: 1 | 2;
  delay?: number;
  footer?: ReactNode;
}) {
  const accent =
    tone === "signal"
      ? "var(--mk-signal)"
      : tone === "verified"
        ? "var(--mk-verified)"
        : tone === "insight"
          ? "var(--mk-accent)"
          : "var(--mk-text-muted)";

  return (
    <div className="mk-bento__cell" data-span={span}>
      <Reveal delay={delay}>
        <article
          className="mk-panel mk-bento__card grid content-start gap-3 p-5 lg:p-7 transition-[transform,border-color] duration-200"
        >
        {icon ? (
          <span
            aria-hidden="true"
            style={{
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: "12px",
              color: accent,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--mk-border)",
            }}
          >
            {icon}
          </span>
        ) : null}
        <h3 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 750, letterSpacing: "-0.01em", color: "var(--mk-text)" }}>
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: "0.93rem", lineHeight: 1.65, color: "var(--mk-text-soft)" }}>{body}</p>
        {footer}
        </article>
      </Reveal>
    </div>
  );
}
