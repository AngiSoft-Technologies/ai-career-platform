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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverRoles, setServerRoles] = useState<RoleKey[]>([]);
  const [serverPermissions, setServerPermissions] = useState<string[]>([]);

  const refresh = useCallback(async () => {
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

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