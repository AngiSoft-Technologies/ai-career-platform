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
import { Button, Card, Field, Input, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useOnboarding } from "@/lib/hooks";

interface ImportedProfile {
  firstName?: string;
  lastName?: string;
  headline?: string;
  positions?: unknown[];
  skills?: unknown[];
}

export default function OnboardingLinkedInPage() {
  const router = useRouter();
  const toast = useToast();
  const { completeOnboarding } = useOnboarding();

  const [stage, setStage] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ImportedProfile | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [showUrlFallback, setShowUrlFallback] = useState(false);

  const finish = async (id: string) => {
    setDocumentId(id);
    setStage("done");
    await completeOnboarding("linkedin");
    toast.push("Profile imported. Continuing.", "success");
    router.push(`/onboarding/preferences?documentId=${id}`);
  };

  const startOAuth = async () => {
    setStage("working");
    setError(null);
    try {
      const { authUrl } = await api.post<{ authUrl: string }>(
        "/auth/linkedin",
        {},
      );
      window.location.href = authUrl;
    } catch (caught) {
      setStage("error");
      // No LinkedIn app registered yet — offer the URL route instead.
      setShowUrlFallback(true);
      setError(
        caught instanceof Error && caught.message
          ? "LinkedIn sign-in is unavailable right now. Paste your public profile URL below."
          : "LinkedIn sign-in is unavailable right now.",
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
    <div
      className="stack"
      style={{ gap: "1.5rem", maxWidth: 620, margin: "0 auto" }}
    >
      <div className="text-center">
        <Link
          href="/onboarding"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginBottom: "1rem",
          }}
        >
          <Link2 size={14} /> Back to options
        </Link>
        <div className="eyebrow justify-center">
          Import from LinkedIn
        </div>
        <h1
          className="display"
          style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", marginTop: 8 }}
        >
          Connect your LinkedIn profile
        </h1>
        <p className="text-muted mt-1">
          Sign in and we convert your experience, education and skills into a
          structured, ATS-ready resume.
        </p>
      </div>

      <Card className="p-6">
        <div className="stack gap-4 text-center">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#0077B520",
              color: "#0077B5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
            }}
          >
            <UserCheck size={26} />
          </div>
          <h3 style={{ marginBottom: 0 }}>What we will import</h3>
          <div
            className="grid-2"
            style={{ marginTop: "0.5rem", textAlign: "left", gap: "0.6rem" }}
          >
            {[
              "Profile & headline",
              "Work experience",
              "Education",
              "Skills",
            ].map((item) => (
              <div
                key={item}
                className="row"
                style={{ gap: "0.45rem", alignItems: "center", fontSize: "0.85rem" }}
              >
                <CheckCircle size={15} style={{ color: "var(--success)" }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card
        style={{
          padding: "1rem",
          background: "var(--info-soft)",
          borderColor: "var(--info)",
        }}
      >
        <div
          className="row"
          style={{ gap: "0.5rem", alignItems: "flex-start", fontSize: "0.85rem" }}
        >
          <AlertCircle
            size={16}
            style={{ color: "var(--info)", flexShrink: 0, marginTop: 2 }}
          />
          <span style={{ color: "var(--info)" }}>
            We only read what you authorise, we never post on your behalf, and
            you can revoke access at any time from LinkedIn.
          </span>
        </div>
      </Card>

      {error ? (
        <Card
          style={{
            padding: "1rem",
            borderColor: "var(--danger)",
            background: "var(--danger-soft)",
          }}
        >
          <div className="row" style={{ gap: "0.5rem", color: "var(--danger)" }}>
            <AlertCircle size={16} />
            <span className="text-[0.88rem]">{error}</span>
          </div>
        </Card>
      ) : null}

      <Button
        size="lg"
        loading={working}
        onClick={startOAuth}
        disabled={working}
        style={{ background: "#0077B5", borderColor: "#0077B5", color: "white" }}
      >
        {working ? <Loader2 size={16} /> : null}
        Continue with LinkedIn
      </Button>

      {showUrlFallback ? (
        <Card style={{ padding: "1.25rem" }}>
          <div className="stack gap-3">
            <h3 style={{ fontSize: "0.98rem", margin: 0 }}>
              Paste your public profile URL
            </h3>
            <p
              className="m-0 text-[0.82rem] text-muted"
            >
              We read the public page and convert it. LinkedIn may block
              automated reads — if so, upload a PDF instead.
            </p>
            <Field label="Profile URL">
              <Input
                value={profileUrl}
                onChange={(event) => setProfileUrl(event.target.value)}
                placeholder="https://www.linkedin.com/in/your-name"
                inputMode="url"
              />
            </Field>
            <Button
              variant="outline"
              loading={working}
              icon={<ArrowRight size={14} />}
              onClick={importByUrl}
            >
              Import profile
            </Button>
          </div>
        </Card>
      ) : (
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUrlFallback(true)}
          >
            Trouble signing in? Use my profile URL
          </Button>
        </div>
      )}

      {profile ? (
        <Card className="p-4">
          <div className="stack" style={{ gap: "0.3rem", fontSize: "0.85rem" }}>
            <div className="font-semibold">
              {profile.firstName} {profile.lastName}
            </div>
            <div className="text-muted">{profile.headline}</div>
          </div>
        </Card>
      ) : null}

      <Link
        href="/onboarding/manual"
        style={{
          textAlign: "center",
          display: "block",
          color: "var(--accent)",
          fontSize: "0.9rem",
        }}
      >
        Rather type it yourself? Build it manually →
      </Link>
    </div>
  );
}
