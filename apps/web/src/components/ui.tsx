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

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

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
        "btn",
        variant === "primary" && "btn-primary",
        variant === "accent" && "btn-accent",
        variant === "outline" && "btn-outline",
        variant === "ghost" && "btn-ghost",
        variant === "danger" && "btn-danger",
        size === "sm" && "btn-sm",
        size === "lg" && "btn-lg",
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
      className={cx("btn btn-ghost btn-icon", className)}
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
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        animation: "spin 700ms linear infinite",
      }}
    />
  );
}

export function Card({
  className,
  children,
  hover = false,
  as: Tag = "div",
  style,
}: {
  className?: string;
  children: ReactNode;
  hover?: boolean;
  as?: "div" | "article" | "section" | "li";
  style?: React.CSSProperties;
}) {
  return (
    <Tag className={cx("surface", hover && "surface-hover", className)} style={style}>
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
    <div className="row row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h2 style={{ fontSize: "clamp(1.1rem, 2.4vw, 1.5rem)", marginTop: eyebrow ? 4 : 0 }}>
          {title}
        </h2>
        {description ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx("badge", `badge-${tone}`, className)}>{children}</span>;
}

export function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="chip" data-active={active} onClick={onClick}>
      {children}
    </button>
  );
}

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
    <label className={cx("field", className)}>
      <span className="label">{label}</span>
      {children}
      {hint ? (
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("input", className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("textarea", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("select", className)} {...rest}>
      {children}
    </select>
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
    <div className="row" style={{ gap: "0.6rem" }}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="switch"
        data-on={checked}
        onClick={() => onChange(!checked)}
      />
      {label ? (
        <label htmlFor={id} style={{ fontSize: "0.86rem", cursor: "pointer" }}>
          {label}
        </label>
      ) : null}
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
    <div className="surface" style={{ padding: "1rem 1.1rem" }}>
      <div className="row" style={{ justifyContent: "space-between", gap: "0.5rem" }}>
        <div className="eyebrow">{label}</div>
        {icon ? <span style={{ color: "var(--text-muted)" }}>{icon}</span> : null}
      </div>
      <div
        className="tabular"
        style={{
          fontSize: "clamp(1.4rem, 3vw, 1.9rem)",
          fontWeight: 800,
          marginTop: 6,
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      <div className="row" style={{ gap: "0.5rem", marginTop: 6 }}>
        {delta ? <Badge tone={tone}>{delta}</Badge> : null}
        {hint ? (
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

export function Meter({ value, max = 100 }: { value: number; max?: number }) {
  const percent = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="meter">
      <span style={{ width: `${percent}%` }} />
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
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const tone =
    score >= 80 ? "var(--success)" : score >= 60 ? "var(--accent)" : score >= 40 ? "var(--warning)" : "var(--danger)";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Match ${score}%`}>
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
        style={{ transition: "stroke-dashoffset 600ms var(--ease)" }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: size * 0.28, fontWeight: 800, fill: "var(--text)" }}
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
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
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
    <div className="stack" style={{ gap: "0.6rem" }}>
      {items.map((item) => (
        <div key={item.label}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.82rem" }}>{item.label}</span>
            <span className="mono" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {item.hint ?? item.value}
            </span>
          </div>
          <Meter value={item.value} max={max} />
        </div>
      ))}
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
    <div
      className="surface"
      style={{
        padding: "2.4rem 1.5rem",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.6rem",
      }}
    >
      {icon ? <div style={{ color: "var(--text-muted)" }}>{icon}</div> : null}
      <h3 style={{ fontSize: "1rem" }}>{title}</h3>
      {description ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.86rem", maxWidth: 460 }}>
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: string | number }) {
  return <div className="skeleton" style={{ height, width }} />;
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="surface" style={{ overflow: "hidden" }}>
      <div className="table-scroll">{children}</div>
    </div>
  );
}

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
      className="row row-wrap scroll-x"
      role="tablist"
      style={{ gap: "0.35rem", borderBottom: "1px solid var(--border)", paddingBottom: 2 }}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            style={{
              background: selected ? "var(--accent-soft)" : "transparent",
              color: selected ? "var(--accent)" : "var(--text-muted)",
              border: "none",
              borderBottom: `2px solid ${selected ? "var(--accent)" : "transparent"}`,
              padding: "0.55rem 0.8rem",
              fontSize: "0.84rem",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span style={{ opacity: 0.65, marginLeft: 6 }}>{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(3, 6, 14, 0.72)",
        backdropFilter: "blur(6px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        className="surface-solid animate-in"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "88dvh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
          borderRadius: "var(--radius-lg)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            padding: "0.9rem 1.1rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h3 style={{ fontSize: "1rem" }}>{title}</h3>
          <IconButton onClick={onClose} aria-label="Close">
            ×
          </IconButton>
        </div>
        <div style={{ padding: "1.1rem" }}>{children}</div>
        {footer ? (
          <div
            className="row"
            style={{
              justifyContent: "flex-end",
              gap: "0.5rem",
              padding: "0.9rem 1.1rem",
              borderTop: "1px solid var(--border)",
            }}
          >
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
            <div
              style={{
                position: "fixed",
                bottom: "1rem",
                right: "1rem",
                zIndex: 300,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                maxWidth: "min(360px, calc(100vw - 2rem))",
              }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  className="surface-solid animate-in"
                  style={{
                    padding: "0.7rem 0.9rem",
                    fontSize: "0.86rem",
                    borderLeft: `3px solid var(--${
                      item.tone === "neutral" ? "accent" : item.tone
                    })`,
                  }}
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
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--accent-soft)",
        color: "var(--accent)",
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.38,
        fontWeight: 800,
        border: "1px solid var(--border)",
        flexShrink: 0,
      }}
      aria-hidden
    >
      {label}
    </div>
  );
}
