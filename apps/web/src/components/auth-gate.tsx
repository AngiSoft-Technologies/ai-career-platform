"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

/** Routes that belong to onboarding itself and must not be redirected. */
const ONBOARDING_PREFIX = "/onboarding";

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
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg)",
        }}
      >
        <Spinner />
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg)",
        }}
      >
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg)",
          padding: "2rem",
        }}
      >
        <div className="surface" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.9rem" }}>
            You need to sign in to open the radar.
          </p>
          <Button onClick={() => router.replace(`/login?next=${encodeURIComponent(pathname)}`)}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default AuthGate;
