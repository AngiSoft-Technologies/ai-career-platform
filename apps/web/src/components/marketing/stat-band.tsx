"use client";

import type { ReactNode } from "react";
import { Counter } from "./counter";
import { Reveal } from "./reveal";

/**
 * Numbers, set like instrumentation.
 *
 * Every figure the platform claims is data it can stand behind, so the
 * figures are set in mono with tabular numerals and count up once, when
 * scrolled into view — and the count-up is skipped entirely for anyone
 * who asked for reduced motion, because the number is the point, not the
 * animation.
 */
export function StatBand({
  stats,
  label,
}: {
  stats: Array<{
    value: number;
    suffix?: string;
    prefix?: string;
    label: string;
    note?: string;
    tone?: "signal" | "verified" | "insight" | "plain";
  }>;
  label: string;
}) {
  return (
    <div className="mk-stat-band" role="group" aria-label={label}>
      {stats.map((stat, index) => (
        <Reveal key={stat.label} delay={index * 90}>
          <div className="mk-stat">
            <span className={`mk-stat__value mk-numeral${stat.tone && stat.tone !== "plain" ? ` mk-stat__value--${stat.tone}` : ""}`}>
              {stat.prefix ?? ""}
              <Counter value={stat.value} inline />
              {stat.suffix ?? ""}
            </span>
            <span className="mk-stat__label">{stat.label}</span>
            {stat.note ? <span className="mk-stat__note">{stat.note}</span> : null}
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/** A wide panel used for a single focused message. */
export function Callout({
  icon,
  tone = "verified",
  title,
  children,
  aside,
}: {
  icon?: ReactNode;
  tone?: "signal" | "verified" | "insight";
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const accent =
    tone === "signal" ? "var(--mk-signal)" : tone === "verified" ? "var(--mk-verified)" : "var(--mk-accent)";

  return (
    <div
      className="mk-panel grid gap-[1.125rem] p-[clamp(22px,3vw,34px)]"
      style={{
        borderColor: `color-mix(in oklab, ${accent} 35%, transparent)`,
        background: `linear-gradient(165deg, color-mix(in oklab, ${accent} 9%, transparent), rgba(255,255,255,0.02))`,
      }}
    >
      <div className="flex flex-wrap items-center gap-3.5">
        {icon ? (
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center", color: accent }}>
            {icon}
          </span>
        ) : null}
        <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 750, letterSpacing: "-0.01em", color: "var(--mk-text)" }}>
          {title}
        </h3>
        {aside ? <div style={{ marginLeft: "auto" }}>{aside}</div> : null}
      </div>
      <div className="grid gap-3 text-[0.96rem] leading-[1.68] text-text-soft">
        {children}
      </div>
    </div>
  );
}
