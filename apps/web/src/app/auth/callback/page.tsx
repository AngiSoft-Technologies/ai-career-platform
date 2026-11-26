"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  completeSignInFromFragment,
  takeNextPath,
} from "@/lib/auth";

/**
 * Landing page for a completed social sign-in.
 *
 * The API hands back a single-use code in the URL fragment, and the client
 * exchanges it for the session. The tokens are never in the address bar,
 * never in browser history and never in a shared link.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const fragment = window.location.hash.replace(/^#/, "");
      if (!fragment) {
        setError("That sign-in link is incomplete. Please try again.");
        return;
      }

      const completed = await completeSignInFromFragment(fragment);
      if (cancelled) return;

      if (!completed) {
        setError("That sign-in did not return a session. Please try again.");
        return;
      }

      // The fragment must not stay in the address bar.
      window.history.replaceState(null, "", window.location.pathname);

      // A full navigation is deliberate: the session now lives in
      // localStorage, and a fresh app boot reads it before AuthGate runs.
      // router.replace()+router.refresh() can cancel the pending navigation
      // and leave the callback page stuck on "signed in".
      window.location.replace(takeNextPath());
    };

    void finish();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="landing flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[460px] rounded-app-lg border border-app-border bg-app-surface p-7 text-center">
        {error ? (
          <>
            <h1 className="text-[1.4rem] font-semibold text-app-text">Sign-in failed</h1>
            <p role="alert" className="mt-2.5 text-[0.9rem] leading-relaxed text-app-muted">
              {error}
            </p>
            <button
              type="button"
              className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center rounded-app-md border border-app-accent bg-app-accent px-4 text-[0.875rem] font-semibold text-app-accent-contrast transition-opacity duration-150 hover:opacity-90"
              onClick={() => router.replace("/login")}
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <ShieldCheck size={28} className="mx-auto text-app-accent" />
            <h1 className="mt-3 text-[1.4rem] font-semibold text-app-text">You are signed in</h1>
            <p className="mt-2.5 text-[0.9rem] leading-relaxed text-app-muted">
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
    <Suspense fallback={<div className="landing min-h-dvh" />}>
      <AuthCallbackInner />
    </Suspense>
  );
}
