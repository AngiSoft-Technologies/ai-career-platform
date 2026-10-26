import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import { FileText, Mail, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Service — Job Radar",
  description: "Terms of service for Job Radar. Free during beta. No warranty.",
  openGraph: {
    title: "Terms of Service — Job Radar",
    description: "Terms of service for Job Radar. Free during beta.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

interface TermsSection {
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

export default function TermsPage() {
  const hero = useApi<HeroContent>("/content/terms/hero");
  const sections = useApi<TermsSection[]>("/content/terms");

  const h = hero.data;
  const s = sections.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-section mk-legal" style={{ paddingTop: "140px" }} aria-labelledby="terms-title">
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
                <h1 id="terms-title" className="mk-legal__section-title">{h.title}</h1>
                <p className="mk-legal__text">{h.description}</p>
              </Reveal>
            )}
            {!h && (
              <Reveal delay={0}>
                <h1 id="terms-title" className="mk-legal__section-title">Terms of Service</h1>
                <p className="mk-legal__text"><strong>Effective:</strong> October 2026. <strong>Provider:</strong> AngiSoft Technologies, Nairobi, Kenya.</p>
              </Reveal>
            )}

            {sections.loading ? (
              <div className="mk-legal__content">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                  <Reveal key={i} delay={i * 50}>
                    <h2 id={`section-${i}`} className="mk-legal__section-title">Loading…</h2>
                    <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                  </Reveal>
                ))}
              </div>
            ) : s.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)" }}>No terms content configured yet.</p>
            ) : (
              s.map((section, i) => (
                <Reveal key={section.id} delay={i * 50}>
                  <h2 id={section.id} className="mk-legal__section-title">{section.title}</h2>
                  <p className="mk-legal__text">{section.body}</p>
                </Reveal>
              ))
            )}

            <Reveal delay={600}>
              <h2 id="contact" className="mk-legal__section-title">Contact</h2>
              <p className="mk-legal__text">
                Questions? Email <a href="mailto:legal@angisoft.co.ke" className="mk-link">legal@angisoft.co.ke</a> or use the{" "}
                <a href="/contact" className="mk-link">contact form</a>.
              </p>
            </Reveal>
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}
