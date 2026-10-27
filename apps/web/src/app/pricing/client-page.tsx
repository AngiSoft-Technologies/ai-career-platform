"use client";

import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import { Check, Download, ArrowRight } from "lucide-react";

;

interface PlanContent {
  id: string;
  name: string;
  badge: string;
  price: number;
  period: string;
  description: string;
  features: Array<{ id: string; label: string; included: boolean }>;
  ctaLabel: string;
  ctaHref: string;
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

export default function PricingPage() {
  const hero = useApi<HeroContent>("/content/pricing/hero");
  const plans = useApi<PlanContent[]>("/content/pricing/plans");

  const h = hero.data;
  const p = plans.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="pricing-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Pricing</span>
            {h && (
              <>
                <h1 id="pricing-title" className="mk-heading">{h.title}</h1>
                <p className="mk-lede">{h.description}</p>
              </>
            )}
            {!h && (
              <>
                <h1 id="pricing-title" className="mk-heading">Free during beta. No credit card. No charges until launch.</h1>
                <p className="mk-lede">
                  Join founding access today. Every feature is free while we build and refine. Paid plans only after v1.0 —
                  founding members keep free access for life.
                </p>
              </>
            )}
          </header>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="plans-heading">
        <div className="mk-container">
          {plans.loading ? (
            <div className="mk-pricing-cards">
              <Reveal delay={0}>
                <article className="mk-pricing-card mk-pricing-card--featured" style={{ minHeight: "560px" }}>
                  <span className="mk-pricing-card__badge">Loading…</span>
                  <h3 className="mk-pricing-card__name">Loading…</h3>
                  <p className="mk-pricing-card__desc">Loading…</p>
                  <div className="mk-pricing-card__price">
                    <span className="mk-pricing-card__amount">$0</span>
                    <span className="mk-pricing-card__period" style={{ color: "var(--mk-success)" }}>beta access</span>
                  </div>
                  <ul className="mk-pricing-card__features">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <li key={i} className="mk-pricing-card__feature">
                        <Check aria-hidden="true" />
                        <span style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className="mk-pricing-card__cta mk-btn mk-btn--primary mk-btn--full">
                    {"Loading…"}
                  </Link>
                </article>
              </Reveal>
            </div>
          ) : p.length === 0 ? (
            <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>More plans coming soon.</p>
          ) : (
            <div className="mk-pricing-cards">
              {p.map((plan, i) => (
                <Reveal key={plan.id} delay={i * 100}>
                  <article className={`mk-pricing-card ${i === 0 ? "mk-pricing-card--featured" : ""}`}>
                    {plan.badge && <span className="mk-pricing-card__badge">{plan.badge}</span>}
                    <h3 className="mk-pricing-card__name">{plan.name}</h3>
                    <p className="mk-pricing-card__desc">{plan.description}</p>
                    <div className="mk-pricing-card__price">
                      <span className="mk-pricing-card__amount">${plan.price}</span>
                      <span className="mk-pricing-card__period" style={{ color: plan.price === 0 ? "var(--mk-success)" : "var(--mk-text-muted)" }}>{plan.period}</span>
                    </div>
                    <ul className="mk-pricing-card__features">
                      {plan.features.map((feat) => (
                        <li key={feat.id} className="mk-pricing-card__feature">
                          {feat.included ? <Check aria-hidden="true" /> : <span style={{ color: "var(--mk-text-muted)" }}>✗</span>}
                          <span style={{ color: feat.included ? "var(--mk-text)" : "var(--mk-text-muted)" }}>{feat.label}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href={plan.ctaHref} className={`mk-pricing-card__cta mk-btn ${i === 0 ? "mk-btn--primary" : "mk-btn--ghost"} mk-btn--full`}>
                      {plan.ctaLabel}
                    </Link>
                  </article>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Claim your free seat</h2>
          <p className="mk-cta__text">Founding access is free. Create your profile and start applying to live jobs today.</p>
          <div className="mk-cta__actions">
            <Link href="/signup" className="mk-btn mk-btn--primary mk-btn--lg">
              <Download aria-hidden="true" /> Create a free account
            </Link>
            <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Have questions?
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
