"use client";

import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import { Slider } from "@/components/marketing/slider";
import { VideoHero } from "@/components/marketing/video-hero";
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
import { SITE } from "@/lib/seo";

interface FeatureContent {
  id: string;
  title: string;
  body: string;
  icon: string;
}

interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Smartphone,
  HardDrive,
  Zap,
  ShieldCheck,
  FileText,
  Globe,
};

function IconFromName(name: string) {
  const Comp = ICON_MAP[name] || Smartphone;
  return <Comp aria-hidden="true" />;
}

const PHONE_SLIDES = [
  {
    id: "browse",
    icon: Globe,
    title: "Browse roles anywhere",
    body: "Search and filter live roles, save the ones worth a closer look, and open them again from any device.",
  },
  {
    id: "track",
    icon: FileText,
    title: "Follow every application",
    body: "See each stage — discovered, shortlisted, preparing, applied, interview, offer — with follow-ups attached.",
  },
  {
    id: "offline",
    icon: HardDrive,
    title: "Keep going without signal",
    body: "Saved roles and application details stay available offline and sync when your connection returns.",
  },
];

export default function DownloadPage({
  initialHero = null,
  initialFeatures = null,
}: {
  initialHero?: HeroContent | null;
  initialFeatures?: FeatureContent[] | null;
}) {
  const hero = useApi<HeroContent>("/content/download/hero", undefined, initialHero);
  const features = useApi<FeatureContent[]>(
    "/content/download/features",
    undefined,
    initialFeatures,
  );

  const h = hero.data;
  const f = features.data ?? [];

  return (
    <MarketingLayout>
      <section className="mk-section mk-download pt-[140px]" aria-labelledby="download-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Download</span>
            {h && (
              <>
                <h1 id="download-title" className="mk-heading">{h.title}</h1>
                <p className="mk-lede">{h.description}</p>
              </>
            )}
            {!h && (
              <>
                <h1 id="download-title" className="mk-heading">Your job search in your pocket</h1>
                <p className="mk-lede">
                  Browse roles, save favourites and pick up where you left off, even when your
                  connection drops.
                </p>
              </>
            )}
          </header>
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "32px", alignItems: "flex-start" }}>
            <Reveal delay={0}>
              <div className="mk-frame mk-frame--phone" style={{ backgroundImage: "linear-gradient(180deg, #0a0e1a, #070b14)" }}>
                <div className="mk-frame__bar">
                  <div className="mk-frame__dots"><span className="mk-frame__dot" /><span className="mk-frame__dot" /><span className="mk-frame__dot" /></div>
                  <span className="mk-frame__title">MboQara</span>
                  <div className="mk-frame__dots" />
                </div>
                <div className="mk-frame__content">
                  <div className="mk-mock-list" style={{ gap: "10px" }}>
                    <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-accent-soft)", color: "var(--mk-accent)" }}><Smartphone aria-hidden="true" /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">3 new matches</div><div className="mk-mock-card__meta"><span>Updated 2m ago</span></div></div></div>
                    <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-success-soft)", color: "var(--mk-success)" }}><FileText aria-hidden="true" /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">CV exported</div><div className="mk-mock-card__meta"><span>PDF ready</span></div></div></div>
                    <div className="mk-mock-card"><div className="mk-mock-card__avatar" style={{ background: "var(--mk-info-soft)", color: "var(--mk-info)" }}><Globe aria-hidden="true" /></div><div className="mk-mock-card__info"><div className="mk-mock-card__title">Always up to date</div><div className="mk-mock-card__meta"><span>Last: 30s ago</span></div></div></div>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="max-w-[420px]">
                <div className="mk-download__badges">
                  <a href={SITE.playStoreUrl} target="_blank" rel="noopener noreferrer" className="mk-badge">
                    <Download aria-hidden="true" /> Download for Android
                  </a>
                  <a href={SITE.playStoreUrl} target="_blank" rel="noopener noreferrer" className="mk-badge">
                    <ExternalLink aria-hidden="true" /> Get it on Google Play
                  </a>
                </div>
                <div className="mk-download__features">
                  {features.loading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                      {[1, 2, 3].map((i: number) => (
                        <div key={i} className="mk-download__feature" style={{ opacity: 0.5 }}>
                          <div className="mk-download__feature-icon"><HardDrive /></div>
                          <div className="mk-download__feature-title">Loading…</div>
                          <div className="mk-download__feature-text">Loading…</div>
                        </div>
                      ))}
                    </div>
                  ) : f.length === 0 ? (
                    <p style={{ color: "var(--mk-text-muted)" }}>More features coming soon.</p>
                  ) : (
                    f.map((feat: FeatureContent, i: number) => (
                      <Reveal key={feat.id} delay={i * 80}>
                        <div className="mk-download__feature">
                          <div className="mk-download__feature-icon">{IconFromName(feat.icon)}</div>
                          <div className="mk-download__feature-title">{feat.title}</div>
                          <div className="mk-download__feature-text">{feat.body}</div>
                        </div>
                      </Reveal>
                    ))
                  )}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* App preview: motion asset plus a swipeable feature reel. */}
      <section className="mk-section" aria-labelledby="preview-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Preview</span>
            <h2 id="preview-heading" className="mk-section-heading">What the app feels like</h2>
            <p className="mk-lede">Saved roles, prepared documents and every next step — carried on your phone.</p>
          </header>
          <VideoHero
            poster="/media/radar-poster.jpg"
            videoSrc="/media/radar-loop.mp4"
            className="mk-section-card"
          />
          <div className="mt-10">
            <Slider autoPlay autoPlayInterval={6000} className="jr-feature-slider">
              {PHONE_SLIDES.map((slide) => {
                const Icon = slide.icon;
                return (
                  <Reveal key={slide.id}>
                    <article className="mk-card min-h-[220px]">
                      <div className="mk-card__icon"><Icon aria-hidden="true" /></div>
                      <h3 className="mk-card__title">{slide.title}</h3>
                      <p className="mk-card__text">{slide.body}</p>
                    </article>
                  </Reveal>
                );
              })}
            </Slider>
          </div>
        </div>
      </section>

      <section className="mk-section" style={{ background: "var(--mk-surface)", borderTop: "1px solid var(--mk-border)", borderBottom: "1px solid var(--mk-border)" }} aria-labelledby="install-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Installation</span>
            <h2 id="install-heading" className="mk-section-heading">How to install the app</h2>
          </header>
          <div className="mk-grid mk-grid--3">
            {[
              { step: "01", title: "Open Google Play", text: "Search for MboQara or use the button above — the app is free during founding access." },
              { step: "02", title: "Install", text: "Tap install. The download is small and works on Android 8.0 and newer." },
              { step: "03", title: "Sign in", text: "Sign in with your MboQara account and your saved roles and applications are waiting." },
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
            <a href={SITE.playStoreUrl} target="_blank" rel="noopener noreferrer" className="mk-btn mk-btn--primary mk-btn--lg">
              <Download aria-hidden="true" /> Download for Android
            </a>
            <Link href="/signup" className="mk-btn mk-btn--ghost mk-btn--lg">
              Try the web app <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
