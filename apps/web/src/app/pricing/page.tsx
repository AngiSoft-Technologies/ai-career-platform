import { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import {
  Check,
  X,
  Sparkles,
  ShieldCheck,
  FileText,
  Briefcase,
  Globe,
  Brain,
  HardDrive,
  Users,
  Zap,
  Layers,
  Download,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — Job Radar",
  description: "Free during development. 500 seats. Pro and Teams plans coming soon. No credit card required.",
  openGraph: {
    title: "Pricing — Job Radar",
    description: "Free founding access. Pro and Teams plans announced later.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar pricing" }],
  },
};

const PLANS = [
  {
    name: "Explorer",
    badge: "Free during development",
    featured: false,
    price: 0,
    period: "beta access",
    description: "For individual job seekers who want honest search. Free while we build and refine.",
    features: [
      { label: "Global job feed (6+ sources)", included: true },
      { label: "Scam shield & risk scores", included: true },
      { label: "AI matching with breakdown", included: true },
      { label: "ATS-ready CV & cover letter", included: true },
      { label: "Pipeline tracker (Kanban)", included: true },
      { label: "Follow-up reminders", included: true },
      { label: "PDF / DOCX / PPTX / PNG export", included: true },
      { label: "Offline mobile app (APK)", included: true },
      { label: "Team workspaces", included: false },
      { label: "Webhook integrations", included: false },
      { label: "Priority support", included: false },
      { label: "API access (GraphQL/REST)", included: false },
    ],
    cta: "Join free beta",
  },
  {
    name: "Radar Pro",
    badge: "Free during development",
    featured: true,
    price: 0,
    period: "beta access",
    description: "For power users who want deeper intelligence. Free while in beta.",
    features: [
      { label: "Everything in Explorer", included: true },
      { label: "Salary benchmarking per role", included: true },
      { label: "Skill gap analysis & learning paths", included: true },
      { label: "Company intelligence dossiers", included: true },
      { label: "Advanced filters & saved searches", included: true },
      { label: "Unlimited document versions", included: true },
      { label: "Custom AI rewrite tones", included: true },
      { label: "Calendar sync (Google/Outlook)", included: true },
      { label: "Export to Notion / Obsidian", included: true },
      { label: "Priority email support", included: true },
      { label: "Webhook integrations (5)", included: true },
      { label: "API access (10k req/mo)", included: true },
    ],
    cta: "Join free beta",
  },
  {
    name: "Teams",
    badge: "Free during development",
    featured: false,
    price: 0,
    period: "beta access",
    description: "For hiring teams, agencies and career coaches. Free while in beta.",
    features: [
      { label: "Everything in Radar Pro", included: true },
      { label: "Shared pipelines & candidate pool", included: true },
      { label: "Role-based access (admin/recruiter/viewer)", included: true },
      { label: "Team analytics & conversion funnels", included: true },
      { label: "Bulk application tracking", included: true },
      { label: "Custom branding on documents", included: true },
      { label: "SSO (SAML/OIDC)", included: true },
      { label: "Audit logs & compliance export", included: true },
      { label: "Dedicated Slack channel", included: true },
      { label: "SLA guarantee", included: true },
      { label: "Unlimited webhooks", included: true },
      { label: "API access (100k req/mo)", included: true },
    ],
    cta: "Join free beta",
  },
];

export default function PricingPage() {
  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="pricing-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Pricing</span>
            <h1 id="pricing-title" className="mk-heading">Free during development. No charges until we're out of beta.</h1>
            <p className="mk-lede">Use every feature, test thoroughly, report issues. We'll streamline together. Paid plans only after v1.0.</p>
          </header>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="plans-heading">
        <div className="mk-container">
          <div className="mk-pricing-cards">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 100}>
                <article className={`mk-pricing-card ${plan.featured ? "mk-pricing-card--featured" : ""}`}>
                  {plan.badge && <span className="mk-pricing-card__badge">{plan.badge}</span>}
                  <h3 className="mk-pricing-card__name">{plan.name}</h3>
                  <p className="mk-pricing-card__desc">{plan.description}</p>
                  <div className="mk-pricing-card__price">
                    <span className="mk-pricing-card__amount">${plan.price}</span>
                    {plan.price > 0 && <span className="mk-pricing-card__period">{plan.period}</span>}
                    {plan.price === 0 && <span className="mk-pricing-card__period" style={{ color: "var(--mk-success)" }}>{plan.period}</span>}
                  </div>
                  <ul className="mk-pricing-card__features">
                    {plan.features.map((f) => (
                      <li key={f.label} className="mk-pricing-card__feature">
                        {f.included ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                        <span style={{ color: f.included ? "var(--mk-text)" : "var(--mk-text-muted)" }}>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.price === 0 ? "/download" : "/contact"}
                    className={`mk-pricing-card__cta mk-btn ${plan.featured ? "mk-btn--primary" : "mk-btn--ghost"} mk-btn--full`}
                  >
                    {plan.cta} {plan.price > 0 && <ArrowRight aria-hidden="true" />}
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section" style={{ background: "var(--mk-surface)", borderTop: "1px solid var(--mk-border)", borderBottom: "1px solid var(--mk-border)" }} aria-labelledby="faq-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Common questions</span>
            <h2 id="faq-heading" className="mk-section-heading">Pricing FAQ</h2>
          </header>
          <div className="mk-accordion">
            {[
              { q: "What does 'founding access' mean?", a: "The first 500 users get lifetime free access to all current features. When paid plans launch, founding members keep their tier at $0 forever." },
              { q: "Will my data be locked in?", a: "No. Full export (JSON, CSV, PDF) anytime. Self-hostable on your own Neon + Fly. You own your data." },
              { q: "Do you sell my data?", a: "Never. Your profile, matches and documents are never sold, shared with recruiters, or used to train models." },
              { q: "What payment methods will you accept?", a: "Stripe (card, ACH), crypto (USDC on Base), and invoice for Teams. No crypto required." },
              { q: "Can I upgrade/downgrade later?", a: "Yes, anytime. Prorated. Downgrades take effect at period end. No penalties." },
            ].map((faq, i) => (
              <Reveal key={faq.q} delay={i * 60}>
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
          <h2 id="cta-heading" className="mk-cta__title">Ready to claim your seat?</h2>
          <p className="mk-cta__text">Join the beta — it's free. No credit card. No auto-renewal.</p>
          <div className="mk-cta__actions">
            <Link href="/download" className="mk-btn mk-btn--primary mk-btn--lg">
              <Download aria-hidden="true" /> Claim free seat
            </Link>
            <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Questions? Ask us
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}