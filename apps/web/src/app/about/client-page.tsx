"use client";

import Link from "next/link";
import Image from "next/image";
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

;

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
  const b = benefits.data?.length ? benefits.data : [
    { id: "discover", title: "Discover opportunities", body: "Find relevant openings from different sources.", icon: "Target" },
    { id: "prepare", title: "Prepare with purpose", body: "Shape your resume and cover letter for the role.", icon: "FileText" },
    { id: "follow-through", title: "Stay organised", body: "Keep applications, documents and follow-ups together.", icon: "Briefcase" },
  ];
  const c = comparison.data?.length ? comparison.data : [
    { id: "control", label: "You stay in control", items: ["Review your profile and documents", "Choose where and when you apply"], check: true },
    { id: "clarity", label: "Move with clarity", items: ["See why a role may fit", "Keep next steps in view"], check: true },
    { id: "focus", label: "Built around your goals", items: ["Keep your preferences close", "Organise one search in one place"], check: true },
  ];

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

      <section className="jr-about-highlight" aria-labelledby="about-highlight-title">
        <div className="jr-about-highlight__image">
          <Image src="/media/careers/technology-professional.webp" alt="A man with glasses working at a laptop in a shared office" fill sizes="(max-width: 760px) 100vw, 45vw" />
        </div>
        <div className="jr-about-highlight__copy">
          <span className="jr-eyebrow jr-eyebrow--dark">Made for the job seeker</span>
          <h2 id="about-highlight-title">Your experience is the starting point.</h2>
          <p>Job Radar helps you connect the work you’ve already done with opportunities ahead. You stay in control of your profile, your documents and every application decision.</p>
          <Link href="/features" className="jr-button jr-button--primary">Explore how it works <ArrowRight aria-hidden="true" /></Link>
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
            <Link href="/opportunities" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Browse live jobs
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
