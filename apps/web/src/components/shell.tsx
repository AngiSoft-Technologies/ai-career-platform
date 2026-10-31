"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  Bell,
  Briefcase,
  ChevronLeft,
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
import { api, outboxSize } from "@/lib/api";
import type { Session } from "@/lib/auth";

interface NavSubItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: RoleKey[];
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: RoleKey[];
  group: string;
  subItems?: NavSubItem[];
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

const ADMIN: RoleKey[] = ["admin", "super_admin"];
const CURATORS: RoleKey[] = ["source_curator", "admin", "super_admin"];

const ROLE_NAV: Record<RoleKey, NavItem[]> = {
  job_seeker: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["job_seeker"], group: "Overview" },
    { href: "/opportunities", label: "Opportunities", icon: Compass, roles: ["job_seeker"], group: "Overview" },
    { href: "/matches", label: "Matches", icon: Sparkles, roles: ["job_seeker"], group: "Overview" },
    { href: "/applications", label: "Applications", icon: Briefcase, roles: ["job_seeker"], group: "Work" },
    { href: "/documents", label: "Documents", icon: FileText, roles: ["job_seeker"], group: "Work" },
    { href: "/followups", label: "Follow-ups", icon: ListChecks, roles: ["job_seeker"], group: "Work" },
    { href: "/notifications", label: "Notifications", icon: Bell, roles: ["job_seeker"], group: "Work" },
    { href: "/profile", label: "Profile", icon: UserRound, roles: ["job_seeker"], group: "You" },
    { href: "/connections", label: "Connections", icon: Link2, roles: ["job_seeker"], group: "You" },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["job_seeker"], group: "You" },
  ],
  analyst: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["analyst"], group: "Overview" },
    { href: "/opportunities", label: "Opportunities", icon: Compass, roles: ["analyst"], group: "Data" },
    { href: "/matches", label: "Matches", icon: Sparkles, roles: ["analyst"], group: "Data" },
    { href: "/analytics", label: "Analytics", icon: Gauge, roles: ["analyst"], group: "Analysis" },
    { href: "/reports", label: "Reports", icon: FileText, roles: ["analyst"], group: "Analysis" },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["analyst"], group: "You" },
  ],
  moderator: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["moderator"], group: "Overview" },
    {
      href: "/moderation",
      label: "Moderation",
      icon: BadgeCheck,
      roles: ["moderator"],
      group: "Moderation",
      subItems: [
        { href: "/moderation", label: "Queue", icon: ListChecks, roles: ["moderator"] },
        { href: "/moderation/reports", label: "Reports", icon: FileText, roles: ["moderator"] },
        { href: "/moderation/users", label: "Users", icon: Users, roles: ["moderator"] },
      ],
    },
    { href: "/reports", label: "Reports", icon: FileText, roles: ["moderator"], group: "Reports" },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["moderator"], group: "You" },
  ],
  support_agent: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["support_agent"], group: "Overview" },
    {
      href: "/support",
      label: "Support",
      icon: MessageSquare,
      roles: ["support_agent"],
      group: "Support",
      subItems: [
        { href: "/support", label: "Tickets", icon: ListChecks, roles: ["support_agent"] },
        { href: "/support/users", label: "Users", icon: Users, roles: ["support_agent"] },
        { href: "/support/knowledge", label: "Knowledge Base", icon: FileText, roles: ["support_agent"] },
      ],
    },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["support_agent"], group: "You" },
  ],
  source_curator: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["source_curator"], group: "Overview" },
    {
      href: "/sources",
      label: "Sources",
      icon: Globe2,
      roles: ["source_curator"],
      group: "Sources",
      subItems: [
        { href: "/sources", label: "All Sources", icon: Globe2, roles: ["source_curator"] },
        { href: "/sources/add", label: "Add Source", icon: Globe2, roles: ["source_curator"] },
        { href: "/sources/health", label: "Health", icon: Activity, roles: ["source_curator"] },
      ],
    },
    {
      href: "/opportunities",
      label: "Jobs",
      icon: Compass,
      roles: ["source_curator"],
      group: "Jobs",
      subItems: [
        { href: "/opportunities", label: "All Jobs", icon: Compass, roles: ["source_curator"] },
        { href: "/opportunities/import", label: "Import", icon: Globe2, roles: ["source_curator"] },
      ],
    },
    {
      href: "/companies",
      label: "Companies",
      icon: Users,
      roles: ["source_curator"],
      group: "Companies",
      subItems: [
        { href: "/companies", label: "All Companies", icon: Users, roles: ["source_curator"] },
        { href: "/companies/add", label: "Add Company", icon: Users, roles: ["source_curator"] },
      ],
    },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["source_curator"], group: "You" },
  ],
  automation: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["automation"], group: "Overview" },
    {
      href: "/automation",
      label: "Automation",
      icon: Activity,
      roles: ["automation"],
      group: "Automation",
      subItems: [
        { href: "/automation", label: "Overview", icon: Activity, roles: ["automation"] },
        { href: "/automation/workflows", label: "Workflows", icon: Wrench, roles: ["automation"] },
        { href: "/automation/logs", label: "Logs", icon: Activity, roles: ["automation"] },
        { href: "/automation/schedules", label: "Schedules", icon: Radio, roles: ["automation"] },
      ],
    },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["automation"], group: "You" },
  ],
  admin: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"], group: "Overview" },
    {
      href: "/admin",
      label: "Administration",
      icon: ShieldCheck,
      roles: ["admin"],
      group: "Administration",
      subItems: [
        { href: "/admin", label: "Overview", icon: LayoutDashboard, roles: ["admin"] },
        { href: "/admin/users", label: "Users", icon: Users, roles: ["admin"] },
        { href: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck, roles: ["admin"] },
        { href: "/admin/invitations", label: "Invitations", icon: Users, roles: ["admin"] },
        { href: "/admin/taxonomy", label: "Taxonomy", icon: FileText, roles: ["admin"] },
        { href: "/admin/scam-corpus", label: "Scam Corpus", icon: ShieldCheck, roles: ["admin"] },
      ],
    },
    {
      href: "/sources",
      label: "Sources",
      icon: Globe2,
      roles: ["admin"],
      group: "Platform",
      subItems: [
        { href: "/sources", label: "All Sources", icon: Globe2, roles: ["admin"] },
        { href: "/sources/add", label: "Add Source", icon: Globe2, roles: ["admin"] },
      ],
    },
    {
      href: "/moderation",
      label: "Moderation",
      icon: BadgeCheck,
      roles: ["admin"],
      group: "Administration",
      subItems: [
        { href: "/moderation", label: "Queue", icon: ListChecks, roles: ["admin"] },
        { href: "/moderation/reports", label: "Reports", icon: FileText, roles: ["admin"] },
      ],
    },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"], group: "You" },
  ],
  super_admin: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin"], group: "Overview" },
    {
      href: "/admin",
      label: "Administration",
      icon: ShieldCheck,
      roles: ["super_admin"],
      group: "Administration",
      subItems: [
        { href: "/admin", label: "Overview", icon: LayoutDashboard, roles: ["super_admin"] },
        { href: "/admin/users", label: "Users", icon: Users, roles: ["super_admin"] },
        { href: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck, roles: ["super_admin"] },
        { href: "/admin/invitations", label: "Invitations", icon: Users, roles: ["super_admin"] },
        { href: "/admin/taxonomy", label: "Taxonomy", icon: FileText, roles: ["super_admin"] },
        { href: "/admin/scam-corpus", label: "Scam Corpus", icon: ShieldCheck, roles: ["super_admin"] },
        { href: "/admin/audit", label: "Audit Logs", icon: FileText, roles: ["super_admin"] },
        { href: "/admin/system", label: "System", icon: Wrench, roles: ["super_admin"] },
      ],
    },
    {
      href: "/sources",
      label: "Sources",
      icon: Globe2,
      roles: ["super_admin"],
      group: "Platform",
      subItems: [
        { href: "/sources", label: "All Sources", icon: Globe2, roles: ["super_admin"] },
        { href: "/sources/add", label: "Add Source", icon: Globe2, roles: ["super_admin"] },
        { href: "/sources/health", label: "Health", icon: Activity, roles: ["super_admin"] },
      ],
    },
    {
      href: "/moderation",
      label: "Moderation",
      icon: BadgeCheck,
      roles: ["super_admin"],
      group: "Administration",
      subItems: [
        { href: "/moderation", label: "Queue", icon: ListChecks, roles: ["super_admin"] },
        { href: "/moderation/reports", label: "Reports", icon: FileText, roles: ["super_admin"] },
        { href: "/moderation/users", label: "Users", icon: Users, roles: ["super_admin"] },
      ],
    },
    {
      href: "/support",
      label: "Support",
      icon: MessageSquare,
      roles: ["super_admin"],
      group: "Platform",
      subItems: [
        { href: "/support", label: "Tickets", icon: ListChecks, roles: ["super_admin"] },
        { href: "/support/users", label: "Users", icon: Users, roles: ["super_admin"] },
      ],
    },
    {
      href: "/automation",
      label: "Automation",
      icon: Activity,
      roles: ["super_admin"],
      group: "Platform",
      subItems: [
        { href: "/automation", label: "Overview", icon: Activity, roles: ["super_admin"] },
        { href: "/automation/workflows", label: "Workflows", icon: Wrench, roles: ["super_admin"] },
        { href: "/automation/logs", label: "Logs", icon: Activity, roles: ["super_admin"] },
      ],
    },
    {
      href: "/dashboard",
      label: "Preview as Job Seeker",
      icon: UserRound,
      roles: ["super_admin"],
      group: "Preview",
    },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["super_admin"], group: "You" },
  ],
};

