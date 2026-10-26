"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  Bell,
  Briefcase,
  ChevronRight,
  Compass,
  FileText,
  Gauge,
  Globe2,
  LayoutDashboard,
  Link2,
  ListChecks,
  MessageSquare,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTheme, ROLE_LABELS, THEMES, type RoleKey } from "@/components/theme";
import { Avatar, Badge, IconButton, cx } from "@/components/ui";
import { useWebSocket } from "@/lib/realtime";
import { outboxSize } from "@/lib/api";
import type { Session } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: RoleKey[];
  group: string;
}

const ALL: RoleKey[] = [
  "job_seeker",
  "analyst",
  "moderator",
  "support_agent",
  "source_curator",
  "automation",
  "admin",
  "super_admin",
];

const STAFF: RoleKey[] = ["moderator", "support_agent", "source_curator", "automation", "admin", "super_admin"];
const ADMIN: RoleKey[] = ["admin", "super_admin"];
const CURATORS: RoleKey[] = ["source_curator", "admin", "super_admin"];

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL, group: "Overview" },
  { href: "/opportunities", label: "Opportunities", icon: Compass, roles: ALL, group: "Overview" },
  { href: "/matches", label: "Matches", icon: Sparkles, roles: ALL, group: "Overview" },
  { href: "/applications", label: "Applications", icon: Briefcase, roles: ALL, group: "Work" },
  { href: "/documents", label: "Documents", icon: FileText, roles: ALL, group: "Work" },
  { href: "/followups", label: "Follow-ups", icon: ListChecks, roles: ALL, group: "Work" },
  { href: "/profile", label: "Profile", icon: UserRound, roles: ALL, group: "You" },
  { href: "/connections", label: "Connections", icon: Link2, roles: ALL, group: "You" },
  { href: "/sources", label: "Sources", icon: Globe2, roles: CURATORS, group: "Platform" },
  { href: "/moderation", label: "Moderation", icon: BadgeCheck, roles: ["moderator", "admin", "super_admin"], group: "Platform" },
  { href: "/support", label: "Support", icon: MessageSquare, roles: ["support_agent", "admin", "super_admin"], group: "Platform" },
  { href: "/automation", label: "Automation", icon: Activity, roles: ["automation", "admin", "super_admin"], group: "Platform" },
  { href: "/admin", label: "Administration", icon: ShieldCheck, roles: ADMIN, group: "Platform" },
  { href: "/settings", label: "Settings", icon: Settings, roles: ALL, group: "You" },
];

function useNav(role: RoleKey) {
  return useMemo(() => NAV_ITEMS.filter((item) => item.roles.includes(role)), [role]);
}

export function AppShell({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  const { theme } = useTheme();
  switch (theme) {
    case "editorial":
      return <EditorialShell session={session}>{children}</EditorialShell>;
    case "terminal":
      return <TerminalShell session={session}>{children}</TerminalShell>;
    case "kinetic":
      return <KineticShell session={session}>{children}</KineticShell>;
    case "atlas":
      return <AtlasShell session={session}>{children}</AtlasShell>;
    default:
      return <AuroraShell session={session}>{children}</AuroraShell>;
  }
}

function useConnection() {
  const { connected, events } = useWebSocket(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const update = () => setPending(outboxSize());
    update();
    window.addEventListener("jr:outbox", update);
    window.addEventListener("online", update);
    return () => {
      window.removeEventListener("jr:outbox", update);
      window.removeEventListener("online", update);
    };
  }, []);

  return { connected, events, pending };
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="row" style={{ gap: "0.55rem" }}>
      <img
        src="/brand/logo-mark.png"
        alt="Job Radar"
        width={30}
        height={30}
        style={{ width: 30, height: 30, flexShrink: 0, objectFit: "contain" }}
      />
      {!compact ? (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <img
            src="/brand/logo-wordmark-light.png"
            alt="Job Radar"
            width={132}
            height={37}
            style={{ width: 132, height: "auto", marginBlock: -2 }}
          />
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", letterSpacing: "0.14em" }}>
            ANGISOFT
          </span>
        </span>
      ) : null}
    </Link>
  );
}

function ConnectionPill({ connected, pending }: { connected: boolean; pending: number }) {
  return (
    <div className="row" style={{ gap: "0.4rem" }}>
      {pending > 0 ? (
        <Badge tone="warning">{pending} queued</Badge>
      ) : null}
      <Badge tone={connected ? "success" : "neutral"}>
        <span className={connected ? "live-dot" : undefined} />
        {connected ? "Live" : "Offline"}
      </Badge>
    </div>
  );
}

