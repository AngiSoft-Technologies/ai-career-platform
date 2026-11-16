"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
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
import { Avatar, IconButton, cx } from "@/components/ui";
import { useWebSocket, type RealtimeEvent } from "@/lib/realtime";
import { api, outboxSize } from "@/lib/api";
import type { Session } from "@/lib/auth";

/**
 * The application frame.
 *
 * One layout for every theme. The themes swap tokens — colour, radius,
 * typeface — and the frame reads those tokens, so a theme change never
 * changes the structure.
 *
 * The shell is a two-track grid: a rail whose width is a custom property,
 * and a fluid content column. Collapsing the rail animates the grid track,
 * so the content column genuinely reclaims the width instead of merely
 * sliding sideways under a hard max-width.
 */

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

/**
 * Where the sidebar's collapsed state lives between visits.
 *
 * The preference is read on the client after hydration (never during render),
 * so the server's HTML and the first client render agree and the person's
 * stored choice is never overwritten by the default.
 */
const SIDEBAR_COLLAPSED_KEY = "mboqara.sidebar.collapsed";

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
        { href: "/sources", label: "All sources", icon: Globe2, roles: ["source_curator"] },
        { href: "/sources/add", label: "Add source", icon: Globe2, roles: ["source_curator"] },
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
        { href: "/opportunities", label: "All jobs", icon: Compass, roles: ["source_curator"] },
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
        { href: "/companies", label: "All companies", icon: Users, roles: ["source_curator"] },
        { href: "/companies/add", label: "Add company", icon: Users, roles: ["source_curator"] },
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
        { href: "/admin/roles", label: "Roles and permissions", icon: ShieldCheck, roles: ["admin"] },
        { href: "/admin/invitations", label: "Invitations", icon: Users, roles: ["admin"] },
        { href: "/admin/taxonomy", label: "Taxonomy", icon: FileText, roles: ["admin"] },
        { href: "/admin/scam-corpus", label: "Scam corpus", icon: ShieldCheck, roles: ["admin"] },
      ],
    },
    {
      href: "/sources",
      label: "Sources",
      icon: Globe2,
      roles: ["admin"],
      group: "Platform",
      subItems: [
        { href: "/sources", label: "All sources", icon: Globe2, roles: ["admin"] },
        { href: "/sources/add", label: "Add source", icon: Globe2, roles: ["admin"] },
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
        { href: "/admin/roles", label: "Roles and permissions", icon: ShieldCheck, roles: ["super_admin"] },
        { href: "/admin/invitations", label: "Invitations", icon: Users, roles: ["super_admin"] },
        { href: "/admin/taxonomy", label: "Taxonomy", icon: FileText, roles: ["super_admin"] },
        { href: "/admin/scam-corpus", label: "Scam corpus", icon: ShieldCheck, roles: ["super_admin"] },
        { href: "/admin/audit", label: "Audit logs", icon: FileText, roles: ["super_admin"] },
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
        { href: "/sources", label: "All sources", icon: Globe2, roles: ["super_admin"] },
        { href: "/sources/add", label: "Add source", icon: Globe2, roles: ["super_admin"] },
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
      label: "Preview as job seeker",
      icon: UserRound,
      roles: ["super_admin"],
      group: "Preview",
    },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["super_admin"], group: "You" },
  ],
};

function useNav(role: RoleKey): NavItem[] {
  return useMemo(() => ROLE_NAV[role] ?? [], [role]);
}

/* ========================================================================== */
/* Frame                                                                      */
/* ========================================================================== */

