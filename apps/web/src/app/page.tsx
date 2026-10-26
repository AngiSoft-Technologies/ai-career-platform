"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Reveal } from "@/components/marketing/reveal";
import { VideoHero } from "@/components/marketing/video-hero";
import { Stats } from "@/components/marketing/stats";
import { Slider } from "@/components/marketing/slider";
import { useApi } from "@/lib/hooks";
import { formatSalary, initials } from "@/lib/format";
import {
  Download,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  FileText,
  Briefcase,
  Globe,
  Check,
  Users,
  Search,
  Brain,
  HardDrive,
  Smartphone,
  ExternalLink,
  Rocket,
  Target,
  Mail,
  Clock,
} from "lucide-react";
import type { Opportunity } from "@/lib/types";

export const metadata = {
  title: "Job Radar — Find and Apply to Your Dream Job",
  description:
    "Find real jobs worldwide, tailor your resume and cover letter, and track every application in one place.",
  openGraph: {
    title: "Job Radar",
    description: "Find and apply to your dream job worldwide.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Job Radar",
    description: "Find and apply to your dream job worldwide.",
    images: ["/media/og-cover.jpg"],
  },
};

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
}

interface Benefit {
  id: string;
  title: string;
  body: string;
  icon: string;
}

interface Testimonial {
  id: string;
  name: string;
  role: string;
  quote: string;
  tags: string[];
}

interface ComparisonColumn {
  label: string;
  items: string[];
  check: boolean;
}

