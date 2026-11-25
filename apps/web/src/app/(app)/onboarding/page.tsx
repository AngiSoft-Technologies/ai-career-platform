"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  FilePen,
  Linkedin,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button, Page, Panel, PanelHead, Rows, Row, cx } from "@/components/ui";
import { useOnboarding } from "@/lib/hooks";

interface StartPath {
  href: string;
  icon: typeof Upload;
  title: string;
  description: string;
  highlights: string[];
  image: string;
  alt: string;
  primary?: boolean;
}

const PATHS: StartPath[] = [
  {
    href: "/onboarding/upload",
    icon: Upload,
    title: "Upload a resume",
    description:
      "PDF, DOCX, or an image. Our agent reads it, pulls out the facts, and rebuilds it as a clean, ATS-ready document.",
    highlights: ["AI extraction", "Auto-formatting", "ATS check"],
    image: "https://cdn1.angisoft.co.ke/mboqara/images/mboqara/careers/technology-professional.webp",
    alt: "A professional reviewing a document on a laptop",
    primary: true,
  },
  {
    href: "/onboarding/linkedin",
    icon: Linkedin,
    title: "Import from LinkedIn",
    description:
      "Connect your profile and we convert your experience, education and skills into a structured resume.",
    highlights: ["One-click import", "Skills mapped", "Editable after"],
    image: "https://cdn1.angisoft.co.ke/mboqara/images/mboqara/woman-laptop.webp",
    alt: "A woman working on her laptop",
  },
  {
    href: "/onboarding/manual",
    icon: FilePen,
    title: "Build it manually",
    description:
      "Prefer to type it yourself? A guided builder walks you through basics, experience, education and skills.",
    highlights: ["Guided steps", "Live preview", "Full control"],
    image: "https://cdn1.angisoft.co.ke/mboqara/images/mboqara/careers/women-in-tech.webp",
    alt: "A woman working at a desk",
  },
];

const STEPS = [
  {
    title: "Your resume is parsed and stored",
    description: "Your facts are pulled into a structured document you own and can edit.",
  },
  {
    title: "The ATS verifier scores it",
    description: "We check the document against what applicant tracking systems actually read.",
  },
  {
    title: "You set your matching preferences",
    description: "Location, contract type, seniority and whether you only work remotely.",
  },
  {
    title: "We start matching you to roles",
    description: "Every opening we monitor, ranked against the profile you just built.",
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
    <Page className="mx-auto max-w-[1080px]">
      {/* The hero is a photograph, not a gradient: the first thing a new
          person sees should look like the thing they came for. */}
      <section className="relative isolate overflow-hidden rounded-app-xl border border-app-border">
        <div className="relative min-h-[380px] lg:min-h-[440px]">
          <Image
            src="https://cdn1.angisoft.co.ke/mboqara/images/mboqara/career-fair.webp"
            alt="People talking to employers at a careers fair"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1080px"
            className="object-cover object-center"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(100deg,rgba(7,7,12,0.95)_0%,rgba(7,7,12,0.8)_34%,rgba(7,7,12,0.36)_66%,rgba(7,7,12,0.2)_100%)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(70%_120%_at_0%_0%,rgba(124,147,255,0.24),transparent_62%)]"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,rgba(7,7,12,0.94),rgba(7,7,12,0.4)_55%,transparent)]"
          />

          <div className="relative flex min-h-[380px] flex-col justify-end p-6 sm:p-9 lg:min-h-[440px] lg:p-12">
            <p className="flex items-center gap-2.5 font-mono text-[0.64rem] font-semibold tracking-[0.24em] text-white/60 uppercase">
              <span
                aria-hidden
                className="h-px w-8 bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
              />
              <Sparkles size={13} /> Welcome to MboQara
            </p>
            <h1 className="mt-4 max-w-[18ch] text-[clamp(2rem,5vw,3.4rem)] leading-[0.98] font-semibold tracking-[-0.03em] text-balance text-white">
              Build your professional resume in minutes
            </h1>
            <p className="mt-4 max-w-[54ch] text-[0.98rem] leading-relaxed text-white/70">
              Choose how you want to get started. We extract, structure and
              check your resume for ATS compatibility automatically.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              {PATHS.map((path) => (
                <Button
                  key={path.href}
                  variant={path.primary ? "primary" : "outline"}
                  size="sm"
                  onClick={() => router.push(path.href)}
                  className={
                    path.primary
                      ? undefined
                      : "border-white/25 bg-white/8 text-white hover:bg-white/14 hover:border-white/40"
                  }
                >
                  {path.title}
                  <ArrowRight size={14} />
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The three ways in. Each one is a photograph with the choice in it,
          so the screen is a set of doors rather than a set of buttons. */}
      <div className="grid gap-4 md:grid-cols-3">
        {PATHS.map((path) => {
          const Icon = path.icon;
          return (
            <button
              key={path.href}
              type="button"
              onClick={() => router.push(path.href)}
              className={cx(
                "group relative flex cursor-pointer flex-col overflow-hidden rounded-app-lg border bg-app-surface text-left",
                "transition-[border-color,transform,box-shadow] duration-200",
                "hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-lift",
                path.primary ? "border-app-accent/50" : "border-app-border",
              )}
            >
              <span className="relative block h-32 w-full overflow-hidden">
                <Image
                  src={path.image}
                  alt={path.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(to_top,rgba(7,7,12,0.92),rgba(7,7,12,0.25)_65%,transparent)]"
                />
                <span
                  className={cx(
                    "absolute bottom-3 left-3 grid size-9 place-items-center rounded-app-md border",
                    path.primary
                      ? "border-transparent bg-app-accent text-app-accent-contrast"
                      : "border-white/20 bg-black/45 text-white backdrop-blur-md",
                  )}
                >
                  <Icon size={17} />
                </span>
                {path.primary ? (
                  <span className="absolute top-3 right-3 rounded-app-pill bg-app-accent px-2.5 py-1 text-[0.62rem] font-semibold tracking-[0.08em] text-app-accent-contrast uppercase">
                    Fastest
                  </span>
                ) : null}
              </span>

              <span className="flex flex-1 flex-col p-5">
                <span className="text-[1.05rem] font-semibold text-app-text">
                  {path.title}
                </span>
                <span className="mt-1.5 flex-1 text-[0.86rem] leading-relaxed text-app-muted">
                  {path.description}
                </span>
                <span className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-app-border pt-3.5 text-[0.71rem] text-app-accent">
                  {path.highlights.map((highlight) => (
                    <span key={highlight} className="inline-flex items-center gap-1">
                      <Check size={12} /> {highlight}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Panel>
        <PanelHead
          eyebrow="What happens next"
          title="One resume, used everywhere"
          description="After your resume is ready we ask a few matching questions — remote-only, relocation and notifications — then start showing you the roles that fit."
        />
        <Rows className="border-t border-app-border">
          {STEPS.map((step, index) => (
            <Row key={step.title} as="li" className="items-start gap-4">
              <span className="font-mono text-[0.7rem] font-semibold tabular-nums text-app-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-[0.92rem] font-semibold text-app-text">{step.title}</p>
                <p className="mt-1 max-w-[62ch] text-[0.83rem] leading-relaxed text-app-muted">
                  {step.description}
                </p>
              </div>
            </Row>
          ))}
        </Rows>
      </Panel>

      <div className="flex justify-center pb-2">
        <Button variant="ghost" onClick={() => void skip()} className="text-app-muted">
          Skip for now — I&apos;ll build my resume later
        </Button>
      </div>
    </Page>
  );
}
