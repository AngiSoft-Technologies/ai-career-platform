"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Link2,
  Loader2,
  UserCheck,
} from "lucide-react";
import { Button, Card, Field, Input, useToast, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { rememberOnboardingPath } from "@/lib/onboarding";

export default function OnboardingLinkedInPage() {
  const router = useRouter();
  const toast = useToast();

  const [stage, setStage] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [showUrlFallback, setShowUrlFallback] = useState(false);

  const finish = (id: string) => {
    rememberOnboardingPath("linkedin");
    toast.push("Profile imported. Continuing.", "success");
    router.push(`/onboarding/preferences?documentId=${id}`);
  };

  const startOAuth = async () => {
    setStage("working");
    setError(null);
    try {
      const { authUrl } = await api.post<{ authUrl: string }>("/auth/linkedin", {});
      window.location.href = authUrl;
    } catch (caught) {
      setStage("error");
      // Whatever went wrong, the URL route is the way forward — but the
      // message says what actually happened instead of naming one cause.
      setShowUrlFallback(true);
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "LinkedIn sign-in is unavailable right now. Paste your public profile URL below.",
      );
    }
  };

  const importByUrl = async () => {
    const url = profileUrl.trim();
    if (!url) {
      setError("Paste your LinkedIn profile URL.");
      return;
    }
    setStage("working");
    setError(null);
    try {
      const result = await api.post<{
        document: { id: string };
        profile: { name: string; headline: string };
      }>("/auth/linkedin/import", { profileUrl: url });
      await finish(result.document.id);
    } catch (caught) {
      setStage("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "That profile could not be read. Upload a resume instead.",
      );
      toast.push("Profile import failed", "danger");
    }
  };

  const working = stage === "working";

  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-6">
      <header className="text-center">
        <Link
          href="/onboarding"
          className="mb-4 inline-flex items-center gap-1.5 text-[0.9rem] text-app-muted transition-colors hover:text-app-text"
        >
          <Link2 size={14} /> Back to options
        </Link>
        <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-app-accent uppercase">
          Import from LinkedIn
        </p>
        <h1 className="mt-2 text-[clamp(1.6rem,4vw,2.2rem)] leading-tight font-semibold text-app-text">
          Connect your LinkedIn profile
        </h1>
        <p className="mt-1 text-[0.92rem] leading-relaxed text-app-muted">
          Sign in and we convert your experience, education and skills into a structured, ATS-ready
          resume.
        </p>
      </header>

      <Card className="p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="grid size-16 place-items-center rounded-full bg-[#0077B5]/15 text-[#0077B5]">
            <UserCheck size={26} />
          </div>
          <h2 className="text-[1rem] font-semibold text-app-text">What we will import</h2>
          <div className="grid w-full gap-2.5 text-left sm:grid-cols-2">
            {["Profile & headline", "Work experience", "Education", "Skills"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-[0.85rem] text-app-soft">
                <CheckCircle size={15} className="shrink-0 text-app-success" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="border-app-info/40 bg-app-info/10 p-4">
        <div className="flex items-start gap-2 text-[0.85rem] leading-relaxed text-app-info">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            We only read what you authorise, we never post on your behalf, and you can revoke access
            at any time from LinkedIn.
          </span>
        </div>
      </Card>

      {error ? (
        <Card className="border-app-danger/40 bg-app-danger/10 p-4">
          <div className="flex items-start gap-2 text-app-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="text-[0.88rem] leading-relaxed">{error}</span>
          </div>
        </Card>
      ) : null}

      <Button
        size="lg"
        loading={working}
        onClick={() => void startOAuth()}
        disabled={working}
        className={cx(
          "justify-center border-[#0077B5] bg-[#0077B5] text-white hover:border-[#00669c] hover:bg-[#00669c]",
        )}
      >
        {working ? <Loader2 size={16} /> : null}
        Continue with LinkedIn
      </Button>

      {showUrlFallback ? (
        <Card className="p-5">
          <div className="flex flex-col gap-3">
            <h2 className="text-[0.98rem] font-semibold text-app-text">
              Paste your public profile URL
            </h2>
            <p className="text-[0.82rem] leading-relaxed text-app-muted">
              We read the public page and convert it. LinkedIn may block automated reads — if so,
              upload a PDF instead.
            </p>
            <Field label="Profile URL">
              <Input
                value={profileUrl}
                onChange={(event) => setProfileUrl(event.target.value)}
                placeholder="https://www.linkedin.com/in/your-name"
                inputMode="url"
              />
            </Field>
            <div>
              <Button
                variant="outline"
                loading={working}
                icon={<ArrowRight size={14} />}
                onClick={() => void importByUrl()}
              >
                Import profile
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => setShowUrlFallback(true)}>
            Trouble signing in? Use my profile URL
          </Button>
        </div>
      )}

      <Link
        href="/onboarding/manual"
        className="text-center text-[0.9rem] text-app-accent transition-opacity hover:opacity-80"
      >
        Rather type it yourself? Build it manually →
      </Link>
    </div>
  );
}
