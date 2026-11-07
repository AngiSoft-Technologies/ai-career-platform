"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  FilePen,
  Linkedin,
  Sparkles,
  Upload,
} from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { useOnboarding } from "@/lib/hooks";

interface StartPath {
  href: string;
  icon: typeof Upload;
  title: string;
  description: string;
  highlights: string[];
  primary?: boolean;
}

const PATHS: StartPath[] = [
  {
    href: "/onboarding/upload",
    icon: Upload,
    title: "Upload Resume",
    description:
      "PDF, DOCX, or an image. Our resume agent reads it, extracts the facts, and rebuilds it as a clean, ATS-ready document.",
    highlights: ["AI extraction", "Auto-formatting", "ATS check"],
    primary: true,
  },
  {
    href: "/onboarding/linkedin",
    icon: Linkedin,
    title: "Import from LinkedIn",
    description:
      "Connect your profile and we convert your experience, education, and skills into a structured resume.",
    highlights: ["One-click import", "Skills mapped", "Editable after"],
  },
  {
    href: "/onboarding/manual",
    icon: FilePen,
    title: "Build Manually",
    description:
      "Prefer to type it yourself? A guided builder walks you through basics, experience, education, and skills.",
    highlights: ["Guided steps", "Live preview", "Full control"],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();

  /**
   * Skips the whole resume step. The caller still lands in the app with a
   * usable account; they can build a resume later from Documents.
   */
  const skip = () => {
    void (async () => {
      await completeOnboarding();
      router.push("/dashboard");
    })();
  };

  return (
    <div
      className="stack"
      style={{ gap: "1.5rem", maxWidth: 720, margin: "0 auto" }}
    >
      <div style={{ textAlign: "center", paddingTop: "2rem" }}>
        <div className="eyebrow justify-center">
          <Sparkles size={16} /> Welcome to MboQara
        </div>
        <h1
          className="display"
          style={{ fontSize: "clamp(1.8rem, 5vw, 2.8rem)", marginTop: 8 }}
        >
          Build your professional resume in minutes
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "1.05rem",
            marginTop: 8,
            maxWidth: 520,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Choose how you want to get started. We extract, structure, and check
          your resume for ATS compatibility automatically.
        </p>
      </div>

      <div className="grid-3 gap-4">
        {PATHS.map((path) => {
          const Icon = path.icon;
          return (
            <Card
              key={path.href}
              hover
              onClick={() => router.push(path.href)}
              style={{
                padding: "1.5rem",
                cursor: "pointer",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: path.primary
                    ? "var(--accent)"
                    : "var(--accent-soft)",
                  color: path.primary ? "white" : "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 0.75rem",
                }}
              >
                <Icon size={26} />
              </div>
              <h3 style={{ marginBottom: 4 }}>{path.title}</h3>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.88rem",
                  flex: 1,
                }}
              >
                {path.description}
              </p>
              <div
                className="row"
                style={{
                  gap: "0.35rem",
                  justifyContent: "center",
                  flexWrap: "wrap",
                  fontSize: "0.72rem",
                  color: "var(--accent)",
                  marginTop: "0.5rem",
                }}
              >
                {path.highlights.map((highlight) => (
                  <span key={highlight} className="row" style={{ gap: 2 }}>
                    <Check size={12} /> {highlight}
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={skip}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            cursor: "pointer",
            padding: "0.5rem 0.75rem",
            borderRadius: 8,
          }}
        >
          Skip for now — I'll build my resume later
        </button>
      </div>

      <SectionTitle
        eyebrow="What happens next"
        title="One resume, used everywhere"
        description="After your resume is ready we ask a few matching questions — remote-only, relocation, and notifications — then start showing you roles that fit."
      />

      <Card style={{ padding: "1rem 1.25rem" }}>
        <ol
          style={{
            margin: 0,
            paddingLeft: "1.25rem",
            fontSize: "0.88rem",
            color: "var(--text-muted)",
            display: "grid",
            gap: "0.45rem",
          }}
        >
          <li>Your resume is parsed and stored as a clean document.</li>
          <li>The ATS verifier scores it and suggests concrete fixes.</li>
          <li>You set location and matching preferences.</li>
          <li>We start matching you to roles — location first.</li>
        </ol>
      </Card>

      <div className="row justify-center">
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "var(--text-muted)",
            fontSize: "0.9rem",
          }}
        >
          Skip for now <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
