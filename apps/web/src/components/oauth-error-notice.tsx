"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";

/**
 * Says what the provider said.
 *
 * The provider ends a sign-in by sending the browser back to the site with
 * an error in the address bar. Without this, the person lands on the home
 * page as if nothing had happened, which is how a sign-in that failed looks
 * exactly like a sign-in that never started.
 */
const COPY: Record<string, string> = {
  state_mismatch:
    "That sign-in could not be matched to this browser. It may have been started in another tab — please try again.",
  access_denied: "The sign-in was declined. Nothing has been changed.",
  invalid_request: "The sign-in request was not valid. Please try again.",
  server_error: "The sign-in service had a problem. Please try again in a moment.",
};

export function OAuthErrorNotice() {
  const params = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const code = params.get("error");
  const reason = params.get("reason");

  useEffect(() => {
    setDismissed(false);
  }, [code]);

  if (!code || dismissed) return null;

  const message =
    COPY[code] ??
    reason ??
    "The sign-in did not complete. Please try again.";

  return (
    <div className="fixed inset-x-0 top-0 z-[300] flex justify-center px-4 pt-4">
      <div
        role="alert"
        className="flex w-full max-w-2xl items-start gap-3 rounded-[var(--mk-radius-lg)] border border-[rgba(242,163,60,0.45)] bg-[rgba(28,22,14,0.96)] px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--mk-signal)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[0.95rem] leading-[1.55] text-[var(--mk-text)]">
            {message}
          </p>
          <Link
            href="/login"
            className="mt-1.5 inline-block text-[0.85rem] font-semibold text-[var(--mk-signal)] underline underline-offset-4"
          >
            Try signing in again
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--mk-text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--mk-text)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
