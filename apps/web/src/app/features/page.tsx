"use client";

import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import {
  Target,
  FileText,
  Mail,
  Briefcase,
  ShieldCheck,
  Rocket,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Features — Job Radar",
  description: "Find live jobs worldwide, tailor your resume and cover letter, and track every application. Built for job seekers.",
  openGraph: {
    title: "Features — Job Radar",
    description: "Find and apply to your dream job. Tailored resumes, cover letters and application tracking.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar features" }],
  },
};

interface FeatureContent {
  id: string;
  title: string;
  body: string;
  icon: string;
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  FileText,
  Mail,
  Briefcase,
  ShieldCheck,
  Rocket,
};

function IconFromName(name: string) {
  const Comp = ICON_MAP[name] || Rocket;
  return <Comp aria-hidden="true" />;
}

export default function FeaturesPage() {
  const hero = useApi<HeroContent>("/content/features/hero");
  const features = useApi<FeatureContent[]>("/content/features");

  const h = hero.data;
  const f = features.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="features-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">What Job Radar does for you</span>
            {h && (
              <>
                <h1 id="features-title" className="mk-heading" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}>
                  {h.title}
                </h1>
                <p className="mk-lede">{h.description}</p>
              </>
            )}
            {!h && (
              <>
                <h1 id="features-title" className="mk-heading" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}>
                  Find real jobs. Apply with confidence.
                </h1>
                <p className="mk-lede">
                  Job Radar helps students, graduates and professionals find openings worldwide, tailor resumes and
                  cover letters to each role, and track every application — all in one place.
                </p>
              </>
            )}
          </header>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="features-grid-heading">
        <div className="mk-container">
          {features.loading ? (
            <div className="mk-grid mk-grid--3" style={{ gap: "24px" }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="mk-card" style={{ height: "240px", display: "flex", flexDirection: "column", gap: "12px", padding: "28px" }}>
                  <div className="mk-card__icon" style={{ color: "var(--mk-text-muted)" }}><Sparkles /></div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--mk-text-muted)" }}>{"Loading…"}</div>
                  <div style={{ fontSize: "0.92rem", color: "var(--mk-text-soft)", lineHeight: 1.65 }}>{"Loading…"}</div>
                </div>
              ))}
            </div>
          ) : f.length === 0 ? (
            <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>No features configured yet.</p>
          ) : (
            <div className="mk-grid mk-grid--3">
              {f.map((feat, i) => (
                <Reveal key={feat.id} delay={i * 80} className="mk-card">
                  <div className="mk-card__icon">{IconFromName(feat.icon)}</div>
                  <h3 className="mk-card__title">{feat.title}</h3>
                  <p className="mk-card__text">{feat.body}</p>
                  <Link href="/signup" className="mk-btn mk-btn--ghost mk-btn--sm" style={{ marginTop: "16px", width: "fit-content" }}>
                    <ArrowRight aria-hidden="true" /> Get started
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Ready to find your next role?</h2>
          <p className="mk-cta__text">Create your profile, get matched to live jobs, and apply with a tailored resume and cover letter.</p>
          <div className="mk-cta__actions">
            <Link href="/signup" className="mk-btn mk-btn--primary mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Get started free
            </Link>
            <Link href="/jobs" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Browse live jobs
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