function MobileMenu({
  open,
  onClose,
  nav,
}: {
  open: boolean;
  onClose: () => void;
  nav: NavItem[];
}) {
  const pathname = usePathname();
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        background: "rgba(3, 6, 14, 0.7)",
        backdropFilter: "blur(4px)",
      }}
    >
      <nav
        onClick={(event) => event.stopPropagation()}
        className="surface-solid"
        style={{
          position: "absolute",
          inset: "0 0 0 auto",
          width: "min(300px, 86vw)",
          padding: "1rem",
          overflowY: "auto",
          borderRadius: 0,
          borderRight: "none",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
          <Brand />
          <IconButton onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </IconButton>
        </div>
        <div className="stack" style={{ gap: "0.2rem" }}>
          {nav.map((item) => (
            <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} onClick={onClose} />
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ========================================================================== */
/* Aurora — floating glass sidebar                                            */
/* ========================================================================== */

function AuroraShell({ children, session }: { children: ReactNode; session: Session | null }) {
  const { role } = useTheme();
  const nav = useNav(role);
  const pathname = usePathname();
  const { connected, pending } = useConnection();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="aurora-grid">
      <aside className="glass aurora-side">
        <Brand />
        <NavStack nav={nav} pathname={pathname} />
        <div style={{ marginTop: "auto" }} className="stack">
          <ConnectionPill connected={connected} pending={pending} />
          <UserBlock session={session} role={role} />
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="glass aurora-topbar">
          <div className="aurora-mobile-brand">
            <Brand />
          </div>
          <IconButton
            className="aurora-menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <LayoutDashboard size={18} />
          </IconButton>
          <SearchBar />
          <div className="spacer" />
          <ConnectionPill connected={connected} pending={pending} />
          <IconButton aria-label="Notifications">
            <Bell size={18} />
          </IconButton>
          <Avatar name={session?.user.name ?? session?.user.email} size={32} />
        </header>

        <main className="main-pad" style={{ maxWidth: 1440, margin: "0 auto" }}>
          {children}
        </main>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} nav={nav} />
    </div>
  );
}

/* ========================================================================== */
/* Editorial — masthead, rules, horizontal navigation                         */
/* ========================================================================== */

function EditorialShell({ children, session }: { children: ReactNode; session: Session | null }) {
  const { role } = useTheme();
  const nav = useNav(role);
  const pathname = usePathname();
  const { connected, pending } = useConnection();
  const groups = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of nav) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [nav]);

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header
        style={{
          borderBottom: "3px double var(--border-strong)",
          padding: "1.4rem 1.5rem 0.8rem",
        }}
      >
        <div
          className="row row-wrap"
          style={{ justifyContent: "space-between", gap: "1rem" }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              AngiSoft Technologies · Est. 2026
            </div>
            <h1 className="display" style={{ fontSize: "clamp(2.2rem, 6vw, 3.6rem)" }}>
              Job Radar
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
              The global employment gazette
            </p>
          </div>
          <div className="row" style={{ gap: "0.8rem" }}>
            <ConnectionPill connected={connected} pending={pending} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                {session?.user.name ?? session?.user.email ?? "Guest"}
              </div>
              <div className="eyebrow">{ROLE_LABELS[role]}</div>
            </div>
          </div>
        </div>

        <nav
          className="row row-wrap scroll-x"
          style={{
            gap: "0.2rem",
            marginTop: "1rem",
            borderTop: "1px solid var(--border)",
            paddingTop: "0.5rem",
          }}
        >
          {groups.map(([group, items]) => (
            <div key={group} className="row" style={{ gap: "0.15rem" }}>
              <span
                className="eyebrow"
                style={{ padding: "0 0.5rem", color: "var(--accent)" }}
              >
                {group}
              </span>
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.86rem",
                      fontWeight: active ? 700 : 500,
                      color: active ? "var(--accent)" : "var(--text-soft)",
                      borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </header>

      <main className="main-pad" style={{ maxWidth: 1240, margin: "0 auto" }}>
        {children}
      </main>

      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "1.2rem 1.5rem",
          color: "var(--text-muted)",
          fontSize: "0.78rem",
        }}
        className="row row-wrap"
      >
        <span>© 2026 AngiSoft Technologies</span>
        <span className="spacer" />
        <span>Job Radar prepares. You review, approve and submit.</span>
      </footer>
    </div>
  );
}

/* ========================================================================== */
/* Terminal — status bar, mono rail, dense canvas                             */
/* ========================================================================== */

function TerminalShell({ children, session }: { children: ReactNode; session: Session | null }) {
  const { role } = useTheme();
  const nav = useNav(role);
  const pathname = usePathname();
  const { connected, events, pending } = useConnection();

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border-strong)",
          background: "var(--surface)",
          padding: "0.45rem 0.8rem",
          display: "flex",
          alignItems: "center",
          gap: "0.8rem",
          flexWrap: "wrap",
        }}
      >
        <span className="mono" style={{ color: "var(--accent)", fontWeight: 700 }}>
          jobradar://shell
        </span>
        <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}>
          user={session?.user.email ?? "anonymous"}
        </span>
        <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}>
          role={role}
        </span>
        <span className="spacer" />
        {pending > 0 ? <Badge tone="warning">outbox:{pending}</Badge> : null}
        <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}>
          ws={connected ? "connected" : "reconnecting"}
        </span>
        <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}>
          evt={events.length}
        </span>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <nav
          className="mono"
          style={{
            display: "none",
            width: 216,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            padding: "0.7rem 0.5rem",
            fontSize: "0.78rem",
          }}
        >
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "0.24rem 0.5rem",
                  color: active ? "var(--accent)" : "var(--text-soft)",
                  background: active ? "var(--accent-soft)" : "transparent",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>{active ? "▸" : "·"}</span>{" "}
                {item.label.toLowerCase().replace(/\s+/g, "-")}
              </Link>
            );
          })}
        </nav>

        <main style={{ flex: 1, minWidth: 0, padding: "1rem" }}>{children}</main>
      </div>

      <footer
        className="mono"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "0.4rem 0.8rem",
          fontSize: "0.72rem",
          color: "var(--text-muted)",
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <span>READY</span>
        <span className="spacer" />
        <span>{events[0] ? `last=${events[0].type}` : "last=—"}</span>
        <span>v1</span>
      </footer>
    </div>
  );
}