function useNav(role: RoleKey) {
  return useMemo(() => ROLE_NAV[role] ?? [], [role]);
  return useMemo(() => ROLE_NAV[role] ?? [], [role]);
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

/**
 * The bell is a real destination now, not decoration.
 *
 * The count comes from the API (the `notifications` table), refreshes on a
 * slow poll, and is re-read immediately when another view marks notifications
 * read via the `jr:notifications` event.
 */
function NotificationsBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void api
        .get<{ unreadCount: number }>("/me/notifications/unread-count")
        .then((data) => {
          if (!cancelled) setUnread(data.unreadCount ?? 0);
        })
        .catch(() => {
          // A failed count must never break the shell.
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("jr:notifications", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("jr:notifications", load);
    };
  }, []);

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <IconButton
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => router.push("/notifications")}
      >
        <Bell size={18} />
      </IconButton>
      {unread > 0 ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: 999,
            background: "var(--accent)",
            color: "var(--accent-contrast, #fff)",
            fontSize: "0.62rem",
            fontWeight: 700,
            lineHeight: "16px",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </div>
  );
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
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Job Radar</span>
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
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        background: "rgba(3, 6, 14, 0.7)",
        backdropFilter: "blur(4px)",
      }}
    >
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "transparent" }}
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        tabIndex={-1}
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
        <nav aria-label="Primary navigation">
          <div className="stack" style={{ gap: "0.2rem" }}>
            {nav.map((item) => (
              <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} onClick={onClose} />
            ))}
          </div>
        </nav>
      </div>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <div className="aurora-grid">
      <aside className={`glass aurora-side ${sidebarCollapsed ? "collapsed" : ""}`}>
        <Brand compact={sidebarCollapsed} />
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-toggle"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <NavStack nav={nav} pathname={pathname} collapsed={sidebarCollapsed} />
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
          <NotificationsBell />
          <Avatar name={session?.user.name ?? session?.user.email} size={32} />
        </header>

        <main id="main-content" className="main-pad" style={{ maxWidth: 1440, margin: "0 auto" }}>
          {children}
        </main>
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} nav={nav} />
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

      <main id="main-content" className="main-pad" style={{ maxWidth: 1240, margin: "0 auto" }}>
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

        <main id="main-content" style={{ flex: 1, minWidth: 0, padding: "1rem" }}>{children}</main>
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

      <main id="main-content" className="main-pad" style={{ flex: 1, maxWidth: 1500, margin: "0 auto", width: "100%" }}>
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

        <main id="main-content" style={{ minWidth: 0, display: "flex" }}>
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

function NavStack({ nav, pathname, collapsed }: { nav: NavItem[]; pathname: string; collapsed?: boolean }) {
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
              <NavLink
                key={item.href}
                item={item}
                active={pathname.startsWith(item.href)}
                collapsed={collapsed}
              />
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
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: collapsed ? 0 : "0.55rem",
        padding: collapsed ? "0.6rem 0.4rem" : "0.46rem 0.6rem",
        borderRadius: "var(--radius-md)",
        fontSize: "0.86rem",
        fontWeight: active ? 700 : 500,
        color: active ? "var(--accent)" : "var(--text-soft)",
        background: active ? "var(--accent-soft)" : "transparent",
        justifyContent: collapsed ? "center" : "flex-start",
      }}
    >
      <item.icon size={16} />
      {!collapsed && item.label}
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
