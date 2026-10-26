"use client";

import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import { ShieldCheck, Lock, Mail, ChevronRight } from "lucide-react";

;

interface SecuritySection {
  id: string;
  title: string;
  body: string;
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

export default function SecurityPage() {
  const hero = useApi<HeroContent>("/content/security/hero");
  const sections = useApi<SecuritySection[]>("/content/security");

  const h = hero.data;
  const s = sections.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-section mk-legal" style={{ paddingTop: "140px" }} aria-labelledby="security-title">
        <div className="mk-container mk-grid mk-grid--2" style={{ gap: "48px", alignItems: "start" }}>
          <aside className="mk-legal__toc">
            <nav className="mk-legal__toc-inner">
              <h3 className="mk-legal__toc-title">On this page</h3>
              <ul className="mk-legal__toc-list">
                {s.map((section) => (
                  <li key={section.id}><a className="mk-legal__toc-link" href={`#${section.id}`}>{section.title}</a></li>
                ))}
              </ul>
            </nav>
          </aside>
          <article className="mk-legal__content">
            {h && (
              <Reveal delay={0}>
                <h1 id="security-title" className="mk-legal__section-title">{h.title}</h1>
                <p className="mk-legal__text">{h.description}</p>
              </Reveal>
            )}
            {!h && (
              <Reveal delay={0}>
                <h1 id="security-title" className="mk-legal__section-title">Your privacy and security</h1>
                <p className="mk-legal__text">
                  Job Radar is built for you — not for recruiters, not for advertisers, not for AI training companies.
                  Your profile, resumes and documents belong to you, and we keep them private.
                </p>
              </Reveal>
            )}

            {sections.loading ? (
              <div className="mk-legal__content">
                <Reveal delay={80}>
                  <h2 id="data-control" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
                <Reveal delay={160}>
                  <h2 id="data-use" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
                <Reveal delay={240}>
                  <h2 id="protection" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
              </div>
            ) : s.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)" }}>No security content configured yet.</p>
            ) : (
              s.map((section, i) => (
                <Reveal key={section.id} delay={i * 80}>
                  <h2 id={section.id} className="mk-legal__section-title">{section.title}</h2>
                  <p className="mk-legal__text">{section.body}</p>
                </Reveal>
              ))
            )}

            <Reveal delay={400}>
              <h2 id="contact" className="mk-legal__section-title">Questions?</h2>
              <p className="mk-legal__text">
                Email <a href="mailto:privacy@angisoft.co.ke" className="mk-link">privacy@angisoft.co.ke</a> or use the{" "}
                <a href="/contact" className="mk-link">contact form</a>.
              </p>
            </Reveal>
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}
