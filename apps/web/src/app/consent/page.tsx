"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useSession } from "@/components/session";
import {
  fetchPublicClient,
  hostOf,
  parseAuthorizationRequest,
  respondToConsent,
  type PublicClient,
} from "@/lib/oauth";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "Your name and profile",
  email: "Your email address",
  offline_access: "Keep you signed in on this device",
};

function ConsentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, loading } = useSession();
  const [client, setClient] = useState<PublicClient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthQuery = params.get("oauth_query") ?? "";
  const request = parseAuthorizationRequest(oauthQuery);

  useEffect(() => {
    if (!request.clientId) return;
    let cancelled = false;
    void fetchPublicClient(request.clientId).then((result) => {
      if (!cancelled) setClient(result);
    });
    return () => {
      cancelled = true;
    };
  }, [request.clientId]);

  useEffect(() => {
    if (loading || session || !oauthQuery) return;
    router.replace(`/login?oauth_query=${encodeURIComponent(oauthQuery)}`);
  }, [loading, session, oauthQuery, router]);

  const decide = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const url = await respondToConsent(accept, oauthQuery);
      if (!url) {
        setError(
          accept
            ? "We could not complete that request. Please try again."
            : "We could not cancel that request. Please try again.",
        );
        return;
      }
      window.location.assign(url);
    } finally {
      setBusy(false);
    }
  };

  if (!oauthQuery) {
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
          <h1 className="display" style={{ fontSize: "1.4rem" }}>
            Nothing to approve
          </h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.6rem" }}>
            This link is incomplete. Open the app you were trying to connect and
            start again.
          </p>
          <Link href="/" className="btn btn-primary" style={{ marginTop: "1rem" }}>
            Back to Job Radar
          </Link>
        </div>
      </main>
    );
  }

  const clientName = client?.client_name || "This app";
  const resourceHost = request.resource ? hostOf(request.resource) : "";

  return (
    <main className="landing" style={{ minHeight: "100dvh" }}>
      <nav className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="Job Radar home">
          <img
            src="/brand/logo-wordmark-light.png"
            alt="Job Radar"
            width={146}
            height={41}
          />
        </Link>
        <Link href="/" className="btn btn-ghost btn-sm">
          Back home
        </Link>
      </nav>

      <div
        className="surface"
        style={{ maxWidth: 480, margin: "10vh auto", padding: "1.6rem" }}
      >
        <div className="eyebrow">Connect an app</div>
        <h1
          className="display"
          style={{ fontSize: "1.6rem", marginTop: 6, lineHeight: 1.1 }}
        >
          Let {clientName} use your Job Radar account?
        </h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.7rem", lineHeight: 1.6 }}>
          It will only see what you approve below. You can disconnect it any time
          from your settings.
        </p>

        <ul
          className="stack"
          style={{ gap: "0.5rem", margin: "1.1rem 0", listStyle: "none" }}
        >
          {request.scopes.length > 0 ? (
            request.scopes.map((scope) => (
              <li key={scope} className="row" style={{ gap: "0.55rem" }}>
                <ShieldCheck size={15} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: "0.88rem" }}>
                  {SCOPE_LABELS[scope] ?? scope}
                </span>
              </li>
            ))
          ) : (
            <li className="row" style={{ gap: "0.55rem" }}>
              <ShieldCheck size={15} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "0.88rem" }}>
                Your name, email address and profile
              </span>
            </li>
          )}
        </ul>

        {resourceHost ? (
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Connected to {resourceHost}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            style={{
              margin: "0.8rem 0 0",
              padding: "0.7rem 0.8rem",
              borderRadius: "var(--radius-sm)",
              background: "var(--danger-soft)",
              fontSize: "0.82rem",
            }}
          >
            {error}
          </p>
        ) : null}

        <div
          className="row"
          style={{ gap: "0.6rem", marginTop: "1.3rem", flexWrap: "wrap" }}
        >
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || loading || !session}
            onClick={() => void decide(true)}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {busy ? "Working…" : "Allow access"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy || loading}
            onClick={() => void decide(false)}
            style={{ flex: 1, justifyContent: "center" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={<div className="landing" style={{ minHeight: "100dvh" }} />}>
      <ConsentInner />
    </Suspense>
  );
}
