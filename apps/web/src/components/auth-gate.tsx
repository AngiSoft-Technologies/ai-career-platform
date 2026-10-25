"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/session";
import { Button, Spinner } from "@/components/ui";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [loading, session, pathname, router]);

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
