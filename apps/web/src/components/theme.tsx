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
        className="h-10 w-full cursor-pointer rounded-app-md border border-app-border bg-app-surface-2/60 px-3 pr-8 text-[0.875rem] text-app-text focus:border-app-accent focus:outline-none"
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
    <div className="grid gap-3 sm:grid-cols-2">
      {THEMES.map((entry) => {
        const active = entry.key === theme;
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTheme(entry.key)}
            aria-pressed={active}
            className={
              active
                ? "cursor-pointer rounded-app-md border border-app-accent bg-app-accent-soft p-3.5 text-left"
                : "cursor-pointer rounded-app-md border border-app-border bg-app-surface-2/40 p-3.5 text-left transition-colors duration-150 hover:border-app-border-strong"
            }
          >
            <div className="mb-2 flex items-center gap-2">
              {entry.swatch.map((color) => (
                <span
                  key={color}
                  className="inline-block size-3.5 rounded-[4px]"
                  style={{ background: color }}
                />
              ))}
              <span className="text-[0.9rem] font-bold text-app-text">{entry.label}</span>
              {active ? (
                <span className="ml-auto inline-flex items-center rounded-full border border-app-accent/30 bg-app-accent-soft px-2 py-0.5 text-[0.68rem] font-semibold text-app-accent">
                  Active
                </span>
              ) : null}
            </div>
            <div className="mb-1 text-[0.68rem] font-semibold tracking-[0.12em] text-app-muted uppercase">
              {entry.tagline}
            </div>
            <p className="text-[0.77rem] leading-relaxed text-app-muted">
              {entry.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
