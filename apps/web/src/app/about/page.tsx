"use client";

import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import {
  Rocket,
  Target,
  FileText,
  Mail,
  Briefcase,
  ShieldCheck,
  Clock,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "About Job Radar",
  description: "Job Radar helps you find real jobs worldwide, tailor resumes and cover letters, and track every application. Free during beta.",
  openGraph: {
    title: "About Job Radar",
    description: "Find and apply to your dream job with Job Radar.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

interface BenefitContent {
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

interface ComparisonColumn {
  id: string;
  label: string;
  items: string[];
  check: boolean;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  FileText,
  Mail,
  Briefcase,
  ShieldCheck,
  Clock,
};

function IconFromName(name: string) {
  const Comp = ICON_MAP[name] || Rocket;
  return <Comp aria-hidden="true" />;
}

export default function AboutPage() {
  const hero = useApi<HeroContent>("/content/about/hero");
  const benefits = useApi<BenefitContent[]>("/content/about/benefits");
  const comparison = useApi<ComparisonColumn[]>("/content/about/comparison");

  const h = hero.data;
  const b = benefits.data ?? [];
  const c = comparison.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-about-hero" aria-labelledby="about-title">
        <div className="mk-about-hero__inner">
          <Reveal delay={0}>
            <span className="mk-hero__eyebrow">
              <Rocket aria-hidden="true" /> Built for job seekers
            </span>
          </Reveal>
          <Reveal delay={100}>
            {h && (
              <>
                <h1 id="about-title" className="mk-heading">{h.title}</h1>
                <p className="mk-lede">{h.description}</p>
              </>
            )}
            {!h && (
              <>
                <h1 id="about-title" className="mk-heading">Find your dream job. Faster.</h1>
                <p className="mk-lede">
                  Job Radar helps students, graduates and professionals find real openings worldwide, tailor resumes and
                  cover letters to each role, and track every application — all in one place.
                </p>
              </>
            )}
          </Reveal>
          <div className="mk-hero__cta" style={{ marginTop: "32px" }}>
            <Link href="/signup" className="mk-btn mk-btn--primary mk-btn--lg">
              <Rocket aria-hidden="true" /> Start finding jobs — free
            </Link>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="features-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">What we do for you</span>
            <h2 id="features-heading" className="mk-section-heading">Your job search, organised</h2>
          </header>
          <div className="mk-grid mk-grid--3">
            {benefits.loading ? (
              <div className="mk-grid mk-grid--3" style={{ gap: "24px" }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="mk-card" style={{ height: "200px", display: "flex", flexDirection: "column", gap: "12px", padding: "24px" }}>
                    <div className="mk-card__icon" style={{ color: "var(--mk-text-muted)" }}><Rocket /></div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--mk-text-muted)" }}>{"Loading…"}</div>
                    <div style={{ fontSize: "0.88rem", color: "var(--mk-text-soft)", lineHeight: 1.6 }}>{"Loading…"}</div>
                  </div>
                ))}
              </div>
            ) : b.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>No benefits configured yet.</p>
            ) : (
              b.map((benefit, i) => (
                <Reveal key={benefit.id} delay={i * 80} className="mk-card">
                  <div className="mk-card__icon">{IconFromName(benefit.icon)}</div>
                  <h3 className="mk-card__title">{benefit.title}</h3>
                  <p className="mk-card__text">{benefit.body}</p>
                </Reveal>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mk-section" style={{ background: "var(--mk-surface)", borderTop: "1px solid var(--mk-border)", borderBottom: "1px solid var(--mk-border)" }} aria-labelledby="vs-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Why Job Radar</span>
            <h2 id="vs-heading" className="mk-section-heading">Built for you, not for recruiters</h2>
          </header>
          <div className="mk-grid mk-grid--3">
            {comparison.loading ? (
              <div className="mk-grid mk-grid--3" style={{ gap: "24px" }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="mk-card" style={{ padding: "24px" }}>
                    <h3 className="mk-card__title" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</h3>
                    <ul className="mk-footer__list" style={{ color: "var(--mk-text-muted)" }}>
                      <li style={{ fontSize: "0.85rem", marginBottom: "8px" }}>{"Loading…"}</li>
                      <li style={{ fontSize: "0.85rem", marginBottom: "8px" }}>{"Loading…"}</li>
                      <li style={{ fontSize: "0.85rem", marginBottom: "8px" }}>{"Loading…"}</li>
                      <li style={{ fontSize: "0.85rem", marginBottom: "8px" }}>{"Loading…"}</li>
                      <li style={{ fontSize: "0.85rem", marginBottom: "8px" }}>{"Loading…"}</li>
                    </ul>
                  </div>
                ))}
              </div>
            ) : c.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>No comparison data configured yet.</p>
            ) : (
              c.map((col, ci) => (
                <div key={ci} className="mk-card">
                  <h3 className="mk-card__title" style={{ marginBottom: "12px", color: col.check ? "var(--mk-success)" : "var(--mk-text-soft)" }}>
                    {col.label}
                  </h3>
                  <ul className="mk-footer__list" style={{ color: "var(--mk-text-soft)" }}>
                    {col.items.map((item, ii) => (
                      <li key={ii} style={{ marginBottom: "8px", fontSize: "0.85rem" }}>
                        <span style={{ color: col.check ? "var(--mk-success)" : "var(--mk-text-muted)", marginRight: "6px" }}>
                          {col.check ? "✓" : "✗"}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Ready to find your next role?</h2>
          <p className="mk-cta__text">Create your profile, get matched to live jobs, and apply with a tailored resume and cover letter — free during beta.</p>
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
