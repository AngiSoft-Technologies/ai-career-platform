"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RoleKey, ThemeKey } from "@/lib/types";

export type { RoleKey, ThemeKey };

export interface ThemeDefinition {
  key: ThemeKey;
  label: string;
  tagline: string;
  description: string;
  defaultRole: RoleKey;
  swatch: [string, string, string];
}

export const THEMES: ThemeDefinition[] = [
  {
    key: "aurora",
    label: "Aurora",
    tagline: "Bento glass",
    description:
      "Soft gradients, floating glass panels and an asymmetric bento grid for candidates who want signal without noise.",
    defaultRole: "job_seeker",
    swatch: ["#6d8bff", "#c084fc", "#0b1020"],
  },
  {
    key: "editorial",
    label: "Editorial",
    tagline: "Print journal",
    description:
      "Serif typography, hairline rules and column rhythm built for reading queues, long descriptions and editorial judgement.",
    defaultRole: "moderator",
    swatch: ["#b3200f", "#1f4e79", "#f6f1e7"],
  },
  {
    key: "terminal",
    label: "Terminal",
    tagline: "Dense console",
    description:
      "Monospaced, scanline console for analysts and operators who want maximum information density per pixel.",
    defaultRole: "analyst",
    swatch: ["#5cff9d", "#54d7ff", "#050806"],
  },
  {
    key: "kinetic",
    label: "Kinetic",
    tagline: "Bold blocks",
    description:
      "Oversized type and hard-edged colour blocks that make live automations and throughput impossible to ignore.",
    defaultRole: "automation",
    swatch: ["#ff4d19", "#2b4cff", "#f4f1ea"],
  },
  {
    key: "atlas",
    label: "Atlas",
    tagline: "Operations map",
    description:
      "Cartographic deep navy for curators and admins who reason about sources, geography and coverage at scale.",
    defaultRole: "source_curator",
    swatch: ["#35c3d6", "#f2a65a", "#071018"],
  },
];

export const ROLE_LABELS: Record<RoleKey, string> = {
  job_seeker: "Job seeker",
  analyst: "Analyst",
  moderator: "Moderator",
  support_agent: "Support agent",
  source_curator: "Source curator",
  automation: "Automation",
  admin: "Administrator",
  super_admin: "Super administrator",
};

export const ROLE_HOME: Record<RoleKey, string> = {
  job_seeker: "/dashboard",
  analyst: "/dashboard",
  moderator: "/moderation",
  support_agent: "/support",
  source_curator: "/sources",
  automation: "/automation",
  admin: "/admin",
  super_admin: "/admin",
};

interface ThemeContextValue {
  theme: ThemeKey;
  setTheme: (theme: ThemeKey) => void;
  role: RoleKey;
  setRole: (role: RoleKey) => void;
  hydrated: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "aurora",
  setTheme: () => undefined,
  role: "job_seeker",
  setRole: () => undefined,
  hydrated: false,
});

const THEME_KEY = "jr.theme";
const ROLE_KEY = "jr.role";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>("aurora");
  const [role, setRoleState] = useState<RoleKey>("job_seeker");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY) as ThemeKey | null;
    const storedRole = window.localStorage.getItem(ROLE_KEY) as RoleKey | null;
    if (storedTheme && THEMES.some((entry) => entry.key === storedTheme)) {
      setThemeState(storedTheme);
    }
    if (storedRole) setRoleState(storedRole);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.setProperty("--font-sans-brand", "var(--font-sans)");
  }, [theme, hydrated]);

  const setTheme = useCallback((next: ThemeKey) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_KEY, next);
  }, []);

  const setRole = useCallback((next: RoleKey) => {
    setRoleState(next);
    window.localStorage.setItem(ROLE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, role, setRole, hydrated }),
    [theme, setTheme, role, setRole, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function themeForRole(role: RoleKey): ThemeKey {
  const definition = THEMES.find((entry) => entry.defaultRole === role);
  return definition?.key ?? "aurora";
}

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    return (
      <select
        className="select"
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemeKey)}
        aria-label="Theme"
        style={{ minWidth: 130 }}
      >
        {THEMES.map((entry) => (
          <option key={entry.key} value={entry.key}>
            {entry.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="grid-2" style={{ gap: "0.7rem" }}>
      {THEMES.map((entry) => {
        const active = entry.key === theme;
        return (
          <button
            key={entry.key}
            onClick={() => setTheme(entry.key)}
            style={{
              textAlign: "left",
              cursor: "pointer",
              padding: "0.85rem",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              background: active ? "var(--accent-soft)" : "var(--surface)",
              color: "inherit",
            }}
          >
            <div className="row" style={{ gap: "0.45rem", marginBottom: 8 }}>
              {entry.swatch.map((color) => (
                <span
                  key={color}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: color,
                    display: "inline-block",
                  }}
                />
              ))}
              <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{entry.label}</span>
              {active ? <BadgeActive /> : null}
            </div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {entry.tagline}
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
              {entry.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function BadgeActive() {
  return (
    <span
      className="badge badge-accent"
      style={{ marginLeft: "auto" }}
    >
      Active
    </span>
  );
}
