"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import {
  confirmTotpEnrollment,
  fetchVerificationMethods,
  startTotpEnrollment,
  type VerificationMethod,
} from "@/lib/auth";
import { Badge, Button, Field, Input, Panel, PanelHead, useToast } from "@/components/ui";

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

function methodLabel(method: VerificationMethod): string {
  switch (method.method) {
    case "totp":
      return "Authenticator app";
    case "email_link":
      return "Email link";
    case "email_otp":
      return "Email code";
    case "passkey":
      return "Passkey";
    default:
      return method.method;
  }
}

/**
 * Verification methods on the account.
 *
 * TOTP is the preferred method: it is fast, works offline and does not
 * depend on mail delivery. Email stays enrolled for everyone as the fallback
 * for when the default method is unavailable.
 */
export function VerificationPanel() {
  const toast = useToast();
  const [methods, setMethods] = useState<VerificationMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrolment, setEnrolment] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMethods(await fetchVerificationMethods());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totp = methods.find((method) => method.method === "totp");
  const email = methods.find((method) => method.method === "email_link");

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await startTotpEnrollment();
      if (!result) {
        setError("Could not start enrolment. Try again.");
        return;
      }
      setEnrolment(result);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await confirmTotpEnrollment(code.trim());
      if (!next) {
        setError("That code did not match. Check the time on your device and try again.");
        return;
      }
      setMethods(next);
      setEnrolment(null);
      setCode("");
      toast.push("Authenticator app connected", "success");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel id="security" className="scroll-mt-24">
      <PanelHead
        eyebrow="Security"
        title="Verification methods"
        description="Long sessions still re-verify on a schedule. Add an authenticator app for the fastest check; email remains as the fallback."
        action={<ShieldCheck size={16} className="text-app-muted" />}
      />
      <div className="border-t border-app-border px-5 py-5">
        {loading ? (
          <p className="text-[0.84rem] text-app-muted">Loading methods…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {totp ? (
                <li className="flex items-center justify-between gap-3 rounded-app-sm border border-app-border bg-app-surface-2/40 px-3 py-2.5">
                  <span className="flex items-center gap-2.5 text-[0.84rem] text-app-soft">
                    <KeyRound size={15} className="text-app-accent" aria-hidden />
                    {methodLabel(totp)}
                    <span className="text-app-muted">· {totp.destination}</span>
                  </span>
                  {totp.isDefault ? <Badge tone="accent" dot>default</Badge> : null}
                </li>
              ) : null}
              {email ? (
                <li className="flex items-center justify-between gap-3 rounded-app-sm border border-app-border bg-app-surface-2/40 px-3 py-2.5">
                  <span className="flex items-center gap-2.5 text-[0.84rem] text-app-soft">
                    <Mail size={15} className="text-app-muted" aria-hidden />
                    {methodLabel(email)}
                    <span className="text-app-muted">· {email.destination}</span>
                  </span>
                  {email.isDefault ? <Badge tone="accent" dot>default</Badge> : null}
                </li>
              ) : null}
            </ul>

            {enrolment ? (
              <div className="rounded-app-md border border-app-border bg-app-surface-2/40 p-4">
                <p className="text-[0.84rem] leading-relaxed text-app-soft">
                  Add this account to your authenticator app, then enter the 6-digit code it
                  shows.
                </p>
                <p className="mt-3 font-mono text-[0.95rem] tracking-[0.14em] text-app-text">
                  {groupSecret(enrolment.secret)}
                </p>
                <p className="mt-1 break-all font-mono text-[0.68rem] text-app-muted">
                  {enrolment.otpauthUrl}
                </p>
                <div className="mt-4">
                  <Field label="6-digit code">
                    <Input
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </Field>
                </div>
                {error ? (
                  <p role="alert" className="mt-3 text-[0.8rem] text-app-danger">
                    {error}
                  </p>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={confirm} loading={busy} disabled={code.length !== 6}>
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEnrolment(null);
                      setCode("");
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : totp ? null : (
              <div>
                <Button size="sm" variant="outline" onClick={begin} loading={busy}>
                  Set up authenticator app
                </Button>
                {error ? (
                  <p role="alert" className="mt-3 text-[0.8rem] text-app-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
