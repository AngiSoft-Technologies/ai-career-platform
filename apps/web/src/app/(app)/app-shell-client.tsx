"use client";

import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/shell";
import { AuthGate } from "@/components/auth-gate";
import { useSession } from "@/components/session";
import { useOnlineStatus } from "@/lib/hooks";
import { replayOutbox } from "@/lib/api";

export function AppShellClient({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const online = useOnlineStatus();

  // Retry anything queued while the device was offline.
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