interface ComparisonContent {
  columns: ComparisonColumn[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  FileText,
  Mail,
  Briefcase,
  ShieldCheck,
  Rocket,
  Search,
  Clock,
  Users,
  Brain,
  Globe,
  HardDrive,
};

function IconFromName(name: string) {
  const Comp = ICON_MAP[name] || Sparkles;
  return <Comp aria-hidden="true" />;
}

export default function LandingPage() {
  const hero = useApi<HeroContent>("/content/hero");
  const benefits = useApi<Benefit[]>("/content/benefits");
  const testimonials = useApi<Testimonial[]>("/content/testimonials");
  const comparison = useApi<ComparisonContent>("/content/comparison");
  const featuredJobs = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 4, status: "active" });

  useEffect(() => {
    document.title = hero.data?.title || metadata.title;
  }, [hero.data?.title]);

  const h = hero.data;
  const b = benefits.data ?? [];
  const t = testimonials.data ?? [];
  const c = comparison.data?.columns ?? [];
  const jobs = featuredJobs.data?.items ?? [];

  return (
    <main>
      <section className="mk-hero" aria-labelledby="hero-title">
        <VideoHero
          poster="/media/radar-poster.jpg"
          videoSrc="/media/radar-loop.mp4"
          className="mk-hero__video-hero"
        >
          <div className="mk-hero__inner">
            <div className="mk-hero__copy">
              {h && (
                <>
                  <div className="mk-hero__eyebrow">
                    <Sparkles className="mk-hero__eyebrow-icon" aria-hidden="true" />
                    <span>{h.subtitle}</span>
                  </div>
                  <h1 id="hero-title" className="mk-heading">{h.title}</h1>
                  <p className="mk-lede">{h.description}</p>
                  <div className="mk-hero__cta">
                    <Link href={h.primaryCtaHref} className="mk-btn mk-btn--primary mk-btn--lg">
                      <Rocket className="mk-btn__icon" aria-hidden="true" />
                      <span>{h.primaryCtaLabel}</span>
                    </Link>
                    <Link href={h.secondaryCtaHref} className="mk-btn mk-btn--ghost mk-btn--lg">
                      <Search className="mk-btn__icon" aria-hidden="true" />
                      <span>{h.secondaryCtaLabel}</span>
                    </Link>
                  </div>
                  <div className="mk-hero__trust">
                    <span className="mk-hero__trust-badge">
                      <Check aria-hidden="true" /> Real jobs, live listings
                    </span>
                    <span className="mk-hero__trust-badge">
                      <FileText aria-hidden="true" /> Resume tailored in seconds
                    </span>
                    <span className="mk-hero__trust-badge">
                      <Briefcase aria-hidden="true" /> Track every application
                    </span>
                  </div>
                </>
              )}
              {!h && (
                <>
                  <div className="mk-hero__eyebrow">
                    <Sparkles className="mk-hero__eyebrow-icon" aria-hidden="true" />
                    <span>Find and apply to your dream job</span>
                  </div>
                  <h1 id="hero-title" className="mk-heading">Jobs that fit you. Applications that get noticed.</h1>
                  <p className="mk-lede">
                    We scan live job boards worldwide, tailor your resume and cover letter to each role, and track
                    every application in one place. Built for students, graduates and professionals in every field.
                  </p>
                  <div className="mk-hero__cta">
                    <Link href="/signup" className="mk-btn mk-btn--primary mk-btn--lg">
                      <Rocket className="mk-btn__icon" aria-hidden="true" />
                      <span>Start finding jobs — free</span>
                    </Link>
                    <Link href="/jobs" className="mk-btn mk-btn--ghost mk-btn--lg">
                      <Search className="mk-btn__icon" aria-hidden="true" />
                      <span>Browse live jobs</span>
                    </Link>
                  </div>
                </>
              )}
            </div>
            <div className="mk-hero__frame" aria-hidden="true">
              <div className="mk-frame" style={{ maxWidth: "360px" }}>
                <div className="mk-frame__bar">
                  <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
                  <span className="mk-frame__title">Live jobs</span>
                  <div className="mk-frame__dots" />
                </div>
                <div className="mk-frame__content" style={{ padding: 0 }}>
                  {featuredJobs.loading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px" }}>
                      <div className="mk-mock-card" style={{ padding: "10px", borderBottom: "1px solid var(--mk-border)" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mk-text-soft)" }}>{"Loading…"}</div>
                      </div>
                      <div className="mk-mock-card" style={{ padding: "10px", borderBottom: "1px solid var(--mk-border)" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mk-text-soft)" }}>{"Loading…"}</div>
                      </div>
                    </div>
                  ) : jobs.length > 0 ? (
                    jobs.map((j) => (
                      <div key={j.id} className="mk-mock-card" style={{ padding: "12px", borderBottom: "1px solid var(--mk-border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "8px", marginBottom: "6px" }}>
                          <div className="mk-mock-card__title" style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mk-text)" }}>
                            {j.title}
                          </div>
                          <span style={{ background: "var(--mk-accent-soft)", color: "var(--mk-accent)", padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 }}>
                            {j.match?.score ? `${Math.round(j.match.score)}%` : "Match"}
                          </span>
                        </div>
                        <div className="mk-mock-card__meta" style={{ fontSize: "0.7rem", color: "var(--mk-text-muted)", marginBottom: "6px" }}>
                          <span>{j.companyName}</span><span>·</span><span>{j.city ? `${j.city}, ` : ""}{j.country}</span><span>·</span><span>{formatSalary(j.salaryMin, j.salaryMax, j.currency)}</span>
                        </div>
                        <Link href={`/opportunities/${j.id}`} className="mk-btn mk-btn--ghost mk-btn--sm" style={{ width: "100%", fontSize: "0.75rem", padding: "6px 10px" }}>
                          <ArrowRight aria-hidden="true" /> Apply
                        </Link>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: "12px", color: "var(--mk-text-muted)", fontSize: "0.85rem" }}>
                      No live jobs available right now. Check back soon.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </VideoHero>
      </section>

      <section className="mk-section" aria-labelledby="how-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">How we help you get hired</span>
            <h2 id="how-heading" className="mk-section-heading">From searching to applying, without the busywork</h2>
          </header>
          <div className="mk-grid mk-grid--4">
            {benefits.loading ? (
              <div className="mk-grid mk-grid--4" style={{ gap: "24px" }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="mk-card" style={{ height: "200px", display: "flex", flexDirection: "column", gap: "12px", padding: "24px" }}>
                    <div className="mk-card__icon" style={{ color: "var(--mk-text-muted)" }}><Sparkles /></div>
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

      <section className="mk-section" aria-labelledby="stories-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Early results</span>
            <h2 id="stories-heading" className="mk-section-heading">What users are saying</h2>
          </header>
          <div className="mk-grid mk-grid--3">
                {testimonials.loading ? (
                  <div className="mk-grid mk-grid--3" style={{ gap: "24px" }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="mk-story" style={{ minHeight: "300px" }}>
                        <div className="mk-story__avatar">{"??"}</div>
                        <blockquote className="mk-story__quote" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</blockquote>
                        <div className="mk-story__author">
                          <span className="mk-story__name" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</span>
                          <span className="mk-story__role" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
            ) : t.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>No testimonials configured yet.</p>
            ) : (
              t.map((story, i) => (
                <Reveal key={story.id} delay={i * 80} className="mk-story">
                  <div className="mk-story__avatar">{initials(story.name)}</div>
                  <blockquote className="mk-story__quote">"{story.quote}"</blockquote>
                  <div className="mk-story__author">
                    <span className="mk-story__name">{story.name}</span>
                    <span className="mk-story__role">{story.role}</span>
                  </div>
                  <div className="mk-story__tags">{story.tags.map((tag) => <span key={tag} className="mk-story__tag">{tag}</span>)}</div>
                </Reveal>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Ready to find your next role?</h2>
          <p className="mk-cta__text">Create your profile, get matched to live jobs, and apply with a tailored resume and cover letter — all in one place.</p>
          <div className="mk-cta__actions">
            <Link href="/signup" className="mk-btn mk-btn--primary mk-btn--lg">
              <Download aria-hidden="true" /> Get started free
            </Link>
            <Link href="/jobs" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Browse live jobs
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
