"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * The visual layer of the signed-in app.
 *
 * The marketing site has photography, illustrations and print-grade type;
 * the app had none of it, which is why it read as a wireframe of itself.
 * These pieces give the workspace the same material without turning it into
 * a brochure: one photographic band per page at most, monogram marks for
 * companies, and line illustrations where a list is empty.
 */

const MARK_TONES = [
  ["#7c93ff", "#3d4bd6"],
  ["#46d399", "#0f7a58"],
  ["#f5b544", "#b06a08"],
  ["#d9a6ff", "#7a3fbf"],
  ["#56b8f5", "#1b6ea8"],
  ["#ff8f7a", "#b23b2a"],
];

function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) >>> 0;
  }
  return total;
}

/** A company monogram. Deterministic, so a company always looks the same. */
export function CompanyMark({
  name,
  size = 40,
  className,
}: {
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const label = (name ?? "?").trim();
  const initials =
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const [from, to] = MARK_TONES[hash(label) % MARK_TONES.length];

  return (
    <span
      aria-hidden
      className={cx(
        "grid shrink-0 place-items-center rounded-app-sm border border-white/10 font-semibold text-white/95",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        backgroundImage: `linear-gradient(140deg, ${from}, ${to})`,
      }}
    >
      {initials}
    </span>
  );
}

/**
 * A photographic band.
 *
 * A single image, veiled to keep text readable, with the headline sitting in
 * the plate rather than above it. Used once per page — more than that and
 * the workspace starts to feel like a landing page.
 */
export function PhotoBand({
  src,
  alt,
  children,
  height = "clamp(220px, 26vw, 320px)",
  priority = false,
  className,
}: {
  src: string;
  alt: string;
  children: ReactNode;
  height?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "relative isolate overflow-hidden rounded-app-lg border border-app-border",
        className,
      )}
      style={{ minHeight: height }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 1024px) 100vw, 70vw"
        className="object-cover object-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(100deg,rgba(7,7,12,0.94)_0%,rgba(7,7,12,0.78)_30%,rgba(7,7,12,0.38)_62%,rgba(7,7,12,0.18)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(70%_120%_at_0%_0%,rgba(124,147,255,0.26),transparent_62%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,rgba(7,7,12,0.92),rgba(7,7,12,0.4)_55%,transparent)]"
      />
      <div className="relative flex h-full flex-col justify-end p-6 sm:p-8 lg:p-10">
        {children}
      </div>
    </section>
  );
}

/**
 * A split hero: the message on the left, a photograph on the right.
 *
 * A full-bleed band puts the photograph behind the type, which reads as a
 * poster and fights the words for attention. Splitting them gives the type
 * a calm field and gives the picture a frame, so neither has to be veiled
 * into illegibility.
 */
export function HeroSplit({
  src,
  alt,
  eyebrow,
  title,
  description,
  actions,
  stats,
  badge,
  priority = false,
  className,
}: {
  src: string;
  alt: string;
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  stats?: ReactNode;
  badge?: ReactNode;
  priority?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "grid overflow-hidden rounded-app-xl border border-app-border bg-app-surface shadow-app-card lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]",
        className,
      )}
    >
      <div className="relative flex flex-col justify-center gap-5 p-6 sm:p-8 lg:p-10">
        {/* The accent wash and the grid, drawn with utilities so the hero
            still follows the theme tokens. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_0%_0%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_62%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(color-mix(in_srgb,var(--text)_4%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--text)_4%,transparent)_1px,transparent_1px)] bg-[length:34px_34px] [mask-image:radial-gradient(80%_90%_at_0%_0%,black,transparent_72%)]"
        />

        <div className="relative flex flex-col gap-5">
          {eyebrow ? (
            <p className="flex items-center gap-2.5 font-mono text-[0.62rem] font-semibold tracking-[0.24em] text-app-muted uppercase">
              <span
                aria-hidden
                className="h-px w-8 bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
              />
              {eyebrow}
            </p>
          ) : null}

          <h1 className="max-w-[22ch] text-[clamp(1.9rem,3.6vw,3rem)] leading-[1] font-semibold tracking-[-0.03em] text-balance text-app-text">
            {title}
          </h1>

          {description ? (
            <p className="max-w-[54ch] text-[0.95rem] leading-relaxed text-app-soft">
              {description}
            </p>
          ) : null}

          {actions ? (
            <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
          ) : null}

          {stats ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-app-border pt-6 sm:grid-cols-4">
              {stats}
            </dl>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-[200px] overflow-hidden lg:min-h-[340px]">
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 1024px) 100vw, 40vw"
          className="object-cover object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(90deg,var(--surface-solid)_0%,transparent_38%)] lg:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--surface-solid)_82%,transparent)_0%,transparent_42%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(80%_90%_at_80%_100%,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_70%)] mix-blend-overlay"
        />
        {badge ? (
          <div className="absolute right-4 bottom-4 left-4 lg:right-6 lg:bottom-6 lg:left-auto">
            {badge}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** A thin chart-like rule used as a section divider. */
export function SignalRule({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "h-px w-full bg-[linear-gradient(90deg,transparent,var(--border-strong),transparent)]",
        className,
      )}
    />
  );
}

