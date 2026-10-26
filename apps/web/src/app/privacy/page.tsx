import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { ShieldCheck, FileText, Globe, HardDrive, Lock, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Policy — Job Radar",
  description: "Job Radar privacy policy: what data we collect, how we use it, your rights, and how to delete your data.",
  openGraph: {
    title: "Privacy Policy — Job Radar",
    description: "Your data, your control. No sales, no training, signed URLs.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

export default function PrivacyPage() {
  return (
    <MarketingLayout>
      <section className="mk-section mk-legal" style={{ paddingTop: "140px" }} aria-labelledby="privacy-title">
        <div className="mk-container mk-grid mk-grid--2" style={{ gap: "48px", alignItems: "start" }}>
          <aside className="mk-legal__toc">
            <nav className="mk-legal__toc-inner">
              <h3 className="mk-legal__toc-title">On this page</h3>
              <ul className="mk-legal__toc-list">
                <li><a className="mk-legal__toc-link" href="#data-collection">Data we collect</a></li>
                <li><a className="mk-legal__toc-link" href="#data-use">How we use your data</a></li>
                <li><a className="mk-legal__toc-link" href="#storage">Storage & security</a></li>
                <li><a className="mk-legal__toc-link" href="#sharing">Sharing & disclosure</a></li>
                <li><a className="mk-legal__toc-link" href="#rights">Your rights</a></li>
                <li><a className="mk-legal__toc-link" href="#cookies">Cookies & tracking</a></li>
                <li><a className="mk-legal__toc-link" href="#contact">Contact us</a></li>
              </ul>
            </nav>
          </aside>
          <article className="mk-legal__content">
            <Reveal delay={0}>
              <h1 id="privacy-title" className="mk-legal__section-title">Privacy Policy</h1>
              <p className="mk-legal__text"><strong>Effective:</strong> October 2026. <strong>Controller:</strong> AngiSoft Technologies, Nairobi, Kenya.</p>
            </Reveal>

            <Reveal delay={50}>
              <h2 id="data-collection" className="mk-legal__section-title">1. Data we collect</h2>
              <p className="mk-legal__text">We collect only what you give us or what the platform generates for you:</p>
              <ul className="mk-legal__list">
                <li><strong>Account:</strong> Email, display name (via Neon Auth). No passwords stored by us.</li>
                <li><strong>Profile:</strong> Skills, location, work mode, seniority, preferences, headline, summary, experience, education, projects.</li>
                <li><strong>Activity:</strong> Saved roles, applications, follow-ups, documents generated, match scores, search queries.</li>
                <li><strong>Documents:</strong> CV, cover letter, portfolio content you create or AI assists with.</li>
                <li><strong>Technical:</strong> IP address (briefly, for abuse prevention), user agent, request timestamps (logs retained 30 days).</li>
              </ul>
            </Reveal>

            <Reveal delay={100}>
              <h2 id="data-use" className="mk-legal__section-title">2. How we use your data</h2>
              <ul className="mk-legal__list">
                <li>Provide the service: matching, document generation, pipeline tracking.</li>
                <li>Improve matching: aggregate, anonymised usage patterns (opt-out available).</li>
                <li>Security: abuse detection, rate limiting, fraud prevention.</li>
                <li>Legal: comply with law, enforce terms.</li>
              </ul>
              <div className="mk-legal__highlight">
                <div className="mk-legal__highlight-title">We do NOT</div>
                <p className="mk-legal__highlight-text">Sell your data. Share with recruiters or third parties. Use your content to train models. Show ads.</p>
              </div>
            </Reveal>

            <Reveal delay={150}>
              <h2 id="storage" className="mk-legal__section-title">3. Storage & security</h2>
              <p className="mk-legal__text">PostgreSQL on Neon (EU/US regions), branchable object storage for documents. All access via short-lived signed URLs (15 min). Encryption at rest (AES-256) and in transit (TLS 1.3). Backups encrypted, retained 7 days.</p>
            </Reveal>

            <Reveal delay={200}>
              <h2 id="sharing" className="mk-legal__section-title">4. Sharing & disclosure</h2>
              <p className="mk-legal__text">We share data only with:</p>
              <ul className="mk-legal__list">
                <li>Neon (database), Fly (compute), Netlify (hosting) — as processors under DPA.</li>
                <li>Legal authorities when required by law.</li>
              </ul>
              <p className="mk-legal__text">No advertising networks. No data brokers. No third-party analytics.</p>
            </Reveal>

            <Reveal delay={250}>
              <h2 id="rights" className="mk-legal__section-title">5. Your rights (GDPR/CCPA)</h2>
              <ul className="mk-legal__list">
                <li>Access: request a copy of your data.</li>
                <li>Rectification: correct inaccurate data.</li>
                <li>Erasure: delete your account and all data (irreversible).</li>
                <li>Portability: export JSON/CSV/PDF of your profile, matches, documents.</li>
                <li>Objection: opt out of aggregate analytics.</li>
              </ul>
              <p className="mk-legal__text">Email <a href="mailto:privacy@angisoft.co.ke" className="mk-link">privacy@angisoft.co.ke</a> to exercise rights. Response within 30 days.</p>
            </Reveal>

            <Reveal delay={300}>
              <h2 id="cookies" className="mk-legal__section-title">6. Cookies & tracking</h2>
              <p className="mk-legal__text">We use only essential cookies: Neon Auth session (HttpOnly, Secure, SameSite=Lax), CSRF token. No analytics cookies, no marketing pixels, no fingerprinting.</p>
            </Reveal>

            <Reveal delay={350}>
              <h2 id="contact" className="mk-legal__section-title">7. Contact</h2>
              <p className="mk-legal__text">Questions? Email <a href="mailto:privacy@angisoft.co.ke" className="mk-link">privacy@angisoft.co.ke</a> or use the <a href="/contact" className="mk-link">contact form</a>.</p>
            </Reveal>
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}