"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { requestPasswordReset, resetPassword } from "@/lib/auth";

/**
 * Password reset.
 *
 * The token arrives in the query string and is exchanged at the API, which
 * sets the new password and signs the user in.
 */
function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await requestPasswordReset(email);
    setBusy(false);
    if (ok) {
      setSent(true);
    } else {
      setError("We could not start the reset. Please try again.");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await resetPassword(token, password);
    setBusy(false);
    if (!ok) {
      setError("That reset link is no longer valid. Request a new one.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
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
        className="surface"
        style={{
          maxWidth: 460,
          margin: "10vh auto",
          padding: "1.6rem",
        }}
      >
        <div className="eyebrow">Account</div>
        <h1 className="display" style={{ fontSize: "1.6rem", marginTop: 6 }}>
          {token ? "Choose a new password" : "Reset your password"}
        </h1>

        {token ? (
          <form className="stack" style={{ gap: "0.8rem", marginTop: "1.1rem" }} onSubmit={submit}>
            <Field label="New password">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm password">
              <Input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            {error ? (
              <p role="alert" style={{ color: "var(--danger)", fontSize: "0.82rem" }}>
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} icon={<KeyRound size={15} />}>
              {busy ? "Saving…" : "Set new password"}
            </Button>
          </form>
        ) : sent ? (
          <p style={{ color: "var(--text-muted)", marginTop: "0.8rem" }}>
            If that address has an account, a reset link is on its way. Check your
            inbox.
          </p>
        ) : (
          <form className="stack" style={{ gap: "0.8rem", marginTop: "1.1rem" }} onSubmit={request}>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            {error ? (
              <p role="alert" style={{ color: "var(--danger)", fontSize: "0.82rem" }}>
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Email me a reset link"}
            </Button>
          </form>
        )}

        <p style={{ marginTop: "1rem" }}>
          <Link href="/login" className="btn btn-ghost btn-sm">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="landing" style={{ minHeight: "100dvh" }} />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
