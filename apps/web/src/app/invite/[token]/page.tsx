"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { Button, Field, Input, useToast } from "@/components/ui";
import { API_URL } from "@/lib/auth";

interface InvitationDetails {
  email: string;
  role: string;
  expiresAt: string;
  status: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "a super admin",
  admin: "an admin",
  source_curator: "a source curator",
  moderator: "a moderator",
  support_agent: "a support agent",
  analyst: "an analyst",
};

function InviteInner({ token }: { token: string }) {
  const router = useRouter();
  const toast = useToast();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/invitations/${token}`, {
          headers: { accept: "application/json" },
        });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setError(
            payload?.error ?? "This invitation is no longer available.",
          );
          return;
        }
        setInvitation(payload as InvitationDetails);
      } catch {
        if (!cancelled) setError("We could not load that invitation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.push("Use at least 8 characters", "danger");
      return;
    }
    if (password !== confirm) {
      toast.push("Those passwords do not match", "danger");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/invitations/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          password,
          name: name.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.push(
          payload?.error ?? "We could not set your password. Try the link again.",
          "danger",
        );
        return;
      }

      const email = payload?.email ?? invitation?.email;
      const signIn = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!signIn.ok) {
        toast.push("Your password is set. Please sign in.", "success");
        router.replace("/login");
        return;
      }

      toast.push("Welcome to Job Radar", "success");
      window.location.assign("/dashboard");
    } catch {
      toast.push("We could not set your password. Try again.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const roleLabel = invitation
    ? ROLE_LABELS[invitation.role] ?? invitation.role
    : "";

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
          <div className="eyebrow">You are invited</div>
          <h1
            className="display"
            style={{
              fontSize: "clamp(1.9rem, 5vw, 3rem)",
              marginTop: 6,
              lineHeight: 1.05,
            }}
          >
            Join Job Radar
          </h1>
          {invitation ? (
            <p
              style={{
                color: "var(--text-muted)",
                lineHeight: 1.65,
                marginTop: "0.8rem",
              }}
            >
              You have been invited as {roleLabel}. Choose a password to set up your
              account and get started.
            </p>
          ) : (
            <p
              style={{
                color: "var(--text-muted)",
                lineHeight: 1.65,
                marginTop: "0.8rem",
              }}
            >
              {loading
                ? "Checking your invitation..."
                : "We could not open that invitation. Ask the person who invited you to send a new link."}
            </p>
          )}
          <div className="stack" style={{ gap: "0.55rem", marginTop: "1.4rem" }}>
            {[
              { icon: UserPlus, text: "One place for every role you track" },
              { icon: ShieldCheck, text: "Your documents stay private to you" },
              { icon: KeyRound, text: "You pick your own password" },
            ].map((item) => (
              <div key={item.text} className="row" style={{ gap: "0.55rem" }}>
                <item.icon size={15} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: "0.88rem" }}>{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface" style={{ padding: "1.5rem" }}>
          {error ? (
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
              {error}
            </p>
          ) : null}

          {invitation ? (
            <>
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  marginBottom: "0.9rem",
                }}
              >
                Setting up {invitation.email}
              </p>
              <form className="stack" style={{ gap: "0.8rem" }} onSubmit={submit}>
                <Field label="Your name" hint="Optional">
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Choose a password" hint="At least 8 characters">
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>
                <Field label="Confirm password">
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>
                <Button
                  type="submit"
                  loading={busy}
                  style={{ justifyContent: "center" }}
                >
                  Set password and join <ArrowRight size={15} />
                </Button>
              </form>
            </>
          ) : loading ? null : (
            <Link href="/login" className="btn btn-outline" style={{ width: "100%", justifyContent: "center" }}>
              Go to sign in
            </Link>
          )}

          <p
            style={{
              fontSize: "0.74rem",
              color: "var(--text-muted)",
              marginTop: "1rem",
              textAlign: "center",
            }}
          >
            By continuing, you agree to our Terms and Privacy Policy. We never submit
            an application on your behalf.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <InviteBoundary params={params} />
  );
}

function InviteBoundary({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void params.then((resolved) => {
      if (!cancelled) setToken(resolved.token);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (!token) {
    return <div className="landing" style={{ minHeight: "100dvh" }} />;
  }
  return <InviteInner token={token} />;
}
