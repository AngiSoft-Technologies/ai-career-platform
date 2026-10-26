import { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import {
  Smartphone,
  HardDrive,
  Zap,
  ShieldCheck,
  Download,
  ExternalLink,
  Check,
  ArrowRight,
  FileText,
  Globe,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Download — Job Radar Android App",
  description: "Download the Job Radar Android APK. SQLite offline, background sync, push alerts. Free during development.",
  openGraph: {
    title: "Download — Job Radar",
    description: "Native Flutter app. SQLite offline. Background sync. Push alerts. Free during beta.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};

const FEATURES = [
  { icon: HardDrive, title: "SQLite offline", text: "Full read access to your matches, documents and pipeline without a connection." },
  { icon: Zap, title: "Background sync", text: "New matches, reminders and alerts arrive even when the app is closed." },
  { icon: ShieldCheck, title: "Push alerts", text: "Instant notification when a high-match role appears or a follow-up is due." },
];

export default function DownloadPage() {
  return (
    <MarketingLayout>
      <section className="mk-section mk-download" style={{ paddingTop: "140px" }} aria-labelledby="download-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Download</span>
            <h1 id="download-title" className="mk-heading">Your radar in your pocket</h1>
            <p className="mk-lede">Native Flutter app. SQLite offline. Background sync. Push alerts. APK ready, Play Store submission in progress.</p>
          </header>
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "32px", alignItems: "flex-start" }}>
            <Reveal delay={0}>
              <div className="mk-frame mk-frame--phone" style={{ backgroundImage: "linear-gradient(180deg, #0a0e1a, #070b14)" }}>
                <div className="mk-frame__bar">
                  <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
                  <span className="mk-frame__title">Job Radar</span>
                  <div className="mk-frame__dots" />
                </div>
                <div className="mk-frame__content">
                  <div className="mk-mock-list" style={{ gap: "10px" }}>
                    <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-accent-soft)", color: "var(--mk-accent)" }}><Smartphone aria-hidden="true" /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">3 new matches</div><div className="mk-mock-card__meta"><span>Updated 2m ago</span></div></div></div>
                    <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-success-soft)", color: "var(--mk-success)" }}><FileText aria-hidden="true" /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">CV exported</div><div className="mk-mock-card__meta"><span>PDF ready</span></div></div></div>
                    <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-info-soft)", color: "var(--mk-info)" }}><Globe aria-hidden="true" /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">Background sync</div><div className="mk-mock-card__meta"><span>Last: 30s ago</span></div></div></div>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div style={{ maxWidth: "420px" }}>
                <div className="mk-download__badges">
                  <a href="/download" className="mk-badge">
                    <Download aria-hidden="true" /> Download APK (206 MB)
                  </a>
                  <a href="https://play.google.com/store/apps/details?id=com.angisoft.jobradar" target="_blank" rel="noopener noreferrer" className="mk-badge">
                    <ExternalLink aria-hidden="true" /> Coming to Google Play
                  </a>
                </div>
                <div className="mk-download__features">
                  {FEATURES.map((f, i) => (
                    <Reveal key={f.title} delay={i * 80}>
                      <div className="mk-download__feature">
                        <div className="mk-download__feature-icon"><f.icon aria-hidden="true" /></div>
                        <div className="mk-download__feature-title">{f.title}</div>
                        <div className="mk-download__feature-text">{f.text}</div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section" style={{ background: "var(--mk-surface)", borderTop: "1px solid var(--mk-border)", borderBottom: "1px solid var(--mk-border)" }} aria-labelledby="install-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Installation</span>
            <h2 id="install-heading" className="mk-section-heading">How to install the APK</h2>
          </header>
          <div className="mk-grid mk-grid--3">
            {[
              { step: "01", title: "Download", text: "Tap the button above to download the APK (206 MB)." },
              { step: "02", title: "Allow unknown sources", text: "Settings → Security → Allow installation from unknown sources." },
              { step: "03", title: "Install & open", text: "Open the APK, install, and sign in with your Neon Auth account." },
            ].map((s, i) => (
              <Reveal key={s.step} delay={i * 100} className="mk-card">
                <div className="mk-card__icon" style={{ fontSize: "2rem", color: "var(--mk-accent)" }}>{s.step}</div>
                <h3 className="mk-card__title">{s.title}</h3>
                <p className="mk-card__text">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta" aria-labelledby="cta-heading">
        <div className="mk-container">
          <h2 id="cta-heading" className="mk-cta__title">Get the app — it's free</h2>
          <p className="mk-cta__text">No credit card. No auto-renewal. Help us build the honest job search you deserve.</p>
          <div className="mk-cta__actions">
            <a href="/download" className="mk-btn mk-btn--primary mk-btn--lg">
              <Download aria-hidden="true" /> Download APK
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}