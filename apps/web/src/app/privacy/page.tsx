import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import { ShieldCheck, FileText, Mail, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Policy — Job Radar",
  description: "Your data, your control. No sales, no training, signed URLs.",
  openGraph: {
    title: "Privacy Policy — Job Radar",
    description: "Your data, your control. No sales, no training.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

interface PrivacySection {
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

export default function PrivacyPage() {
  const hero = useApi<HeroContent>("/content/privacy/hero");
  const sections = useApi<PrivacySection[]>("/content/privacy");

  const h = hero.data;
  const s = sections.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-section mk-legal" style={{ paddingTop: "140px" }} aria-labelledby="privacy-title">
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
                <h1 id="privacy-title" className="mk-legal__section-title">{h.title}</h1>
                <p className="mk-legal__text">{h.description}</p>
              </Reveal>
            )}
            {!h && (
              <Reveal delay={0}>
                <h1 id="privacy-title" className="mk-legal__section-title">Privacy Policy</h1>
                <p className="mk-legal__text"><strong>Effective:</strong> October 2026. <strong>Controller:</strong> AngiSoft Technologies, Nairobi, Kenya.</p>
              </Reveal>
            )}

            {sections.loading ? (
              <div className="mk-legal__content">
                <Reveal delay={50}>
                  <h2 id="data-collection" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
                <Reveal delay={100}>
                  <h2 id="data-use" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
                <Reveal delay={150}>
                  <h2 id="storage" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
                <Reveal delay={200}>
                  <h2 id="sharing" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
                <Reveal delay={250}>
                  <h2 id="rights" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
                <Reveal delay={300}>
                  <h2 id="cookies" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
                <Reveal delay={350}>
                  <h2 id="contact" className="mk-legal__section-title">Loading…</h2>
                  <p className="mk-legal__text" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</p>
                </Reveal>
              </div>
            ) : s.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)" }}>More details coming soon.</p>
            ) : (
              s.map((section, i) => (
                <Reveal key={section.id} delay={i * 50}>
                  <h2 id={section.id} className="mk-legal__section-title">{section.title}</h2>
                  <p className="mk-legal__text">{section.body}</p>
                </Reveal>
              ))
            )}

            <Reveal delay={400}>
              <h2 id="contact" className="mk-legal__section-title">Contact</h2>
              <p className="mk-legal__text">
                Questions? Email <a href="mailto:privacy@angisoft.co.ke" className="mk-link">privacy@angisoft.co.ke</a> or use the{" "}
                <a href="/contact" className="mk-link">contact form</a>.
              </p>
            </Reveal>
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}
