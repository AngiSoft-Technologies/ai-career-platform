import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { FileText, ShieldCheck, Globe, HardDrive, Lock, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Service — Job Radar",
  description: "Job Radar terms of service: acceptable use, intellectual property, disclaimers, limitation of liability, and governing law.",
  openGraph: {
    title: "Terms of Service — Job Radar",
    description: "Terms of service for Job Radar. Free during beta. No warranty.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

export default function TermsPage() {
  return (
    <MarketingLayout>
      <section className="mk-section mk-legal" style={{ paddingTop: "140px" }} aria-labelledby="terms-title">
        <div className="mk-container mk-grid mk-grid--2" style={{ gap: "48px", alignItems: "start" }}>
          <aside className="mk-legal__toc">
            <nav className="mk-legal__toc-inner">
              <h3 className="mk-legal__toc-title">On this page</h3>
              <ul className="mk-legal__toc-list">
                <li><a className="mk-legal__toc-link" href="#acceptance">Acceptance</a></li>
                <li><a className="mk-legal__toc-link" href="#service">The service</a></li>
                <li><a className="mk-legal__toc-link" href="#accounts">Accounts</a></li>
                <li><a className="mk-legal__toc-link" href="#content">User content</a></li>
                <li><a className="mk-legal__toc-link" href="#acceptable">Acceptable use</a></li>
                <li><a className="mk-legal__toc-link" href="#ip">Intellectual property</a></li>
                <li><a className="mk-legal__toc-link" href="#disclaimer">Disclaimers</a></li>
                <li><a className="mk-legal__toc-link" href="#liability">Limitation of liability</a></li>
                <li><a className="mk-legal__toc-link" href="#termination">Termination</a></li>
                <li><a className="mk-legal__toc-link" href="#governing">Governing law</a></li>
                <li><a className="mk-legal__toc-link" href="#changes">Changes</a></li>
                <li><a className="mk-legal__toc-link" href="#contact">Contact</a></li>
              </ul>
            </nav>
          </aside>
          <article className="mk-legal__content">
            <Reveal delay={0}>
              <h1 id="terms-title" className="mk-legal__section-title">Terms of Service</h1>
              <p className="mk-legal__text"><strong>Effective:</strong> October 2026. <strong>Provider:</strong> AngiSoft Technologies, Nairobi, Kenya.</p>
            </Reveal>

            <Reveal delay={50}>
              <h2 id="acceptance" className="mk-legal__section-title">1. Acceptance</h2>
              <p className="mk-legal__text">By accessing or using Job Radar (the "Service"), you agree to these Terms. If you disagree, do not use the Service.</p>
            </Reveal>

            <Reveal delay={100}>
              <h2 id="service" className="mk-legal__section-title">2. The Service</h2>
              <p className="mk-legal__text">Job Radar provides: global job aggregation, scam risk scoring, semantic matching, ATS-ready document generation, application pipeline tracking, and mobile access. Features may change. Free during beta; paid plans announced later.</p>
            </Reveal>

            <Reveal delay={150}>
              <h2 id="accounts" className="mk-legal__section-title">3. Accounts</h2>
              <ul className="mk-legal__list">
                <li>You must provide accurate information. One account per person.</li>
                <li>You are responsible for your credentials. Neon Auth manages authentication.</li>
                <li>We may suspend accounts for abuse, fraud, or ToS violation.</li>
              </ul>
            </Reveal>

            <Reveal delay={200}>
              <h2 id="content" className="mk-legal__section-title">4. User Content</h2>
              <p className="mk-legal__text">You own your profile, documents, and application data. You grant us a licence to host, process, and display it solely to provide the Service. We do not claim ownership.</p>
            </Reveal>

            <Reveal delay={250}>
              <h2 id="acceptable" className="mk-legal__section-title">5. Acceptable Use</h2>
              <p className="mk-legal__text">You agree not to:</p>
              <ul className="mk-legal__list">
                <li>Scrape, crawl, or bulk-download listings.</li>
                <li>Submit fraudulent applications or impersonate others.</li>
                <li>Reverse-engineer the matching algorithm or risk models.</li>
                <li>Abuse the API (rate limits, automated abuse).</li>
                <li>Post illegal, harmful, or infringing content.</li>
              </ul>
            </Reveal>

            <Reveal delay={300}>
              <h2 id="ip" className="mk-legal__section-title">6. Intellectual Property</h2>
              <p className="mk-legal__text">Job Radar name, logo, UI, algorithms, and backend code are owned by AngiSoft Technologies. Aggregated job data belongs to respective sources. You may not copy the Service's look and feel.</p>
            </Reveal>

            <Reveal delay={350}>
              <h2 id="disclaimer" className="mk-legal__section-title">7. Disclaimers</h2>
              <p className="mk-legal__text">THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE". NO WARRANTIES OF ANY KIND: ACCURACY OF LISTINGS, MATCH SCORES, DOCUMENT QUALITY, UPTIME, OR FITNESS FOR PURPOSE. AI SUGGESTIONS ARE ASSISTIVE ONLY — VERIFY BEFORE SUBMITTING.</p>
            </Reveal>

            <Reveal delay={400}>
              <h2 id="liability" className="mk-legal__section-title">8. Limitation of Liability</h2>
              <p className="mk-legal__text">TO THE MAXIMUM EXTENT PERMITTED BY LAW, ANGISOFT TECHNOLOGIES SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. TOTAL LIABILITY CAPPED AT $100 OR FEES PAID IN PRIOR 12 MONTHS.</p>
            </Reveal>

            <Reveal delay={450}>
              <h2 id="termination" className="mk-legal__section-title">9. Termination</h2>
              <p className="mk-legal__text">You may delete your account anytime (irreversible). We may suspend or terminate for ToS violation with notice (except for security emergencies). Surviving clauses: IP, disclaimer, liability, governing law.</p>
            </Reveal>

            <Reveal delay={500}>
              <h2 id="governing" className="mk-legal__section-title">10. Governing Law</h2>
              <p className="mk-legal__text">These Terms are governed by the laws of Kenya. Disputes resolved in Nairobi courts. If any clause is unenforceable, the rest remains.</p>
            </Reveal>

            <Reveal delay={550}>
              <h2 id="changes" className="mk-legal__section-title">11. Changes</h2>
              <p className="mk-legal__text">We may update these Terms. Material changes: 30 days' notice via email and in-app banner. Continued use = acceptance.</p>
            </Reveal>

            <Reveal delay={600}>
              <h2 id="contact" className="mk-legal__section-title">12. Contact</h2>
              <p className="mk-legal__text">Questions? Email <a href="mailto:legal@angisoft.co.ke" className="mk-link">legal@angisoft.co.ke</a> or use the <a href="/contact" className="mk-link">contact form</a>.</p>
            </Reveal>
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}