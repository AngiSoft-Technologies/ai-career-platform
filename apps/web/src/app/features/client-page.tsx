"use client";

import Link from "next/link";
import Image from "next/image";
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
  Search,
  Sparkles,
  ArrowRight,
} from "lucide-react";

;

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
  const f = features.data?.length ? features.data : [
    { id: "discover", title: "Discover opportunities", body: "Search across roles and sources, with your preferences in view.", icon: "Briefcase" },
    { id: "match", title: "Understand your match", body: "See how your skills and experience connect to a role.", icon: "Target" },
    { id: "prepare", title: "Prepare your application", body: "Bring relevant experience forward in your resume and cover letter.", icon: "FileText" },
    { id: "organize", title: "Track each next step", body: "Keep applications, follow-ups and documents together.", icon: "Mail" },
  ];

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

      <section className="jr-feature-story" aria-labelledby="feature-story-title">
        <div className="jr-feature-story__photo">
          <Image src="/media/careers/women-in-tech.webp" alt="A technologist working at a computer in a dark studio" fill sizes="(max-width: 760px) 100vw, 45vw" />
          <span>Illustrative career imagery</span>
        </div>
        <div className="jr-feature-story__copy">
          <span className="jr-eyebrow jr-eyebrow--dark">One search, connected steps</span>
          <h2 id="feature-story-title">Know what fits. Show why you fit.</h2>
          <p>Job Radar brings opportunity discovery, match insights, resume preparation and application tracking into one job-seeker workspace.</p>
          <div className="jr-feature-story__chips"><span><Search aria-hidden="true" /> Relevant roles</span><span><Target aria-hidden="true" /> Clear match details</span><span><FileText aria-hidden="true" /> Resume support</span></div>
          <Link href="/signup" className="jr-button jr-button--primary">Create my profile <ArrowRight aria-hidden="true" /></Link>
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
            <Link href="/opportunities" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Browse live jobs
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
