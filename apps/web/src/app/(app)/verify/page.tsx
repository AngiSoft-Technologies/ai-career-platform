"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import {
  fetchVerificationMethods,
  rememberNextPath,
  requestVerification,
  verifyTotp,
  type VerificationMethod,
  type VerificationMethodName,
} from "@/lib/auth";
import { useSession } from "@/components/session";
import { Badge, Button, Field, Input, Page, Panel, PanelHead, useToast } from "@/components/ui";

function methodTitle(method: VerificationMethodName): string {
  switch (method) {
    case "totp":
      return "Authenticator app";
    case "email_link":
      return "Email link";
    case "email_otp":
      return "Email code";
    case "passkey":
      return "Passkey";
  }
}

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { refresh } = useSession();

  const requestedNext = params.get("next") ?? "/dashboard";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  const [methods, setMethods] = useState<VerificationMethod[]>([]);
  const [selected, setSelected] = useState<VerificationMethodName>("email_link");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("verify_error") === "expired"
      ? "That verification link has expired. Request a new one."
      : null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchVerificationMethods().then((list) => {
      if (cancelled) return;
      setMethods(list);
      const preferred = list.find((method) => method.isDefault) ?? list[0];
      if (preferred) setSelected(preferred.method);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = methods.find((method) => method.method === selected) ?? null;

  const finish = useCallback(async () => {
    await refresh();
    router.replace(next);
    router.refresh();
  }, [next, refresh, router]);

  const submitCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyTotp(code.trim());
      if (!ok) {
        setError("That code did not match. Check your authenticator app and try again.");
        return;
      }
      toast.push("Verified", "success");
      await finish();
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    try {
      // The emailed link lands back on /auth/callback; remembering the
      // intended destination keeps the redirect honest across devices.
      rememberNextPath(next);
      const result = await requestVerification({ method: "email_link" });
      if (!result?.sent) {
        setError("The email could not be sent right now. Try again in a moment.");
        return;
      }
      setLinkSent(true);
      toast.push("Verification link sent", "success");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
        <Panel>
          <PanelHead
            eyebrow="Verify it is you"
            title="Confirm your identity"
            description="Your session is long-lived, so we check in once in a while. Pick a method and continue."
            action={<ShieldCheck size={16} className="text-app-muted" />}
          />
          <div className="border-t border-app-border px-5 py-5">
            {loading ? (
              <p className="text-[0.84rem] text-app-muted">Loading verification methods…</p>
            ) : methods.length === 0 ? (
              <p className="text-[0.84rem] leading-relaxed text-app-muted">
                No verification methods are enrolled yet.{" "}
                <Link href="/settings#security" className="text-app-accent underline">
                  Add an authenticator app
                </Link>{" "}
                in settings, or{" "}
                <Link href="/login" className="text-app-accent underline">
                  sign in again
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  {methods.map((method) => (
                    <button
                      key={`${method.method}:${method.destination}`}
                      type="button"
                      onClick={() => {
                        setSelected(method.method);
                        setError(null);
                        setLinkSent(false);
                      }}
                      className={`flex items-center justify-between gap-3 rounded-app-sm border px-3 py-2.5 text-left transition-colors ${
                        selected === method.method
                          ? "border-app-accent bg-app-accent/10"
                          : "border-app-border bg-app-surface-2/40 hover:border-app-muted"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 text-[0.84rem] text-app-soft">
                        {method.method === "totp" ? (
                          <KeyRound size={15} className="text-app-accent" aria-hidden />
                        ) : (
                          <Mail size={15} className="text-app-muted" aria-hidden />
                        )}
                        {methodTitle(method.method)}
                        <span className="text-app-muted">· {method.destination}</span>
                      </span>
                      {method.isDefault ? <Badge tone="accent" dot>default</Badge> : null}
                    </button>
                  ))}
                </div>

                {chosen?.method === "totp" ? (
                  <div className="flex flex-col gap-3">
                    <Field label="6-digit code">
                      <Input
                        value={code}
                        onChange={(event) =>
                          setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="123456"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && code.length === 6) void submitCode();
                        }}
                      />
                    </Field>
                    <Button onClick={submitCode} loading={busy} disabled={code.length !== 6}>
                      Verify
                    </Button>
                  </div>
                ) : chosen?.method === "email_link" ? (
                  <div className="flex flex-col gap-3">
                    {linkSent ? (
                      <p className="rounded-app-sm border border-app-success/30 bg-app-success/10 px-3 py-2.5 text-[0.82rem] leading-relaxed text-app-soft">
                        Link sent to {chosen.destination}. Open it on this device or any
                        device where you can sign in, then come back here.
                      </p>
                    ) : (
                      <p className="text-[0.82rem] leading-relaxed text-app-muted">
                        We will email a single-use link to {chosen.destination}. It signs you
                        in on whichever device opens it.
                      </p>
                    )}
                    <Button onClick={sendLink} loading={busy} variant={linkSent ? "outline" : "primary"}>
                      {linkSent ? "Send again" : "Email me a sign-in link"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[0.82rem] text-app-muted">
                    That method is not available yet. Choose another one above.
                  </p>
                )}

                {error ? (
                  <p role="alert" className="text-[0.8rem] text-app-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </Page>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <VerifyInner />
    </Suspense>
  );
}
