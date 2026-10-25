"use client";

import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/shell";
import { AuthGate } from "@/components/auth-gate";
import { useSession } from "@/components/session";
import { useTheme } from "@/components/theme";
import { replayOutbox } from "@/lib/api";
import { useOnlineStatus } from "@/lib/hooks";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { role, hydrated } = useTheme();
  const online = useOnlineStatus();

  useEffect(() => {
    if (!hydrated) return;
    if (role !== "job_seeker" && role !== "analyst") return;
  }, [role, hydrated]);

  useEffect(() => {
    if (!online) return;
    void replayOutbox();
  }, [online]);

  return (
    <AuthGate>
      <AppShell session={session}>{children}</AppShell>
    </AuthGate>
  );
}
