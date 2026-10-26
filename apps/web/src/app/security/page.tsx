import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { ShieldCheck, Lock, Globe, HardDrive, Bug, Zap, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Security — Job Radar",
  description: "Job Radar security practices: encryption, signed URLs, vulnerability disclosure, infrastructure, and compliance.",
  openGraph: {
    title: "Security — Job Radar",
    description: "Encryption, signed URLs, responsible disclosure, infrastructure security.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

export default function SecurityPage() {
  return (
    <MarketingLayout>
      <section className="mk-section mk-legal" style={{ paddingTop: "140px" }} aria-labelledby="security-title">
        <div className="mk-container mk-grid mk-grid--2" style={{ gap: "48px", alignItems: "start" }}>
          <aside className="mk-legal__toc">
            <nav className="mk-legal__toc-inner">
              <h3 className="mk-legal__toc-title">On this page</h3>
              <ul className="mk-legal__toc-list">
                <li><a className="mk-legal__toc-link" href="#overview">Overview</a></li>
                <li><a className="mk-legal__toc-link" href="#encryption">Encryption</a></li>
                <li><a className="mk-legal__toc-link" href="#auth">Authentication</a></li>
                <li><a className="mk-legal__toc-link" href="#infrastructure">Infrastructure</a></li>
                <li><a className="mk-legal__toc-link" href="#disclosure">Vulnerability disclosure</a></li>
                <li><a className="mk-legal__toc-link" href="#compliance">Compliance</a></li>
              </ul>
            </nav>
          </aside>
          <article className="mk-legal__content">
            <Reveal delay={0}>
              <h1 id="security-title" className="mk-legal__section-title">Security</h1>
              <p className="mk-legal__text">Security is not a feature — it's the foundation. Job Radar is built on Neon, Fly, and Netlify with defence in depth.</p>
            </Reveal>

            <Reveal delay={50}>
              <h2 id="overview" className="mk-legal__section-title">Overview</h2>
              <p className="mk-legal__text">Job Radar runs on three managed platforms:</p>
              <ul className="mk-legal__list">
                <li><strong>Neon</strong> (PostgreSQL + pgvector + Object Storage) — SOC 2 Type II, EU/US regions, branchable.</li>
                <li><strong>Fly.io</strong> (backend compute) — isolated VMs, private networking, DDoS protection.</li>
                <li><strong>Netlify</strong> (frontend + edge) — WAF, DDoS, immutable deploys, TLS 1.3.</li>
              </ul>
              <p className="mk-legal__text">No self-managed databases or servers. Attack surface minimised.</p>
            </Reveal>

            <Reveal delay={100}>
              <h2 id="encryption" className="mk-legal__section-title">Encryption</h2>
              <ul className="mk-legal__list">
                <li><strong>At rest:</strong> AES-256 (Neon volumes, Fly volumes, Netlify edge).</li>
                <li><strong>In transit:</strong> TLS 1.3 everywhere. HSTS, CSP, COOP, CORP headers enforced.</li>
                <li><strong>Object storage:</strong> Per-user buckets, branchable. Access only via 15-min signed URLs (HMAC-SHA256).</li>
                <li><strong>Secrets:</strong> Fly secrets (API keys, DB URL). Never in code or logs.</li>
              </ul>
            </Reveal>

            <Reveal delay={150}>
              <h2 id="auth" className="mk-legal__section-title">Authentication</h2>
              <ul className="mk-legal__list">
                <li>Neon Auth (Better Auth) — email/password, OAuth (Google, GitHub, Microsoft).</li>
                <li>Session cookies: HttpOnly, Secure, SameSite=Lax, Partitioned (first-party).</li>
                <li>JWT in memory (localStorage) for API calls. Short-lived (15 min), refreshed silently.</li>
                <li>No password storage by us. Argon2id via Neon Auth.</li>
                <li>MFA and passkeys supported (Neon Auth roadmap).</li>
              </ul>
            </Reveal>

            <Reveal delay={200}>
              <h2 id="infrastructure" className="mk-legal__section-title">Infrastructure hardening</h2>
              <ul className="mk-legal__list">
                <li>Private networking: Fly ↔ Neon via VPC peering. No public DB endpoint.</li>
                <li>Rate limiting: 120 req/min per IP on API. Stricter on auth endpoints.</li>
                <li>CSP: strict (script-src 'self', style-src 'self' 'unsafe-inline' for Tailwind).</li>
                <li>WAF: Netlify managed rules + custom rules for API abuse.</li>
                <li>Dependency scanning: npm audit + GitHub Dependabot on every PR.</li>
                <li>Container: distroless base, non-root user, read-only rootfs.</li>
              </ul>
            </Reveal>

            <Reveal delay={250}>
              <h2 id="disclosure" className="mk-legal__section-title">Vulnerability disclosure</h2>
              <p className="mk-legal__text">We take security issues seriously. Report vulnerabilities to <a href="mailto:security@angisoft.co.ke" className="mk-link">security@angisoft.co.ke</a>.</p>
              <ul className="mk-legal__list">
                <li>We acknowledge within 48 hours.</li>
                <li>We aim to triage within 7 days.</li>
                <li>We coordinate disclosure after fix.</li>
                <li>No bounty program yet — credit in Hall of Fame (coming).</li>
              </ul>
              <div className="mk-legal__highlight">
                <div className="mk-legal__highlight-title">Scope</div>
                <p className="mk-legal__highlight-text">*.job-radar-ke.netlify.app, job-radar-api-angisoft.fly.dev, Neon project winter-math-18734777. Out of scope: social engineering, DoS, missing rate limits on non-auth endpoints.</p>
              </div>
            </Reveal>

            <Reveal delay={300}>
              <h2 id="compliance" className="mk-legal__section-title">Compliance</h2>
              <ul className="mk-legal__list">
                <li>GDPR (Art. 28 DPA with Neon, Fly, Netlify).</li>
                <li>CCPA — delete endpoint, no sale.</li>
                <li>SOC 2 Type II (inherited from Neon, Fly, Netlify).</li>
                <li>OWASP ASVS Level 2 target for v1.0.</li>
              </ul>
            </Reveal>
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}