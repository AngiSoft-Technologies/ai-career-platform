"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Field, Input, useToast } from "@/components/ui";
import { useSession } from "@/components/session";
import { signInWithGoogle } from "@/lib/auth";
import {
  continueAuthorization,
  hasProviderSession,
  startProviderSignIn,
} from "@/lib/oauth";
import { ROLE_HOME } from "@/components/theme";
import type { RoleKey } from "@/lib/types";

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.35-2.59Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59C7.2 7.72 9.4 5.96 12 5.96Z" />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { signIn, signUp, session, loading } = useSession();

  const authError = params.get("error");
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [notice, setNotice] = useState<"failed" | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (authError) setNotice("failed");
  }, [authError]);

  const requestedNext = params.get("next") ?? "/dashboard";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  /**
   * The signed authorization request.
   *
   * The provider redirects the browser here with the authorization request as
   * query parameters. The query is signed and expires, so it is handed back
   * exactly as received.
   */
  const oauthQuery = useMemo(() => {
    const explicit = params.get("oauth_query");
    if (explicit) return explicit;
    const raw = params.toString();
    if (!raw) return "";
    const signed = new URLSearchParams(raw);
    if (signed.get("client_id") && signed.get("sig")) return raw;
    return "";
  }, [params]);

  const provider = useMemo(() => {
    if (!oauthQuery) return "";
    const signed = new URLSearchParams(oauthQuery);
    return signed.get("provider") ?? "";
  }, [oauthQuery]);

  const resumeAuthorization = useCallback(async () => {
    if (!oauthQuery) return false;
    const url = await continueAuthorization(oauthQuery);
    if (!url) return false;
    window.location.assign(url);
    return true;
  }, [oauthQuery]);

  /**
   * Drives the provider sign-in for a pending authorization request.
   *
   * The provider verifies the signed query, signs the user in and resumes the
   * authorization request once the provider returns. The browser comes back
   * here with a session, and the flow continues from there.
   */
  const beginProviderSignIn = useCallback(async () => {
    if (!oauthQuery || !provider) return false;
    const url = await startProviderSignIn(provider, oauthQuery);
    if (!url) return false;
    window.location.assign(url);
    return true;
  }, [oauthQuery, provider]);

  const flowStarted = useRef(false);

  useEffect(() => {
    if (loading || !oauthQuery || flowStarted.current) return;
    flowStarted.current = true;

    void (async () => {
      // With a provider session the authorization request can be resumed.
      if (await hasProviderSession()) {
        if (await resumeAuthorization()) return;
      }

      // Without one the provider has to sign the user in first.
      if (await beginProviderSignIn()) return;

      setOauthError("We could not start the sign-in. Please try again.");
    })();
  }, [
    loading,
    oauthQuery,
    resumeAuthorization,
    beginProviderSignIn,
  ]);

  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    try {
      const returnTo = oauthQuery
        ? `${window.location.pathname}${window.location.search}`
        : next;
      const started = await signInWithGoogle(returnTo);
      if (!started) {
        toast.push("Google sign-in is not available right now", "danger");
      }
    } catch {
      toast.push("Google sign-in is not available right now", "danger");
    } finally {
      setGoogleBusy(false);
    }
  };

  const getRoleHome = (roles: string[]): string => {
    const order: RoleKey[] = ["super_admin", "admin", "moderator", "source_curator", "support_agent", "analyst", "job_seeker"];
    for (const r of order) {
      if (roles.includes(r)) {
        const home = ROLE_HOME[r];
        if (home) return home;
      }
    }
    return "/dashboard";
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const ok =
        mode === "signin"
          ? await signIn(email, password)
          : await signUp(email, password, name);
      if (!ok) {
        toast.push(
          mode === "signin"
            ? "That email and password did not work"
            : "We could not create that account",
          "danger",
        );
        return;
      }
      if (await resumeAuthorization()) return;
      toast.push(mode === "signin" ? "Welcome back" : "Account created", "success");
      const home = getRoleHome(session?.roles ?? []);
      router.replace(home);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

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
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1.2rem",
          maxWidth: 980,
          width: "100%",
          margin: "0 auto",
          padding: "clamp(1.5rem, 6vw, 4rem) clamp(1rem, 5vw, 3rem)",
          alignItems: "center",
        }}
      >
        <section>
          <div className="eyebrow">Job Radar</div>
          <h1
            className="display"
            style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", marginTop: 6, lineHeight: 1.05 }}
          >
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{ color: "var(--text-muted)", lineHeight: 1.65, marginTop: "0.8rem" }}>
            Find roles that fit, prepare your applications and keep every next step in one place.
          </p>
          <div className="stack" style={{ gap: "0.55rem", marginTop: "1.4rem" }}>
            {[
              { icon: Sparkles, text: "Roles across every profession" },
              { icon: ShieldCheck, text: "Clear fit details for every role" },
              { icon: KeyRound, text: "Your documents stay private to you" },
            ].map((item) => (
              <div key={item.text} className="row" style={{ gap: "0.55rem" }}>
                <item.icon size={15} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: "0.88rem" }}>{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface" style={{ padding: "1.5rem" }}>
          {notice ? (
            <p
              role="alert"
              style={{
                margin: "0 0 1rem",
                padding: "0.7rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--danger-soft)",
                color: "var(--text)",
                fontSize: "0.82rem",
                lineHeight: 1.5,
              }}
            >
              Sign-in did not finish. Try again or sign in with email.
            </p>
          ) : null}
          {oauthError ? (
            <p
              role="alert"
              style={{
                margin: "0 0 1rem",
                padding: "0.7rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--danger-soft)",
                color: "var(--text)",
                fontSize: "0.82rem",
                lineHeight: 1.5,
              }}
            >
              {oauthError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-outline"
            onClick={continueWithGoogle}
            disabled={googleBusy || busy}
            style={{ width: "100%", justifyContent: "center", gap: "0.55rem" }}
          >
            <GoogleMark />
            {googleBusy ? "Opening Google…" : "Continue with Google"}
          </button>

          <div
            className="row"
            style={{
              gap: "0.65rem",
              margin: "1rem 0 1.1rem",
              color: "var(--text-muted)",
              fontSize: "0.72rem",
              whiteSpace: "nowrap",
            }}
          >
            <hr className="divider" style={{ flex: 1 }} />
            or continue with email
            <hr className="divider" style={{ flex: 1 }} />
          </div>

          <div className="row" style={{ gap: "0.4rem", marginBottom: "1.1rem" }}>
            {(["signin", "signup"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`btn btn-sm ${mode === option ? "btn-primary" : "btn-ghost"}`}
                style={{ flex: 1 }}
                onClick={() => setMode(option)}
              >
                {option === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form className="stack" style={{ gap: "0.8rem" }} onSubmit={submit}>
            {mode === "signup" ? (
              <Field label="Full name">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </Field>
            ) : null}

            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
              />
            </Field>

            <Button type="submit" loading={busy} style={{ justifyContent: "center" }}>
              {mode === "signin" ? "Sign in" : "Create account"} <ArrowRight size={15} />
            </Button>

            {mode === "signin" ? (
              <p style={{ textAlign: "center", marginTop: "0.2rem" }}>
                <Link
                  href="/reset-password"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: "0.78rem" }}
                >
                  Forgot your password?
                </Link>
              </p>
            ) : null}
          </form>

          <p
            style={{
              fontSize: "0.74rem",
              color: "var(--text-muted)",
              marginTop: "1rem",
              textAlign: "center",
            }}
          >
            By continuing, you agree to our Terms and Privacy Policy. We never submit an
            application on your behalf.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="landing" style={{ minHeight: "100dvh" }} />}>
      <LoginInner />
    </Suspense>
  );
}
