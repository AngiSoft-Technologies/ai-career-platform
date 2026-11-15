"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

/**
 * The application's component kit.
 *
 * Everything here is Tailwind utilities against the `app-*` tokens, so a
 * component written once renders correctly in all five themes and none of
 * the styling is hidden in a stylesheet or a style object. The token names
 * are defined in `app/globals.css`.
 */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-app-surface-2 text-app-soft border-app-border",
  accent: "bg-app-accent-soft text-app-accent border-app-accent/30",
  success: "bg-app-success/12 text-app-success border-app-success/30",
  warning: "bg-app-warning/12 text-app-warning border-app-warning/30",
  danger: "bg-app-danger/12 text-app-danger border-app-danger/30",
  info: "bg-app-info/12 text-app-info border-app-info/30",
};

/* ========================================================================== */
/* Buttons                                                                    */
/* ========================================================================== */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

const BUTTON_VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-app-accent text-app-accent-contrast border-app-accent hover:bg-app-accent/88 shadow-app-sm",
  accent:
    "bg-app-accent-2 text-app-accent-contrast border-app-accent-2 hover:bg-app-accent-2/88 shadow-app-sm",
  outline:
    "bg-transparent text-app-text border-app-border-strong hover:bg-app-surface-2 hover:border-app-accent/50",
  ghost:
    "bg-transparent text-app-soft border-transparent hover:bg-app-surface-2 hover:text-app-text",
  danger:
    "bg-app-danger/12 text-app-danger border-app-danger/40 hover:bg-app-danger/20",
};

const BUTTON_SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-[0.78rem] rounded-app-sm gap-1.5",
  md: "h-10 px-4 text-[0.875rem] rounded-app-md gap-2",
  lg: "h-12 px-6 text-[0.95rem] rounded-app-md gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex shrink-0 items-center justify-center border font-semibold whitespace-nowrap",
        "transition-[background,border-color,color,transform] duration-150 active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "inline-grid size-9 place-items-center rounded-app-md border border-transparent text-app-soft",
        "transition-colors duration-150 hover:bg-app-surface-2 hover:text-app-text",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      aria-label={rest["aria-label"]}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

/* ========================================================================== */
/* Surfaces                                                                   */
/* ========================================================================== */