export function AppShell({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  const { role } = useTheme();
  const nav = useNav(role);
  const pathname = usePathname();
  const { connected, events, pending } = useConnection();

  const [collapsed, setCollapsed] = useState(false);
  const [collapseReady, setCollapseReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The sidebar's collapsed state is a workspace preference, not a
  // per-navigation accident. Loading it on the client keeps the server and
  // first hydration render identical; writing it after that load means the
  // first render can never overwrite the person's stored choice.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
    } catch {
      setCollapsed(false);
    }
    setCollapseReady(true);
  }, []);

  useEffect(() => {
    if (!collapseReady) return;
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // A failed preference must never break the shell.
    }
  }, [collapsed, collapseReady]);

  // The drawer is a mobile affordance; leaving it open on a resize would
  // leave the content unreachable.
  useEffect(() => {
    if (!drawerOpen) return;
    const close = () => setDrawerOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [drawerOpen]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div
      // The shell is a two-track grid. The rail's width is the grid track,
      // so collapsing it animates the track and the content column beside
      // it genuinely reclaims the width — instead of the page merely
      // sliding sideways under a hard max-width.
      //
      // The track width is a custom property rather than a second
      // `lg:grid-cols-*` rule: two rules for the same property would have
      // to be ordered correctly against Tailwind's variant order, and the
      // data variant does not win that race. One rule reading one variable
      // has nothing to order.
      className="grid min-h-dvh grid-cols-1 transition-[grid-template-columns] duration-200 ease-out lg:grid-cols-[var(--rail-w)_minmax(0,1fr)]"
      style={{ "--rail-w": collapsed ? "80px" : "252px" } as React.CSSProperties}
    >
      {/* Desktop rail. It fills its grid track, so the track is the single
          source of truth for how wide it is. */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-hidden border-r border-app-border bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_92%,transparent),var(--bg))] backdrop-blur-xl lg:flex">
        <Sidebar
          nav={nav}
          pathname={pathname}
          collapsed={collapsed}
          session={session}
          connected={connected}
          pending={pending}
          onToggleCollapse={() => setCollapsed((value) => !value)}
        />
      </aside>

      {/* Mobile drawer. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[288px] max-w-[86vw] flex-col overflow-hidden border-r border-app-border bg-app-elevated shadow-app-lg">
            <Sidebar
              nav={nav}
              pathname={pathname}
              collapsed={false}
              session={session}
              connected={connected}
              pending={pending}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <TopBar
          session={session}
          onOpenDrawer={() => setDrawerOpen(true)}
          events={events}
          pathname={pathname}
        />
        <main
          id="main-content"
          className="mx-auto w-full max-w-shell-content flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8 2xl:px-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Rail                                                                       */
/* ========================================================================== */

function Sidebar({
  nav,
  pathname,
  collapsed,
  session,
  connected,
  pending,
  onToggleCollapse,
  onClose,
}: {
  nav: NavItem[];
  pathname: string;
  collapsed: boolean;
  session: Session | null;
  connected: boolean;
  pending: number;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  const { role } = useTheme();
  const groups = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of nav) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [nav]);

  const name = session?.user.name ?? session?.user.email ?? "Your account";

  return (
    <>
      <div
        className={cx(
          "flex h-shell-topbar shrink-0 items-center gap-2 border-b border-app-border px-3",
          collapsed && "justify-center px-2",
        )}
      >
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5"
          aria-label="MboQara home"
        >
          <span className="relative grid size-8 shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(140deg,var(--accent),var(--accent-2))] shadow-[0_6px_18px_color-mix(in_srgb,var(--accent)_38%,transparent)]">
            <img src="/brand/logo-mark.png" alt="" width={20} height={20} className="size-5" />
          </span>
          {collapsed ? null : (
            <span className="truncate text-[1.02rem] font-semibold tracking-[-0.025em] text-app-text">
              MboQara
            </span>
          )}
        </Link>

        <div className="ml-auto flex items-center gap-0.5">
          {onClose ? (
            <IconButton onClick={onClose} aria-label="Close navigation">
              <X size={17} />
            </IconButton>
          ) : null}
          {onToggleCollapse ? (
            <IconButton
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden lg:inline-grid"
            >
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </IconButton>
          ) : null}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-5">
        {groups.map(([group, items]) => (
          <div key={group} className="mb-6 last:mb-0">
            {collapsed ? (
              <div className="mx-auto mb-3 h-px w-6 bg-app-border" />
            ) : (
              <p className="px-2.5 pb-2 font-mono text-[0.56rem] font-semibold tracking-[0.22em] text-app-muted uppercase">
                {group}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={pathname.startsWith(item.href)} collapsed={collapsed} />
                  {item.subItems && !collapsed ? (
                    <ul className="mt-1 mb-1.5 ml-[21px] flex flex-col gap-0.5 border-l border-app-border pl-3">
                      {item.subItems.map((sub) => (
                        <li key={sub.href}>
                          <NavLink
                            item={sub}
                            active={pathname === sub.href}
                            collapsed={false}
                            nested
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-app-border p-2.5">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <Link href="/profile" aria-label="Your profile" title={name}>
              <Avatar name={name} size={30} />
            </Link>
            <span
              className={cx("size-2 rounded-full", connected ? "bg-app-success" : "bg-app-warning")}
              title={connected ? "Live" : "Reconnecting"}
              aria-label={connected ? "Live" : "Reconnecting"}
            />
          </div>
        ) : (
          <Link
            href="/profile"
            className="group flex items-center gap-2.5 rounded-app-md border border-transparent px-2 py-2 transition-colors duration-150 hover:border-app-border hover:bg-app-surface-2"
          >
            <Avatar name={name} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.82rem] font-medium text-app-text">{name}</span>
              <span className="block truncate text-[0.7rem] text-app-muted">
                {ROLE_LABELS[role]}
              </span>
            </span>
            <span
              className={cx(
                "size-1.5 shrink-0 rounded-full",
                connected ? "bg-app-success" : "bg-app-warning",
              )}
              aria-hidden
            />
          </Link>
        )}
        {pending > 0 ? (
          <p
            className={cx(
              "mt-1.5 rounded-app-sm bg-app-warning/12 px-2 py-1 font-mono text-[0.64rem] text-app-warning",
              collapsed && "text-center",
            )}
          >
            {collapsed ? pending : `${pending} queued offline`}
          </p>
        ) : null}
      </div>
    </>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  nested = false,
}: {
  item: NavItem | NavSubItem;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex items-center gap-2.5 rounded-app-md text-[0.83rem] transition-colors duration-150",
        nested ? "px-2 py-1.5" : "px-2.5 py-[7px]",
        collapsed && "justify-center px-0 py-2",
        active
          ? "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_18%,transparent),color-mix(in_srgb,var(--accent)_5%,transparent))] font-medium text-app-text"
          : "font-normal text-app-soft hover:bg-app-surface-2 hover:text-app-text",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className={cx(
            "absolute top-1/2 left-0 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-[linear-gradient(180deg,var(--accent),var(--accent-2))]",
            nested && "left-[-13px] h-3.5",
          )}
        />
      ) : null}
      <Icon
        size={nested ? 14 : 16}
        className={cx(
          "shrink-0 transition-colors duration-150",
          active ? "text-app-accent" : "text-app-muted group-hover:text-app-soft",
        )}
      />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
    </Link>
  );
}

/* ========================================================================== */
/* Top bar                                                                    */
/* ========================================================================== */

function TopBar({
  session,
  onOpenDrawer,
  events,
  pathname,
}: {
  session: Session | null;
  onOpenDrawer: () => void;
  events: RealtimeEvent[];
  pathname: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const segments = pathname.split("/").filter(Boolean).slice(0, 2);
  const trail = segments.map((segment) =>
    segment.replace(/-/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()),
  );

  return (
    <header className="sticky top-0 z-40 border-b border-app-border bg-app-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-shell-topbar w-full max-w-shell-content items-center gap-3 px-4 sm:px-6 lg:px-8 2xl:px-10">
        <IconButton
          onClick={onOpenDrawer}
          aria-label="Open navigation"
          className="lg:hidden"
        >
          <Menu size={18} />
        </IconButton>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 md:flex">
          <span className="font-mono text-[0.62rem] tracking-[0.18em] text-app-muted uppercase">
            MboQara
          </span>
          {trail.map((segment) => (
            <span key={segment} className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="text-app-muted/50">
                /
              </span>
              <span className="truncate text-[0.8rem] font-medium text-app-soft">{segment}</span>
            </span>
          ))}
        </nav>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const q = query.trim();
            router.push(q ? `/opportunities?q=${encodeURIComponent(q)}` : "/opportunities");
          }}
          className="relative ml-auto w-full min-w-0 max-w-md"
        >
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search roles, companies, skills"
            aria-label="Search"
            className="h-9 w-full rounded-app-md border border-app-border bg-app-surface-2/40 pr-16 pl-9 text-[0.82rem] text-app-text transition-colors duration-150 placeholder:text-app-muted focus:border-app-accent/60 focus:bg-app-surface-2 focus:outline-none"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-[4px] border border-app-border bg-app-surface-2 px-1.5 font-mono text-[0.6rem] text-app-muted sm:block">
            Enter
          </kbd>
        </form>

        <div className="flex shrink-0 items-center gap-1">
          <NotificationsBell events={events} />
          <Link
            href="/profile"
            className="ml-1 flex items-center gap-2 rounded-app-md py-1 pr-1 pl-1 transition-colors duration-150 hover:bg-app-surface-2"
          >
            <Avatar name={session?.user.name ?? session?.user.email} size={30} />
            <span className="hidden max-w-[12rem] truncate text-[0.8rem] font-medium text-app-soft xl:block">
              {session?.user.name ?? session?.user.email}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ========================================================================== */
/* Connection, notifications                                                   */
/* ========================================================================== */

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
 * The count comes from the API (the `notifications` table). It used to be
 * asked for every minute, which was a request per signed-in user per minute
 * to answer a question the server already knew the answer to.
 *
 * Now the server pushes: a notification is announced on the realtime
 * channel and the count moves without a request. What is left is a slow
 * safety net — a refresh when the tab comes back into view, and one every
 * few minutes for anything that arrived while the socket was down.
 */
const UNREAD_POLL_INTERVAL_MS = 5 * 60_000;

function NotificationsBell({ events }: { events: RealtimeEvent[] }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(() => {
    // One request at a time: a slow answer is better than two questions.
    if (inFlight.current) return inFlight.current;
    const request = api
      .get<{ unreadCount: number }>("/me/notifications/unread-count")
      .then((data) => {
        setUnread(data.unreadCount ?? 0);
      })
      .catch(() => {
        // A failed count must never break the shell.
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, []);

  // The server announces a notification; the count follows on its own.
  useEffect(() => {
    const latest = events[0];
    if (!latest) return;
    if (latest.type === "notification.created") {
      setUnread((count) => count + 1);
    }
  }, [events]);

  // The safety net: on load, when the tab comes back, and rarely otherwise.
  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") void load();
        schedule();
      }, UNREAD_POLL_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };

    void load();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  // The notifications page marks everything read; the count is known.
  useEffect(() => {
    const markRead = () => setUnread(0);
    window.addEventListener("jr:notifications", markRead);
    return () => window.removeEventListener("jr:notifications", markRead);
  }, []);

  return (
    <button
      type="button"
      onClick={() => router.push("/notifications")}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative inline-grid size-9 place-items-center rounded-app-md text-app-soft transition-colors duration-150 hover:bg-app-surface-2 hover:text-app-text"
    >
      <Bell size={17} />
      {unread > 0 ? (
        <span className="absolute top-1 right-0.5 grid min-w-4 place-items-center rounded-full bg-app-accent px-1 text-[0.6rem] leading-4 font-bold text-app-accent-contrast">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}

/* ========================================================================== */
/* Theme picker                                                               */
/* ========================================================================== */

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex flex-wrap gap-1.5">
      {THEMES.map((entry) => (
        <button
          key={entry.key}
          type="button"
          onClick={() => setTheme(entry.key)}
          aria-pressed={theme === entry.key}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] font-medium transition-colors duration-150",
            theme === entry.key
              ? "border-app-accent/45 bg-app-accent-soft text-app-accent"
              : "border-app-border text-app-muted hover:text-app-soft",
          )}
        >
          <span className="flex gap-0.5">
            {entry.swatch.map((color) => (
              <span
                key={color}
                className="size-2.5 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
            ))}
          </span>
          {entry.label}
        </button>
      ))}
    </div>
  );
}
