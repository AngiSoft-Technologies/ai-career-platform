"use client";

import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import { initials } from "@/lib/format";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stories — Job Radar",
  description: "Real stories from Job Radar users who found jobs, tailored resumes and tracked applications.",
  openGraph: {
    title: "Stories — Job Radar",
    description: "What Job Radar users are saying.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

interface TestimonialContent {
  id: string;
  name: string;
  role: string;
  quote: string;
  tags: string[];
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

export default function StoriesPage() {
  const hero = useApi<HeroContent>("/content/stories/hero");
  const stories = useApi<TestimonialContent[]>("/content/stories");

  const h = hero.data;
  const s = stories.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="stories-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Stories</span>
            {h && (
              <>
                <h1 id="stories-title" className="mk-heading">{h.title}</h1>
                <p className="mk-lede">{h.description}</p>
              </>
            )}
            {!h && (
              <>
                <h1 id="stories-title" className="mk-heading">What Job Radar users are saying</h1>
                <p className="mk-lede">Real people finding real jobs with tailored resumes, cover letters and organised applications.</p>
              </>
            )}
          </header>
          <div className="mk-stories__grid">
            {stories.loading ? (
              <div className="mk-stories__grid">
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
            ) : s.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>No stories configured yet.</p>
            ) : (
              s.map((story, i) => (
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
          <p className="mk-cta__text">Create your free profile and start applying to live jobs today.</p>
          <div className="mk-cta__actions">
            <a href="/signup" className="mk-btn mk-btn--primary mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Get started free
            </a>
            <a href="/jobs" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ArrowRight aria-hidden="true" /> Browse live jobs
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