export function Card({
  className,
  children,
  hover = false,
  as: Tag = "div",
  ...rest
}: {
  className?: string;
  children: ReactNode;
  hover?: boolean;
  as?: "div" | "article" | "section" | "li";
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <Tag
      className={cx(
        "relative rounded-app-lg border border-app-border bg-app-surface",
        hover &&
          "transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-md",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-[1.15rem] leading-tight font-semibold text-app-text">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-prose text-[0.85rem] leading-relaxed text-app-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * The heading every page opens with.
 *
 * One component, so every screen in the app has the same rhythm: what this
 * page is, what it is for, and the one or two actions that matter here.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-app-accent uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1.5 text-[clamp(1.6rem,3.4vw,2.3rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-app-text">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[0.92rem] leading-relaxed text-app-muted">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/* ========================================================================== */
/* Feedback                                                                   */
/* ========================================================================== */

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  active = false,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.78rem] font-medium transition-colors duration-150",
        active
          ? "border-app-accent/45 bg-app-accent-soft text-app-accent"
          : "border-app-border bg-app-surface-2/60 text-app-soft hover:border-app-border-strong hover:text-app-text",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A row of mutually exclusive choices.
 *
 * Used instead of a row of chips when exactly one option can be active —
 * work mode, say, or the sort order of a list.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-app-md border border-app-border bg-app-surface-2/50 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "rounded-app-sm px-3 py-1 text-[0.78rem] font-medium transition-colors duration-150",
              active
                ? "bg-app-accent text-app-accent-contrast"
                : "text-app-muted hover:text-app-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-app-lg border border-dashed border-app-border-strong bg-app-surface/40 px-6 py-14 text-center">
      {icon ? (
        <span className="grid size-12 place-items-center rounded-full bg-app-surface-2 text-app-muted">
          {icon}
        </span>
      ) : null}
      <h3 className="text-[1rem] font-semibold text-app-text">{title}</h3>
      {description ? (
        <p className="max-w-md text-[0.87rem] leading-relaxed text-app-muted">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}

export function Skeleton({
  height = 16,
  width = "100%",
  className,
}: {
  height?: number;
  width?: string | number;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-app-sm bg-app-surface-2",
        className,
      )}
      style={{ height, width }}
    />
  );
}

export function Meter({ value, max = 100 }: { value: number; max?: number }) {
  const percent = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-surface-2">
      <span
        className="block h-full rounded-full bg-app-accent transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function MatchRing({
  score,
  size = 64,
}: {
  score: number;
  size?: number;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const tone =
    clamped >= 80
      ? "var(--success)"
      : clamped >= 60
        ? "var(--accent)"
        : clamped >= 40
          ? "var(--warning)"
          : "var(--danger)";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Match ${Math.round(score)}%`}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--surface-2)"
        strokeWidth={6}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={tone}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-700"
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-app-text font-bold"
        style={{ fontSize: size * 0.28 }}
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

export function Sparkline({
  values,
  height = 40,
  tone = "var(--accent)",
}: {
  values: number[];
  height?: number;
  tone?: string;
}) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={tone}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function BarList({
  items,
}: {
  items: Array<{ label: string; value: number; hint?: string }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.83rem] text-app-soft">{item.label}</span>
            <span className="font-mono text-[0.75rem] text-app-muted">
              {item.hint ?? item.value}
            </span>
          </div>
          <Meter value={item.value} max={max} />
        </div>
      ))}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  tone = "neutral",
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  tone?: Tone;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-app-lg border border-app-border bg-app-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.72rem] font-semibold tracking-[0.1em] text-app-muted uppercase">
          {label}
        </p>
        {icon ? <span className="text-app-muted">{icon}</span> : null}
      </div>
      <p className="mt-2 text-[clamp(1.35rem,2.6vw,1.8rem)] leading-none font-bold tracking-[-0.03em] tabular-nums text-app-text">
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {delta ? <Badge tone={tone}>{delta}</Badge> : null}
        {hint ? <span className="text-[0.74rem] text-app-muted">{hint}</span> : null}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Forms                                                                      */
/* ========================================================================== */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-[0.78rem] font-semibold text-app-soft">{label}</span>
      {children}
      {hint ? <span className="text-[0.72rem] text-app-muted">{hint}</span> : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded-app-md border border-app-border bg-app-surface-2/60 px-3 text-[0.875rem] text-app-text " +
  "placeholder:text-app-muted transition-colors duration-150 focus:border-app-accent focus:bg-app-surface-2 " +
  "focus:outline-none disabled:opacity-60";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, "h-10", className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, "min-h-24 py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, "h-10 cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={cx("relative", className)}>
      <Search
        size={15}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-muted"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cx(CONTROL, "h-10 pl-9")}
        {...rest}
      />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200",
          checked
            ? "border-app-accent bg-app-accent"
            : "border-app-border-strong bg-app-surface-2",
        )}
      >
        <span
          className={cx(
            "absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200",
            checked ? "left-[1.15rem]" : "left-0.5",
          )}
        />
      </button>
      {label ? (
        <label htmlFor={id} className="cursor-pointer text-[0.86rem] text-app-soft">
          {label}
        </label>
      ) : null}
    </div>
  );
}

/* ========================================================================== */
/* Navigation, tables, pagination                                              */
/* ========================================================================== */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: string; label: string; count?: number }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto border-b border-app-border pb-px"
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={cx(
              "relative shrink-0 border-b-2 px-3 py-2 text-[0.84rem] font-medium whitespace-nowrap transition-colors duration-150",
              selected
                ? "border-app-accent text-app-text"
                : "border-transparent text-app-muted hover:text-app-soft",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className="ml-1.5 text-[0.75rem] text-app-muted">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A table that behaves like a table.
 *
 * The wrapper scrolls horizontally on narrow screens and keeps the header
 * visible while the body scrolls, which is what a list of a thousand rows
 * needs.
 */
export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "overflow-hidden rounded-app-lg border border-app-border bg-app-surface",
        className,
      )}
    >
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-left text-[0.85rem]">{children}</table>
      </div>
    </div>
  );
}

export function Th({
  children,
  className,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cx(
        "sticky top-0 z-10 border-b border-app-border bg-app-surface-solid px-4 py-2.5 text-[0.72rem] font-semibold tracking-[0.08em] text-app-muted uppercase",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cx(
        "border-b border-app-border/60 px-4 py-3 align-middle text-app-soft last:border-b-0",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/**
 * Page controls for a long list.
 *
 * The page number is the primary control and the arrows are the fallback:
 * a list of a thousand rows is navigated by page, and by nobody's memory of
 * which page they were on.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [24, 48, 96],
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  // A short window around the current page: first, last, and the
  // neighbours. A catalogue of 1,500 pages is navigated by jumping, not by
  // clicking an arrow 1,499 times.
  const visibleSet = new Set<number>([1, pages, current]);
  for (const offset of [-2, -1, 1, 2]) {
    const candidate = current + offset;
    if (candidate >= 1 && candidate <= pages) visibleSet.add(candidate);
  }
  const visible = [...visibleSet].sort((a, b) => a - b);

  return (
    <nav
      aria-label="Pagination"
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[0.78rem] text-app-muted">
          {total === 0
            ? "Nothing to show"
            : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
        </p>
        {onPageSizeChange && total > 0 ? (
          <label className="flex items-center gap-2 text-[0.78rem] text-app-muted">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-app-sm border border-app-border bg-app-surface-2/60 px-2 text-[0.78rem] text-app-text focus:border-app-accent focus:outline-none"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconButton
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => onPageChange(current - 1)}
            className="border-app-border"
          >
            <ChevronLeft size={16} />
          </IconButton>

          {visible.map((pageNumber, index) => {
            const previous = visible[index - 1];
            const gap = previous !== undefined && pageNumber - previous > 1;
            return (
              <span key={pageNumber} className="flex items-center gap-1">
                {gap ? (
                  <span className="px-1 text-[0.8rem] text-app-muted">…</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onPageChange(pageNumber)}
                  aria-current={pageNumber === current ? "page" : undefined}
                  className={cx(
                    "h-8 min-w-8 rounded-app-sm px-2 text-[0.8rem] font-medium tabular-nums transition-colors duration-150",
                    pageNumber === current
                      ? "bg-app-accent text-app-accent-contrast"
                      : "text-app-soft hover:bg-app-surface-2 hover:text-app-text",
                  )}
                >
                  {pageNumber}
                </button>
              </span>
            );
          })}

          <IconButton
            aria-label="Next page"
            disabled={current >= pages}
            onClick={() => onPageChange(current + 1)}
            className="border-app-border"
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>

        {total > 0 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("page");
              const next = Number(value);
              if (Number.isFinite(next)) onPageChange(Math.min(Math.max(1, next), pages));
              event.currentTarget.reset();
            }}
            className="flex items-center gap-2 text-[0.78rem] text-app-muted"
          >
            <label htmlFor="pagination-page">Page</label>
            <input
              id="pagination-page"
              name="page"
              type="number"
              min={1}
              max={pages}
              defaultValue={current}
              key={current}
              className="h-8 w-16 rounded-app-sm border border-app-border bg-app-surface-2/60 px-2 text-[0.78rem] text-app-text focus:border-app-accent focus:outline-none"
            />
            <span className="tabular-nums">of {pages.toLocaleString()}</span>
            <button type="submit" className="sr-only">
              Jump to page
            </button>
          </form>
        ) : null}
      </div>
    </nav>
  );
}

/* ========================================================================== */
/* Overlays                                                                   */
/* ========================================================================== */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: width }}
        className="max-h-[88dvh] overflow-y-auto rounded-app-lg border border-app-border bg-app-surface-solid shadow-app-lg"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 border-b border-app-border px-5 py-3.5">
          <h3 className="text-[1rem] font-semibold text-app-text">{title}</h3>
          <IconButton onClick={onClose} aria-label="Close">
            ×
          </IconButton>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-app-border px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

interface ToastItem {
  id: string;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<{
  push: (message: string, tone?: Tone) => void;
}>({ push: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const push = useCallback((message: string, tone: Tone = "neutral") => {
    const id = crypto.randomUUID();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4_500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="pointer-events-none fixed right-4 bottom-4 z-300 flex max-w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  role="status"
                  className={cx(
                    "animate-[app-toast-in_200ms_var(--ease)] pointer-events-auto rounded-app-md border px-4 py-3 text-[0.85rem] shadow-app-md",
                    item.tone === "neutral"
                      ? "border-app-border bg-app-surface-solid text-app-text"
                      : item.tone === "success"
                        ? "border-app-success/40 bg-app-surface-solid text-app-success"
                        : item.tone === "danger"
                          ? "border-app-danger/40 bg-app-surface-solid text-app-danger"
                          : item.tone === "warning"
                            ? "border-app-warning/40 bg-app-surface-solid text-app-warning"
                            : "border-app-info/40 bg-app-surface-solid text-app-info",
                  )}
                >
                  {item.message}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Avatar({
  name,
  size = 36,
}: {
  name?: string | null;
  size?: number;
}) {
  const label = (name ?? "?").trim().slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full border border-app-border bg-app-accent-soft font-bold text-app-accent"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {label}
    </span>
  );
}
