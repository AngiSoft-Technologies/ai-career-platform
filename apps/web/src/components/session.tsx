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
import { usePathname } from "next/navigation";
import {
  cachedSession,
  clearSession,
  fetchSession,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  type Session,
} from "@/lib/auth";
import { api } from "@/lib/api";
import { useTheme } from "@/components/theme";
import type { RoleKey } from "@/lib/types";

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  roles: RoleKey[];
  permissions: string[];
  primaryRole: RoleKey;
  has: (permission: string) => boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, name: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  roles: ["job_seeker"],
  permissions: [],
  primaryRole: "job_seeker",
  has: () => false,
  refresh: async () => undefined,
  signIn: async () => false,
  signUp: async () => false,
  signOut: async () => undefined,
});

const ROLE_ORDER: RoleKey[] = [
  "super_admin",
  "admin",
  "source_curator",
  "moderator",
  "support_agent",
  "automation",
  "analyst",
  "job_seeker",
];

/**
 * Pages a visitor can fully use without an account. The session probe would
 * otherwise answer 401 on every public landing page, which shows up as a
 * browser console error even though "not signed in" is the expected state.
 */
const SESSION_FREE_PREFIXES = [
  "/about",
  "/accessibility",
  "/careers",
  "/consent",
  "/contact",
  "/cookies",
  "/download",
  "/faq",
  "/features",
  "/guides",
  "/legal",
  "/login",
  "/opportunities",
  "/pricing",
  "/privacy",
  "/reset-password",
  "/security",
  "/signup",
  "/terms",
];

function isSessionFreePath(pathname: string): boolean {
  if (pathname === "/") return true;
  return SESSION_FREE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverRoles, setServerRoles] = useState<RoleKey[]>([]);
  const [serverPermissions, setServerPermissions] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchSession();
      setSession(next);
      if (!next) {
        const cached = cachedSession();
        if (cached) setSession(cached);
      }
    } catch {
      const cached = cachedSession();
      if (cached) setSession(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  const pathname = usePathname();
  const sessionFree = useMemo(
    () => isSessionFreePath(pathname),
    [pathname],
  );

  useEffect(() => {
    if (sessionFree) {
      // Public pages only need to know whether this browser already has an
      // account. The cached session answers that without a 401 request.
      setSession(cachedSession());
      setLoading(false);
      return;
    }
    void refresh();
  }, [sessionFree, refresh]);

  const loadIdentity = useCallback(async (userId: string) => {
    try {
      const identity = await api.get<{
        roles: string[];
        permissions: string[];
        user: { id: string; email: string; name: string | null };
      }>("/me");
      const granted = (identity.roles ?? []).filter((name): name is RoleKey =>
        ROLE_ORDER.includes(name as RoleKey),
      );
      setServerRoles(granted);
      setServerPermissions(identity.permissions ?? []);
    } catch {
      return;
    }
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    void loadIdentity(userId);
  }, [userId, loadIdentity]);

  const roles = useMemo(() => {
    if (serverRoles.length > 0) return serverRoles;
    return ["job_seeker"] as RoleKey[];
  }, [serverRoles]);

  const permissions = serverPermissions;

  const primaryRole = useMemo(() => {
    for (const candidate of ROLE_ORDER) {
      if (roles.includes(candidate)) return candidate;
    }
    return "job_seeker" as RoleKey;
  }, [roles]);

  const { setRole: setThemeRole } = useTheme();

  // Sync backend-assigned roles into the theme context so the shell renders
  // the correct navigation for the user's actual role (not job_seeker by default).
  useEffect(() => {
    setThemeRole(primaryRole);
  }, [primaryRole, setThemeRole]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      loading,
      roles,
      permissions,
      primaryRole,
      has: (permission) => permissions.includes(permission),
      refresh,
      signIn: async (email, password) => {
        const ok = await authSignIn(email, password);
        if (ok) await refresh();
        return ok;
      },
      signUp: async (email, password, name) => {
        const ok = await authSignUp(email, password, name);
        if (ok) await refresh();
        return ok;
      },
      signOut: async () => {
        await authSignOut();
        setSession(null);
        setServerRoles([]);
        setServerPermissions([]);
        clearSession();
      },
    }),
    [session, loading, roles, permissions, primaryRole, refresh],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}