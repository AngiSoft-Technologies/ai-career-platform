"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Field, Input, useToast } from "@/components/ui";
import { useSession } from "@/components/session";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { signIn, signUp } = useSession();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const next = params.get("next") ?? "/dashboard";

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
      toast.push(mode === "signin" ? "Welcome back" : "Account created", "success");
      router.replace(next);
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
          <div className="eyebrow">Start here</div>
          <h1
            className="display"
            style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", marginTop: 6, lineHeight: 1.05 }}
          >
            Turn on your radar
          </h1>
          <p style={{ color: "var(--text-muted)", lineHeight: 1.65, marginTop: "0.8rem" }}>
            One account, every board. Your profile is the only thing the AI uses, and you stay in
            control of every application.
          </p>
          <div className="stack" style={{ gap: "0.55rem", marginTop: "1.4rem" }}>
            {[
              { icon: Sparkles, text: "Ranked matches across every profession" },
              { icon: ShieldCheck, text: "Scam postings filtered before you see them" },
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
              {mode === "signin" ? "Sign in" : "Create my radar"} <ArrowRight size={15} />
            </Button>
          </form>

          <p
            style={{
              fontSize: "0.74rem",
              color: "var(--text-muted)",
              marginTop: "1rem",
              textAlign: "center",
            }}
          >
            By continuing you agree that we may store your profile to rank roles for you. We never
            submit an application on your behalf.
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
