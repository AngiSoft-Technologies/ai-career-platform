import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { ShieldCheck, Sparkles, FileText, Briefcase, Globe, Brain, Users, ArrowRight, Check, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stories — Job Radar",
  description: "Early access stories from Job Radar users. Composite profiles from our founding cohort design research.",
  openGraph: {
    title: "Stories — Job Radar",
    description: "What early users are telling us. Composite profiles from design research.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

const STORIES = [
  { name: "Aisha M.", role: "Frontend Engineer → Staff", quote: "The match score saved me hours. I applied to 4 roles, got 3 interviews, and the ATS score meant my CV actually passed the filter.", tags: ["React", "Remote", "94% match"], avatar: "AM" },
  { name: "Carlos R.", role: "Data Scientist", quote: "Scam detection is real. Two listings I almost applied to were flagged — one was a crypto scam, the other a fake agency. That feature alone is worth it.", tags: ["Python", "EU", "Blocked 2"], avatar: "CR" },
  { name: "Priya K.", role: "Product Designer", quote: "The document editor is the best I've used. Three-panel layout, live ATS score, line-level diff. Exported PDF and got a callback same week.", tags: ["Figma", "NYC", "ATS 94"], avatar: "PK" },
  { name: "James O.", role: "DevOps Engineer", quote: "Pipeline tracking is a game changer. Auto-stage from email, follow-up drafts at 7/14/30 days. I never miss a touchpoint now.", tags: ["AWS", "Kenya", "12 apps tracked"], avatar: "JO" },
  { name: "Fatima A.", role: "UX Researcher", quote: "Finally a tool that doesn't spam me. Scam shield caught 3 fake postings in my first week. The risk score is transparent and useful.", tags: ["Research", "Remote", "3 blocked"], avatar: "FA" },
  { name: "Michael T.", role: "Backend Engineer", quote: "API access let me build a custom Slack bot for my team. GraphQL is clean, rate limits are fair. Self-hostable is a huge plus.", tags: ["Go", "Germany", "API user"], avatar: "MT" },
];

export default function StoriesPage() {
  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="stories-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Stories</span>
            <h1 id="stories-title" className="mk-heading">What early users are telling us</h1>
            <p className="mk-lede">Composite profiles from our founding cohort design research. Names are illustrative.</p>
          </header>
          <div className="mk-stories__note" style={{ marginBottom: "40px" }}>
            <strong>Note:</strong> These stories are composite profiles from our early-access design research. Names and details are illustrative. We don't fabricate testimonials — real user stories coming soon.
          </div>
          <div className="mk-stories__grid">
            {STORIES.map((s, i) => (
              <Reveal key={s.name} delay={i * 80} className="mk-story">
                <div className="mk-story__avatar">{s.avatar}</div>
                <blockquote className="mk-story__quote">"{s.quote}"</blockquote>
                <div className="mk-story__author">
                  <span className="mk-story__name">{s.name}</span>
                  <span className="mk-story__role">{s.role}</span>
                </div>
                <div className="mk-story__tags">{s.tags.map((t) => <span key={t} className="mk-story__tag">{t}</span>)}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Have a story to share?</h2>
          <p className="mk-cta__text">We're collecting real early-access stories. If Job Radar helped you, let us know.</p>
          <div className="mk-cta__actions">
            <a href="/contact" className="mk-btn mk-btn--primary mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Share your story
            </a>
            <a href="/download" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Join the beta
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}