"use client";

import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import { ChevronRight, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FAQ — Job Radar",
  description: "Common questions about Job Radar: how to find jobs, tailor resumes, write cover letters, and track applications.",
  openGraph: {
    title: "FAQ — Job Radar",
    description: "Common questions about Job Radar answered.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

interface FAQContent {
  id: string;
  question: string;
  answer: string;
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

export default function FAQPage() {
  const hero = useApi<HeroContent>("/content/faq/hero");
  const faqs = useApi<FAQContent[]>("/content/faq");

  const h = hero.data;
  const f = faqs.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="faq-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">FAQ</span>
            {h && (
              <>
                <h1 id="faq-title" className="mk-heading">{h.title}</h1>
                <p className="mk-lede">{h.description}</p>
              </>
            )}
            {!h && (
              <>
                <h1 id="faq-title" className="mk-heading">Questions? We have answers</h1>
                <p className="mk-lede">
                  Everything you need to know about finding jobs, tailoring resumes and tracking applications with Job Radar.
                  Can't find yours? <a href="/contact" className="mk-link">Contact us</a>.
                </p>
              </>
            )}
          </header>
          <div className="mk-accordion">
            {faqs.loading ? (
              <div className="mk-accordion">
                {[1, 2, 3].map((i) => (
                  <Reveal key={i} delay={i * 40}>
                    <details className="mk-accordion__item" open={i === 0}>
                      <summary className="mk-accordion__trigger">Loading…<ChevronRight className="mk-accordion__icon" aria-hidden="true" /></summary>
                      <div className="mk-accordion__content"><div className="mk-accordion__content-inner" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</div></div>
                    </details>
                  </Reveal>
                ))}
              </div>
            ) : f.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>No FAQs configured yet.</p>
            ) : (
              f.map((faq, i) => (
                <Reveal key={faq.id} delay={i * 40}>
                  <details className="mk-accordion__item" open={i === 0}>
                    <summary className="mk-accordion__trigger">{faq.question}<ChevronRight className="mk-accordion__icon" aria-hidden="true" /></summary>
                    <div className="mk-accordion__content"><div className="mk-accordion__content-inner">{faq.answer}</div></div>
                  </details>
                </Reveal>
              ))
            )}
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
            <a href="/signup" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Try the app
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