/* ========================================================================== */
/* Kinetic — colour block navigation                                          */
/* ========================================================================== */

function KineticShell({ children, session }: { children: ReactNode; session: Session | null }) {
  const { role } = useTheme();
  const nav = useNav(role);
  const pathname = usePathname();
  const { connected, pending } = useConnection();

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header style={{ borderBottom: "3px solid var(--border-strong)" }}>
        <div
          className="row row-wrap"
          style={{ justifyContent: "space-between", padding: "1rem 1.2rem", gap: "0.8rem" }}
        >
          <h1 className="display" style={{ fontSize: "clamp(2.4rem, 8vw, 4.6rem)" }}>
            JOB RADAR
          </h1>
          <div className="row" style={{ gap: "0.6rem" }}>
            {pending > 0 ? <Badge tone="warning">{pending} queued</Badge> : null}
            <Badge tone={connected ? "success" : "neutral"}>
              {connected ? "LIVE" : "OFFLINE"}
            </Badge>
            <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>
              {ROLE_LABELS[role].toUpperCase()}
            </span>
          </div>
        </div>

        <nav className="scroll-x" style={{ display: "flex" }}>
          {nav.map((item, index) => {
            const active = pathname.startsWith(item.href);
            const palette = ["var(--accent)", "var(--accent-2)", "#14120e"];
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  flex: "1 0 auto",
                  minWidth: 118,
                  padding: "0.8rem 1rem",
                  background: active ? palette[index % palette.length] : "transparent",
                  color: active ? "#fff" : "var(--text)",
                  fontWeight: 800,
                  fontSize: "0.8rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  borderRight: "2px solid var(--border-strong)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <item.icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="main-pad" style={{ flex: 1, maxWidth: 1500, margin: "0 auto", width: "100%" }}>
        {children}
      </main>

      <footer
        style={{
          background: "var(--accent)",
          color: "#fff",
          padding: "0.5rem 1.2rem",
          fontWeight: 800,
          fontSize: "0.78rem",
          letterSpacing: "0.06em",
        }}
      >
        <div className="marquee">
          <div className="marquee-track">
            {Array.from({ length: 2 }).map((_, index) => (
              <span key={index}>
                JOB RADAR · AI PREPARES · YOU REVIEW · YOU APPROVE · YOU SUBMIT · GLOBAL
                COVERAGE · ALL PROFESSIONS ·{' '}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ========================================================================== */
/* Atlas — telemetry bar, grouped nav, live rail                              */
/* ========================================================================== */

function AtlasShell({ children, session }: { children: ReactNode; session: Session | null }) {
  const { role } = useTheme();
  const nav = useNav(role);
  const pathname = usePathname();
  const { connected, events, pending } = useConnection();
  const groups = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of nav) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [nav]);

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-solid)",
          padding: "0.5rem 1rem",
        }}
      >
        <div className="row row-wrap" style={{ gap: "1rem" }}>
          <Brand />
          <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            SECTOR 01.3 · {role.toUpperCase()} · {ROLE_LABELS[role]}
          </span>
          <span className="spacer" />
          {pending > 0 ? <Badge tone="warning">{pending} queued</Badge> : null}
          <Badge tone={connected ? "success" : "neutral"}>
            <Radio size={11} />
            {connected ? "TELEMETRY LIVE" : "TELEMETRY IDLE"}
          </Badge>
        </div>
      </header>

      <div className="app-grid">
        <nav
          style={{
            borderRight: "1px solid var(--border)",
            padding: "1rem 0.8rem",
            display: "none",
          }}
        >
          {groups.map(([group, items]) => (
            <div key={group} style={{ marginBottom: "1.3rem" }}>
              <div className="eyebrow" style={{ marginBottom: "0.4rem" }}>
                {group}
              </div>
              <div className="stack" style={{ gap: "0.12rem" }}>
                {items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.55rem",
                        padding: "0.42rem 0.55rem",
                        fontSize: "0.84rem",
                        borderRadius: "var(--radius-sm)",
                        color: active ? "var(--accent)" : "var(--text-soft)",
                        background: active ? "var(--accent-soft)" : "transparent",
                        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                      }}
                    >
                      <item.icon size={15} />
                      {item.label}
                      {active ? <ChevronRight size={13} style={{ marginLeft: "auto" }} /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <main style={{ minWidth: 0, display: "flex" }}>
          <div style={{ flex: 1, minWidth: 0, padding: "1.2rem" }}>{children}</div>
          <aside
            style={{
              display: "none",
              width: 280,
              borderLeft: "1px solid var(--border)",
              padding: "1rem",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: "0.6rem" }}>
              Live feed
            </div>
            <div className="stack" style={{ gap: "0.5rem" }}>
              {events.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Waiting for events on the websocket channel.
                </p>
              ) : (
                events.slice(0, 12).map((event, index) => (
                  <div
                    key={`${event.type}-${index}`}
                    style={{
                      borderLeft: "2px solid var(--accent)",
                      paddingLeft: "0.6rem",
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>{event.type}</div>
                    <div className="mono" style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                      {new Date(event.at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Shared pieces                                                             */
/* ========================================================================== */

function NavStack({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  const groups = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of nav) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [nav]);

  return (
    <div>
      {groups.map(([group, items]) => (
        <div key={group} style={{ marginBottom: "1rem" }}>
          <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
            {group}
          </div>
          <div className="stack" style={{ gap: "0.12rem" }}>
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.55rem",
        padding: "0.46rem 0.6rem",
        borderRadius: "var(--radius-md)",
        fontSize: "0.86rem",
        fontWeight: active ? 700 : 500,
        color: active ? "var(--accent)" : "var(--text-soft)",
        background: active ? "var(--accent-soft)" : "transparent",
      }}
    >
      <item.icon size={16} />
      {item.label}
    </Link>
  );
}

function SearchBar() {
  const [query, setQuery] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!query.trim()) return;
        window.location.href = `/opportunities?q=${encodeURIComponent(query.trim())}`;
      }}
      className="row"
      style={{
        flex: 1,
        maxWidth: 380,
        gap: "0.4rem",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-pill)",
        padding: "0.3rem 0.75rem",
      }}
    >
      <Search size={15} style={{ color: "var(--text-muted)" }} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search roles, companies, skills"
        aria-label="Search opportunities"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text)",
          fontSize: "0.85rem",
          width: "100%",
          fontFamily: "var(--font-body)",
        }}
      />
    </form>
  );
}

function UserBlock({ session, role }: { session: Session | null; role: RoleKey }) {
  return (
    <div className="row" style={{ gap: "0.6rem" }}>
      <Avatar name={session?.user.name ?? session?.user.email} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.84rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session?.user.name ?? session?.user.email ?? "Guest"}
        </div>
        <div className="eyebrow">{ROLE_LABELS[role]}</div>
      </div>
    </div>
  );
}