/* ==========================================================================
   Empty-state illustrations
   Line drawings in the app palette, so an empty screen still looks designed.
   ========================================================================== */

const stroke = "var(--text-muted)";
const faint = "var(--border-strong)";
const accent = "var(--accent)";

/**
 * An empty search sweep.
 *
 * Concentric rings with a scanning arm: the picture of a sweep finding
 * nothing. Named for what the person sees, not for an older product name.
 */
export function EmptySearchArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-label="An empty search sweep"
      className={cx("h-28 w-auto", className)}
    >
      {[28, 52, 76].map((radius, index) => (
        <circle
          key={radius}
          cx="120"
          cy="70"
          r={radius}
          fill="none"
          stroke={index === 0 ? accent : faint}
          strokeWidth="1"
          strokeDasharray={index === 0 ? undefined : "3 5"}
          opacity={index === 0 ? 0.55 : 1}
        />
      ))}
      <path d="M120 70 L120 18" stroke={faint} strokeWidth="1" />
      <path d="M120 70 L172 70" stroke={faint} strokeWidth="1" />
      <path d="M120 70 L158 32" stroke={accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <circle cx="158" cy="32" r="3" fill={accent} />
      <circle cx="120" cy="70" r="2.5" fill={stroke} />
    </svg>
  );
}

/** @deprecated Kept so older imports keep working. Use `EmptySearchArt`. */
export const EmptyRadarArt = EmptySearchArt;

export function EmptyDocumentArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-label="An empty document"
      className={cx("h-28 w-auto", className)}
    >
      <rect x="78" y="14" width="84" height="112" rx="6" fill="none" stroke={faint} strokeWidth="1.5" />
      <rect x="90" y="30" width="42" height="6" rx="3" fill={accent} opacity="0.8" />
      {[48, 60, 72, 90, 102].map((y, index) => (
        <rect
          key={y}
          x="90"
          y={y}
          width={index % 3 === 2 ? 44 : 60}
          height="4"
          rx="2"
          fill={faint}
        />
      ))}
      <path d="M176 96 l16 16" stroke={faint} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="170" cy="90" r="12" fill="none" stroke={accent} strokeWidth="1.5" />
    </svg>
  );
}

export function EmptyPipelineArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-label="An empty application pipeline"
      className={cx("h-28 w-auto", className)}
    >
      {[24, 78, 132, 186].map((x, index) => (
        <g key={x}>
          <rect
            x={x}
            y="34"
            width="30"
            height="72"
            rx="4"
            fill="none"
            stroke={index === 0 ? accent : faint}
            strokeWidth="1.5"
            opacity={index === 0 ? 0.9 : 1}
          />
          <rect x={x + 7} y="44" width="16" height="3" rx="1.5" fill={faint} />
          <rect x={x + 7} y="54" width="10" height="3" rx="1.5" fill={faint} />
        </g>
      ))}
      <path d="M54 70 H78 M108 70 H132 M162 70 H186" stroke={faint} strokeWidth="1" strokeDasharray="2 3" />
    </svg>
  );
}
