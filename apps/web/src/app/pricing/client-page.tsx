"use client";

import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/layout";
import { BackdropVideo } from "@/components/marketing/backdrop-video";
import { InView } from "@/components/marketing/in-view";
import { Marquee } from "@/components/marketing/marquee";
import { SectionHeading } from "@/components/marketing/page-hero";
import { Faq, CtaBand } from "@/components/marketing/faq";
import { useApi } from "@/lib/hooks";
import { ArrowRight, Check, Download, Minus } from "lucide-react";

interface PlanFeature {
  id: string;
  label: string;
  included: boolean;
}

interface PlanContent {
  id: string;
  name: string;
  badge: string;
  price: number;
  period: string;
  description: string;
  features: PlanFeature[];
  ctaLabel: string;
  ctaHref: string;
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

const MARQUEE_FACTS = [
  "Free during beta",
  "No credit card",
  "No charges until paid plans launch",
  "Founding members keep free access",
];

export default function PricingPage({
  initialHero = null,
  initialPlans = null,
}: {
  initialHero?: HeroContent | null;
  initialPlans?: PlanContent[] | null;
}) {
  const hero = useApi<HeroContent>("/content/pricing/hero", undefined, initialHero);
  const plans = useApi<PlanContent[]>("/content/pricing/plans", undefined, initialPlans);

  const h = hero.data;
  const p = plans.data ?? [];
  const [featured, ...rest] = p;

  return (
    <MarketingLayout>
      {/* --- hero: the radar runs behind the price --------------------------- */}
      <section className="mk-video-hero" aria-labelledby="pricing-title">
        <div className="mk-video-hero__media" aria-hidden="true">
          <BackdropVideo src="/media/radar-loop.mp4" poster="/media/radar-poster.jpg" />
          <span className="mk-video-hero__veil" />
          <span className="mk-aurora" />
        </div>
        <div className="mk-video-hero__inner">
          <div className="mk-container">
            <div className="mk-stagger" style={{ display: "grid", gap: "20px", justifyItems: "start", maxWidth: "820px" }}>
              <span className="mk-eyebrow mk-eyebrow--signal">
                <span className="mk-eyebrow__rule" aria-hidden="true" />
                Pricing
              </span>
              <h1 id="pricing-title" className="mk-display">
                {h?.title ?? "Free during beta. No credit card."}
              </h1>
              <p className="mk-lede max-w-prose-wide">
                {h?.description ??
                  "Join founding access today. Every feature is free while we build and refine. Paid plans only after launch — founding members keep free access for it."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Marquee items={MARQUEE_FACTS} />

      {/* --- the plan as a figure spread, not a card grid ---------------------- */}
      {plans.loading ? (
        <section className="mk-section">
          <div className="mk-container">
            <div className="mk-glass p-8 lg:p-12">
              <p className="m-0 text-text-muted">Loading plans…</p>
            </div>
          </div>
        </section>
      ) : featured ? (
        <section className="mk-section" aria-labelledby="plan-heading">
          <div className="mk-container">
            <div className="mk-figure-spread">
              <InView className="mk-reveal">
                <div className="grid gap-5 content-start">
                  {featured.badge ? (
                    <span className="mk-chip mk-chip--signal w-fit">{featured.badge}</span>
                  ) : null}
                  <span className="mk-big-number mk-big-number--signal">
                    ${featured.price}
                  </span>
                  <span className="text-[1.05rem] font-bold text-text">{featured.name}</span>
                  <span className="mk-draw-line h-px bg-[var(--mk-border-strong)]" aria-hidden="true" />
                  <p className="m-0 text-[1rem] leading-[1.7] text-text-soft max-w-prose">{featured.description}</p>
                  <Link href={featured.ctaHref} className="mk-btn mk-btn--signal mk-btn--lg w-fit mt-2">
                    {featured.ctaLabel} <ArrowRight className="mk-btn__icon" aria-hidden="true" />
                  </Link>
                  <span className="text-[0.78rem] tracking-[0.06em] uppercase text-text-muted">{featured.period}</span>
                </div>
              </InView>
              <InView className="mk-reveal mk-reveal--right" delay={120}>
                <div className="mk-glass p-7 lg:p-10">
                  <h3 id="plan-heading" className="m-0 mb-6 text-[1.1rem] font-bold text-text">
                    What&apos;s inside
                  </h3>
                  {/* The features as rows, not a bulleted card. */}
                  <div className="mk-stagger">
                    {featured.features.map((feat) => (
                      <div key={feat.id} className="mk-row-link" style={{ cursor: "default" }}>
                        {feat.included ? (
                          <Check className="w-[18px] h-[18px] shrink-0 text-verified" aria-hidden="true" />
                        ) : (
                          <Minus className="w-[18px] h-[18px] shrink-0 text-text-muted" aria-hidden="true" />
                        )}
                        <span className={`text-[0.95rem] leading-[1.5] ${feat.included ? "text-text" : "text-text-muted line-through"}`}>
                          {feat.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </InView>
            </div>
          </div>
        </section>
      ) : null}

      {/* --- the other plans as rows ----------------------------------------- */}
      {rest.length > 0 ? (
        <section className="mk-section pt-0" aria-labelledby="other-plans-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="Also available"
              eyebrowTone="insight"
              title={<span id="other-plans-heading">Other access</span>}
              lede="When paid plans launch, this is where they will sit."
            />
            <div className="max-w-prose-wide">
              <div className="mk-stagger">
                {rest.map((plan) => (
                  <div key={plan.id} className="mk-row-link">
                    <span className="grid gap-1 min-w-0">
                      <span className="text-[1.02rem] font-bold text-text">
                        {plan.name}
                        {plan.badge ? <span className="ml-2 mk-chip mk-chip--insight">{plan.badge}</span> : null}
                      </span>
                      <span className="text-[0.86rem] leading-[1.55] text-text-soft">{plan.description}</span>
                    </span>
                    <span className="mk-numeral text-[1.1rem] font-bold text-text">${plan.price}</span>
                    <Link href={plan.ctaHref} className="mk-btn mk-btn--ghost mk-btn--shrink-0">
                      {plan.ctaLabel}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* --- the statement ----------------------------------------------------- */}
      <section className="mk-statement">
        <div className="mk-container">
          <InView className="mk-reveal">
            <p className="mk-statement__text mk-statement__text--wide">
              We would rather say{" "}
              <span className="mk-gradient-text">what something will cost</span> than discover it on an invoice
              you did not expect.
            </p>
          </InView>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="pricing-faq-heading">
        <div className="mk-container">
          <SectionHeading eyebrow="Questions" title={<span id="pricing-faq-heading">About paying, plainly</span>} />
          <div className="max-w-prose-wide">
            <Faq
              label="Questions about pricing"
              items={[
                {
                  q: "Is it really free right now?",
                  a: "Yes. Every feature is free during founding access — no credit card, no trial that converts, no charges until paid plans launch.",
                },
                {
                  q: "What happens to founding members when paid plans launch?",
                  a: "Founding members keep free access. That is the whole reason to join now rather than later.",
                },
                {
                  q: "Will my CV and documents be behind a paywall?",
                  a: "The documents you generate from your own profile stay yours. Export has never been the thing we would charge for.",
                },
                {
                  q: "Will you sell my data instead of charging me?",
                  a: "No. The privacy page states it in full: your information is not sold, and not used to train other companies' models.",
                },
              ]}
            />
          </div>
        </div>
      </section>

      <CtaBand
        title="Claim your free seat"
        text="Founding access is free. Create your profile and start applying to live roles today."
        primary={
          <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg">
            <Download className="mk-btn__icon" aria-hidden="true" /> Create a free account
          </Link>
        }
        secondary={
          <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
            <ArrowRight className="mk-btn__icon" aria-hidden="true" /> Have questions?
          </Link>
        }
      />
    </MarketingLayout>
  );
}
