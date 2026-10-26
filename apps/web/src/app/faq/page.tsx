import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { ChevronRight, ShieldCheck, Sparkles, Globe, Brain, FileText, Briefcase, HardDrive, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FAQ — Job Radar",
  description: "Frequently asked questions about Job Radar: pricing, privacy, features, mobile app, API, and more.",
  openGraph: {
    title: "FAQ — Job Radar",
    description: "Common questions about Job Radar answered.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

const FAQS = [
  { q: "What is Job Radar?", a: "Job Radar is a global job search platform that aggregates listings from 6+ sources, screens for scams, ranks matches against your profile, prepares ATS-ready documents, and tracks your application pipeline. AI prepares, you decide, you submit." },
  { q: "How much does it cost?", a: "Free during development (founding access). No credit card required. Paid plans (Radar Pro, Teams) will be announced after v1.0. Founding members keep free access for life." },
  { q: "Which job boards do you cover?", a: "Currently: Arbeitnow (300+ roles), RemoteOK (100+), Remotive, Lever, Greenhouse, and custom Kenyan feeds. New sources added weekly." },
  { q: "How does scam detection work?", a: "Every posting is fingerprinted: domain age, SSL validity, company registry check, salary anomaly (z-score >3), duplicate SimHash across boards, and 200+ keyword signatures. Risk score 0–100. >70 held for review." },
  { q: "Does the AI invent skills on my resume?", a: "Never. The model only rearranges and rephrases what you've written. Every suggestion traces to your profile. No hallucinated dates, employers, or skills." },
  { q: "What document formats can I export?", a: "PDF, DOCX, PPTX, and PNG. All exports are ATS-optimised with live score checklist." },
  { q: "Is there a mobile app?", a: "Yes — native Flutter app (APK, 206 MB). SQLite offline storage, background sync, push notifications. Play Store submission in progress." },
  { q: "Do you sell my data?", a: "Never. Your profile, matches, and documents are never sold, shared with recruiters, or used to train models. GDPR/CCPA delete on request." },
  { q: "Can I self-host?", a: "Yes. Job Radar runs on Neon (PostgreSQL), Fly (backend), Netlify (frontend). You can deploy your own instance. See GitHub for details." },
  { q: "Is there an API?", a: "Yes — GraphQL, REST, and MCP endpoints. Free tier during beta. Docs at /docs (coming soon)." },
];

export default function FAQPage() {
  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="faq-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">FAQ</span>
            <h1 id="faq-title" className="mk-heading">Questions? We have answers</h1>
            <p className="mk-lede">Everything you need to know about Job Radar. Can't find yours? <a href="/contact" className="mk-link">Contact us</a>.</p>
          </header>
          <div className="mk-accordion">
            {FAQS.map((faq, i) => (
              <Reveal key={faq.q} delay={i * 40}>
                <details className="mk-accordion__item" open={i === 0}>
                  <summary className="mk-accordion__trigger">{faq.q}<ChevronRight className="mk-accordion__icon" aria-hidden="true" /></summary>
                  <div className="mk-accordion__content"><div className="mk-accordion__content-inner">{faq.a}</div></div>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Still have questions?</h2>
          <p className="mk-cta__text">We're a small team and we read every message.</p>
          <div className="mk-cta__actions">
            <a href="/contact" className="mk-btn mk-btn--primary mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Contact us
            </a>
            <a href="/download" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Try the app
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}