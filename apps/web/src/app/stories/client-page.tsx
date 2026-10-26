"use client";

import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import Image from "next/image";
import { useApi } from "@/lib/hooks";
import { initials } from "@/lib/format";
import { ArrowRight } from "lucide-react";

;

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
      <section className="jr-stories-hero" aria-labelledby="stories-intro-title">
        <div className="jr-stories-hero__copy">
          <span className="jr-eyebrow">Career stories are personal</span>
          <h1 id="stories-intro-title">Different paths. One place to keep moving.</h1>
          <p>Job Radar is built for the real work behind a job search: finding the right opening, making your experience clear, and following through.</p>
        </div>
        <div className="jr-stories-hero__images">
          <figure className="jr-stories-hero__image jr-stories-hero__image--main"><Image src="/media/careers/lagos-career-story.webp" alt="A professional working on a laptop in a Lagos café" fill sizes="(max-width: 760px) 100vw, 48vw" /></figure>
          <figure className="jr-stories-hero__image jr-stories-hero__image--side"><Image src="/media/careers/healthcare-professional.webp" alt="A doctor at work in a clinical office" fill sizes="(max-width: 760px) 40vw, 20vw" /></figure>
          <span className="jr-stories-hero__caption">Career imagery, not customer testimonials</span>
        </div>
      </section>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="stories-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Stories</span>
            {h && (
              <>
                <h2 id="stories-title" className="mk-heading">{h.title}</h2>
                <p className="mk-lede">{h.description}</p>
              </>
            )}
            {!h && (
              <>
                <h2 id="stories-title" className="mk-heading">What Job Radar users are saying</h2>
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
              <p className="jr-empty-stories">We’ll share real Job Radar experiences here as users choose to tell their stories.</p>
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
