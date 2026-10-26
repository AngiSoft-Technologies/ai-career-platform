import { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import {
  ShieldCheck,
  Sparkles,
  Users,
  Brain,
  Globe,
  ChevronRight,
  Zap,
  Code,
  Heart,
  Target,
  Layers,
  Search,
  Mail,
  Clock,
  FileText,
  Briefcase,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About Job Radar — The story behind the radar",
  description: "Job Radar was born from Prof Angera's frustration with job hunting: 100+ sites, manual tailoring, wasted time. Built by a software engineer who lived the problem.",
  openGraph: {
    title: "About Job Radar",
    description: "Global job search, scam screening, AI-assisted applications. Born from real frustration.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

const PRINCIPLES = [
  { icon: Target, title: "Precision over volume", text: "One honest match beats 100 noisy listings." },
  { icon: Code, title: "Open where it counts", text: "GraphQL, REST, MCP endpoints. Your data, your tools." },
  { icon: Heart, title: "Private by construction", text: "Signed URLs, no training on your data, no third-party sales." },
  { icon: Layers, title: "Modular, not monolithic", text: "Use one feature or all five. Each works standalone." },
];

const ORIGIN_STEPS = [
  {
    icon: Globe,
    title: "The problem: fragmented search",
    text: "In August 2026, Prof Angera was looking for work. He found himself visiting 100+ websites — LinkedIn, company career pages, niche boards, government portals, aggregators. Each had different filters, different layouts, different apply flows. Half the listings were stale. Some were scams. He spent hours just finding roles, not applying.",
  },
  {
    icon: FileText,
    title: "The problem: manual tailoring",
    text: "Every application needed a custom resume and cover letter. He'd copy the job description, map his skills, rewrite bullets, adjust keywords for ATS. 30–45 minutes per role. For 20 roles that's 10+ hours of repetitive editing — time that could go to interview prep or learning.",
  },
  {
    icon: Clock,
    title: "The problem: zero visibility",
    text: "After submitting? Silence. No confirmation, no status, no way to follow up systematically. He built a spreadsheet. It grew to 50 rows. Still no clarity. The process was opaque, manual, and exhausting.",
  },
  {
    icon: Search,
    title: "The insight: automate the drudgery, keep the decisions",
    text: "As a software engineer, he saw the pattern: aggregation, normalisation, scoring, document generation, pipeline tracking — all automatable. The human should only do the parts that need judgment: which roles to pursue, how to frame the story, when to hit send. Job Radar was born.",
  },
];

const TIMELINE = [
  { date: "August 2026", title: "Idea crystallised", text: "Prof Angera defines the scope: global ingestion, scam detection, semantic matching, ATS-ready documents, application pipeline. Starts coding." },
  { date: "September 2026", title: "Core pipeline live", text: "BullMQ workers ingest from 6 sources. PostgreSQL + pgvector for embeddings. Neon for branchable DB. Fly for backend. Netlify for frontend." },
  { date: "October 2026", title: "Scam shield + documents", text: "Risk scoring (domain age, salary anomaly, duplicate fingerprint, keyword signatures). Three-panel document editor with live ATS score and line diff. Android APK builds." },
  { date: "October 2026", title: "Founding cohort opens", text: "500 free seats. Marketing site launches. Real users start testing. Feedback loop begins." },
];

export default function AboutPage() {
  return (
    <MarketingLayout>
      <section className="mk-about-hero" aria-labelledby="about-title">
        <div className="mk-about-hero__inner">
          <Reveal delay={0}>
            <span className="mk-hero__eyebrow">
              <Sparkles aria-hidden="true" /> The story behind Job Radar
            </span>
          </Reveal>
          <Reveal delay={100}>
            <h1 id="about-title" className="mk-heading">Built from frustration. Designed for honesty.</h1>
            <p className="mk-lede">Job Radar wasn't a startup idea. It was a personal necessity. Prof Angera lived the broken job hunt — 100+ sites, manual tailoring, zero visibility. He built the tool he needed.</p>
          </Reveal>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="origin-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Origin</span>
            <h2 id="origin-heading" className="mk-section-heading">The problem was real. The solution had to be too.</h2>
          </header>
          <div className="mk-grid mk-grid--2">
            {ORIGIN_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 100}>
                <div className="mk-card" style={{ minHeight: "280px" }}>
                  <div className="mk-card__icon"><step.icon aria-hidden="true" /></div>
                  <h3 className="mk-card__title">{step.title}</h3>
                  <p className="mk-card__text" style={{ lineHeight: 1.7 }}>{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="principles-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Principles</span>
            <h2 id="principles-heading" className="mk-section-heading">The rules we don't break</h2>
          </header>
          <div className="mk-grid mk-grid--4">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 80} className="mk-card">
                <div className="mk-card__icon"><p.icon aria-hidden="true" /></div>
                <h3 className="mk-card__title">{p.title}</h3>
                <p className="mk-card__text">{p.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="timeline-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Timeline</span>
            <h2 id="timeline-heading" className="mk-section-heading">From August 2026 to now</h2>
          </header>
          <div className="mk-timeline">
            {TIMELINE.map((t, i) => (
              <Reveal key={t.date} delay={i * 80} className="mk-timeline__item">
                <span className="mk-timeline__dot" aria-hidden="true" />
                <div className="mk-timeline__year">{t.date}</div>
                <h3 className="mk-timeline__title">{t.title}</h3>
                <p className="mk-timeline__text">{t.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="team-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Team</span>
            <h2 id="team-heading" className="mk-section-heading">A small team at AngiSoft Technologies, Nairobi</h2>
          </header>
          <div className="mk-grid mk-grid--2">
            <Reveal delay={0} className="mk-card">
              <h3 className="mk-card__title">Prof Silas Angera</h3>
              <p className="mk-card__text">Founder & lead engineer. Software engineer who lived the job hunt. Built the ingestion pipeline, matching engine, document editor, and mobile app.</p>
            </Reveal>
            <Reveal delay={80} className="mk-card">
              <h3 className="mk-card__title">Open to collaborators</h3>
              <p className="mk-card__text">We're looking for engineers, designers, and product thinkers who care about honest job search. <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--sm" style={{ marginTop: "12px", width: "fit-content" }}>Talk to us</Link></p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Want the tool that should have existed?</h2>
          <p className="mk-cta__text">Free during founding access. 494 of 500 seats left. No credit card.</p>
          <div className="mk-cta__actions">
            <Link href="/download" className="mk-btn mk-btn--primary mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Get the Android APK
            </Link>
            <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
              <Mail aria-hidden="true" /> Ask us anything
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}