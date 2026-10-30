"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  storeSessionFromFragment,
  takeNextPath,
} from "@/lib/auth";

/**
 * Landing page for a completed social sign-in.
 *
 * The API hands the session back in the URL fragment, so the tokens are never
 * sent to a server, never logged and never stored in browser history.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = window.location.hash.replace(/^#/, "");
    if (!fragment) {
      setError("That sign-in link is incomplete. Please try again.");
      return;
    }

    if (!storeSessionFromFragment(fragment)) {
      setError("That sign-in did not return a session. Please try again.");
      return;
    }

    // The fragment must not stay in the address bar.
    window.history.replaceState(null, "", window.location.pathname);

    router.replace(takeNextPath());
    router.refresh();
  }, [router]);

  return (
    <main className="landing" style={{ minHeight: "100dvh" }}>
      <div
        className="surface"
        style={{
          maxWidth: 460,
          margin: "12vh auto",
          padding: "1.6rem",
          textAlign: "center",
        }}
      >
        {error ? (
          <>
            <h1 className="display" style={{ fontSize: "1.4rem" }}>
              Sign-in failed
            </h1>
            <p
              role="alert"
              style={{ color: "var(--text-muted)", marginTop: "0.6rem" }}
            >
              {error}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
              onClick={() => router.replace("/login")}
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <ShieldCheck size={28} style={{ color: "var(--accent)" }} />
            <h1 className="display" style={{ fontSize: "1.4rem", marginTop: "0.8rem" }}>
              You are signed in
            </h1>
            <p style={{ color: "var(--text-muted)", marginTop: "0.6rem" }}>
              Taking you to your dashboard…
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="landing" style={{ minHeight: "100dvh" }} />}>
      <AuthCallbackInner />
    </Suspense>
  );
}
