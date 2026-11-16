"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

/** Routes that belong to onboarding itself and must not be redirected. */
const ONBOARDING_PREFIX = "/onboarding";

/** A full-screen hold while we know whether there is a session to show. */
function ScreenHold({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-app-bg p-6">
      {children}
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
      return;
    }

    // First sign-in: send the candidate through resume onboarding before
    // anything else. Declining still works — /onboarding is re-reachable.
    if (pathname.startsWith(ONBOARDING_PREFIX)) {
      setCheckingOnboarding(false);
      return;
    }

    let cancelled = false;
    api
      .get<{ completed: boolean }>("/profile/onboarding")
      .then((response) => {
        if (cancelled) return;
        if (!response.completed) {
          router.replace(`${ONBOARDING_PREFIX}?next=${encodeURIComponent(pathname)}`);
          return;
        }
        setCheckingOnboarding(false);
      })
      .catch(() => {
        if (!cancelled) setCheckingOnboarding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, session, pathname, router]);

  if (loading || checkingOnboarding) {
    return (
      <ScreenHold>
        <Spinner />
      </ScreenHold>
    );
  }

  if (!session) {
    return (
      <ScreenHold>
        <div className="rounded-app-lg border border-app-border bg-app-surface p-6 text-center">
          <p className="mb-3.5 text-[0.9rem] text-app-muted">
            You need to sign in to open MboQara.
          </p>
          <Button onClick={() => router.replace(`/login?next=${encodeURIComponent(pathname)}`)}>
            Go to sign in
          </Button>
        </div>
      </ScreenHold>
    );
  }

  return <>{children}</>;
}

export default AuthGate;