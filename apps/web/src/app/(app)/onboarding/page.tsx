"use client";

import { useRouter } from "next/navigation";
import {
  Check,
  FilePen,
  Linkedin,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button, Card, SectionTitle, cx } from "@/components/ui";
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
  const skip = async () => {
    await completeOnboarding();
    router.push("/dashboard");
  };

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-7">
      <header className="pt-8 text-center">
        <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.14em] text-app-accent uppercase">
          <Sparkles size={16} /> Welcome to MboQara
        </p>
        <h1 className="mt-2 text-[clamp(1.8rem,5vw,2.8rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-app-text">
          Build your professional resume in minutes
        </h1>
        <p className="mx-auto mt-3 max-w-[540px] text-[1.05rem] leading-relaxed text-app-muted">
          Choose how you want to get started. We extract, structure, and check your resume for ATS
          compatibility automatically.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {PATHS.map((path) => {
          const Icon = path.icon;
          return (
            <button
              key={path.href}
              type="button"
              onClick={() => router.push(path.href)}
              className={cx(
                "group flex cursor-pointer flex-col gap-1 rounded-app-lg border bg-app-surface p-6 text-center",
                "transition-[border-color,transform,box-shadow] duration-200",
                "hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-md",
                path.primary ? "border-app-accent/60" : "border-app-border",
              )}
            >
              <span
                className={cx(
                  "mx-auto mb-2 grid size-16 place-items-center rounded-full",
                  path.primary
                    ? "bg-app-accent text-app-accent-contrast"
                    : "bg-app-accent-soft text-app-accent",
                )}
              >
                <Icon size={26} />
              </span>
              <span className="text-[1.05rem] font-semibold text-app-text">{path.title}</span>
              <span className="mt-1 flex-1 text-[0.88rem] leading-relaxed text-app-muted">
                {path.description}
              </span>
              <span className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[0.72rem] text-app-accent">
                {path.highlights.map((highlight) => (
                  <span key={highlight} className="inline-flex items-center gap-1">
                    <Check size={12} /> {highlight}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" onClick={() => void skip()} className="text-app-muted">
          Skip for now — I&apos;ll build my resume later
        </Button>
      </div>

      <Card className="p-4 sm:p-5">
        <SectionTitle
          eyebrow="What happens next"
          title="One resume, used everywhere"
          description="After your resume is ready we ask a few matching questions — remote-only, relocation, and notifications — then start showing you roles that fit."
        />
        <ol className="mt-4 grid list-decimal gap-2 pl-5 text-[0.88rem] leading-relaxed text-app-soft">
          <li>Your resume is parsed and stored as a clean document.</li>
          <li>The ATS verifier scores it and suggests concrete fixes.</li>
          <li>You set location and matching preferences.</li>
          <li>We start matching you to roles — location first.</li>
        </ol>
      </Card>
    </div>
  );
}
