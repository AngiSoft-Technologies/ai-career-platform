"use client";

import Link from "next/link";
import Image from "next/image";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { Slider } from "@/components/marketing/slider";
import {
  DiscoveryIllustration,
  DocumentIllustration,
  MatchIllustration,
  TrackerIllustration,
} from "@/components/marketing/illustrations";
import { useApi } from "@/lib/hooks";
import {
  Target,
  FileText,
  Mail,
  Briefcase,
  ShieldCheck,
  Rocket,
  Search,
  Sparkles,
  ArrowRight,
} from "lucide-react";

;

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
  Target,
  FileText,
  Mail,
  Briefcase,
  ShieldCheck,
  Rocket,
};

function IconFromName(name: string) {
  const Comp = ICON_MAP[name] || Rocket;
  return <Comp aria-hidden="true" />;
}

/** Product illustrations that show what each feature actually looks like. */
const PRODUCT_STEPS = [
  {
    id: "discovery",
    Illustration: DiscoveryIllustration,
    title: "One search, every source",
    body:
      "Roles from supported job boards and company career pages, filtered by what you want — role, location, work mode, experience level. No more opening nine tabs.",
  },
  {
    id: "matching",
    Illustration: MatchIllustration,
    title: "A score that explains itself",
    body:
      "Your skills, experience, location and work-mode preferences compared with each role, newest roles weighted — with the reasons attached so you can judge it.",
  },
  {
    id: "documents",
    Illustration: DocumentIllustration,
    title: "Documents drafted for the role",
    body:
      "A CV, resume, cover letter or application email written from your own information and shaped to that specific job. Edit it, then export to PDF or Word.",
  },
  {
    id: "workspace",
    Illustration: TrackerIllustration,
    title: "Follow through, stage by stage",
    body:
      "Every application keeps its documents, notes and reminders in one workspace, so you always know the next move — online or offline on Android.",
  },
];

export default function FeaturesPage({
  initialHero = null,
  initialFeatures = null,
}: {
  initialHero?: HeroContent | null;
  initialFeatures?: FeatureContent[] | null;
}) {
  const hero = useApi<HeroContent>("/content/features/hero", undefined, initialHero);
  const features = useApi<FeatureContent[]>("/content/features", undefined, initialFeatures);

  const h = hero.data;
  const f = features.data?.length ? features.data : [
    { id: "discover", title: "Discover opportunities", body: "Search across roles and sources, with your preferences in view.", icon: "Briefcase" },
    { id: "match", title: "Understand your match", body: "See how your skills and experience connect to a role.", icon: "Target" },
    { id: "prepare", title: "Prepare your application", body: "Bring relevant experience forward in your resume and cover letter.", icon: "FileText" },
    { id: "organize", title: "Track each next step", body: "Keep applications, follow-ups and documents together.", icon: "Mail" },
  ];

  return (
    <MarketingLayout>
      <section className="mk-section" style={{ paddingTop: "140px" }} aria-labelledby="features-title">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">What MboQara does for you</span>
            {h && (
              <>
                <h1 id="features-title" className="mk-heading" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}>
                  {h.title}
                </h1>
                <p className="mk-lede">{h.description}</p>
              </>
            )}
            {!h && (
              <>
                <h1 id="features-title" className="mk-heading" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}>
                  Find real jobs. Apply with confidence.
                </h1>
                <p className="mk-lede">
                  MboQara helps students, graduates and professionals find openings worldwide, tailor resumes and
                  cover letters to each role, and track every application — all in one place.
                </p>
              </>
            )}
          </header>
        </div>
      </section>

      <section className="jr-feature-story" aria-labelledby="feature-story-title">
        <div className="jr-feature-story__photo">
          <Image src="/media/careers/women-in-tech.webp" alt="A technologist working at a computer in a dark studio" fill sizes="(max-width: 760px) 100vw, 45vw" />
        </div>
        <div className="jr-feature-story__copy">
          <span className="jr-eyebrow jr-eyebrow--dark">One search, connected steps</span>
          <h2 id="feature-story-title">Know what fits. Show why you fit.</h2>
          <p>MboQara brings opportunity discovery, match insights, resume preparation and application tracking into one job-seeker workspace.</p>
          <div className="jr-feature-story__chips"><span><Search aria-hidden="true" /> Relevant roles</span><span><Target aria-hidden="true" /> Clear match details</span><span><FileText aria-hidden="true" /> Resume support</span></div>
          <Link href="/signup" className="jr-button jr-button--primary">Create my profile <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="product-reel-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Inside the product</span>
            <h2 id="product-reel-heading" className="mk-section-heading">What each step actually looks like</h2>
            <p className="mk-lede">Discovery, matching, documents and tracking — drawn as they appear in the app.</p>
          </header>
          <Slider
            label="How each MboQara feature works"
            autoPlay
            autoPlayInterval={6000}
            className="jr-media-slider"
          >
            {PRODUCT_STEPS.map(({ id, Illustration, title, body }) => (
              <article className="jr-media-slide" key={id}>
                <div className="jr-media-slide__figure jr-media-slide__figure--illustration">
                  <Illustration />
                </div>
                <div className="jr-media-slide__copy">
                  <h3 className="jr-media-slide__title">{title}</h3>
                  <p className="jr-media-slide__body">{body}</p>
                </div>
              </article>
            ))}
          </Slider>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="features-grid-heading">
        <div className="mk-container">
          {features.loading ? (
            <div className="mk-grid mk-grid--3" style={{ gap: "24px" }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="mk-card" style={{ height: "240px", display: "flex", flexDirection: "column", gap: "12px", padding: "28px" }}>
                  <div className="mk-card__icon" style={{ color: "var(--mk-text-muted)" }}><Sparkles /></div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--mk-text-muted)" }}>{"Loading…"}</div>
                  <div style={{ fontSize: "0.92rem", color: "var(--mk-text-soft)", lineHeight: 1.65 }}>{"Loading…"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mk-grid mk-grid--3">
              {f.map((feat, i) => (
                <Reveal key={feat.id} delay={i * 80} className="mk-card">
                  <div className="mk-card__icon">{IconFromName(feat.icon)}</div>
                  <h3 className="mk-card__title">{feat.title}</h3>
                  <p className="mk-card__text">{feat.body}</p>
                  <Link href="/signup" className="mk-btn mk-btn--ghost mk-btn--sm" style={{ marginTop: "16px", width: "fit-content" }}>
                    <ArrowRight aria-hidden="true" /> Get started
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

    </MarketingLayout>
  );
}
