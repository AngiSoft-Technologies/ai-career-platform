"use client";

import Link from "next/link";
import Image from "next/image";
import { MarketingLayout } from "@/components/marketing/layout";
import { MediaSlider, type MediaSlide } from "@/components/marketing/media-slider";
import { SectionHeading } from "@/components/marketing/page-hero";
import { InView } from "@/components/marketing/in-view";
import { BackdropVideo } from "@/components/marketing/backdrop-video";
import { Marquee } from "@/components/marketing/marquee";
import {
  AppFrame,
  DocumentDraftMock,
  OpportunityFeedMock,
  TrackerMock,
  TrustEngineMock,
} from "@/components/marketing/app-frame";
import { StatBand } from "@/components/marketing/stat-band";
import { Faq, CtaBand } from "@/components/marketing/faq";
import { useApi } from "@/lib/hooks";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  FileText,
  Mail,
  Play,
  Rocket,
  ScanEye,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  WifiOff,
} from "lucide-react";

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
  Search,
  BadgeCheck,
  WifiOff,
};

/** What the platform is doing right now, which it can stand behind. */
const PLATFORM_STATS = [
  {
    value: 28,
    suffix: "k",
    label: "Opportunities indexed",
    note: "Roles gathered from company career pages and job boards, refreshed daily.",
    tone: "insight" as const,
  },
  {
    value: 130,
    suffix: "+",
    label: "Employer boards read",
    note: "Workday, Oracle HCM, Taleo and company sites across Kenya and abroad.",
    tone: "verified" as const,
  },
  {
    value: 3400,
    label: "Roles a candidate can hold",
    note: "Postings whose stated requirements a candidate in Kenya can actually meet.",
    tone: "signal" as const,
  },
  {
    value: 359,
    label: "Postings held back",
    note: "Caught by the trust engine and kept out of the feed — this week's count.",
    tone: "plain" as const,
  },
];

/** The product reel: each slide is a real screen, not a photograph. */
const PRODUCT_REEL: MediaSlide[] = [
  {
    id: "reel-feed",
    eyebrow: "Step one — discover",
    title: "One feed, every board",
    body:
      "Roles from company career pages and job boards, filtered by what you want — role, location, work mode, experience level — and ranked by how well each one fits.",
    illustration: (
      <AppFrame url="mboqara.angisoft.co.ke/opportunities" label="The opportunity feed, showing ranked roles with match scores and eligibility badges">
        <OpportunityFeedMock />
      </AppFrame>
    ),
  },
  {
    id: "reel-trust",
    eyebrow: "Step two — trust",
    title: "Checked before you ever see it",
    body:
      "Every posting is scored before it reaches you: a salary that is out of line for the title, a domain registered last month, text copied from a known template. The pane shows exactly what was found.",
    illustration: (
      <AppFrame url="mboqara.angisoft.co.ke/opportunities/trust" label="The trust engine's verdict on a posting, listing what it found and the decision it made">
        <TrustEngineMock />
      </AppFrame>
    ),
  },
  {
    id: "reel-documents",
    eyebrow: "Step three — prepare",
    title: "Documents written for one role",
    body:
      "A CV, cover letter or application email drafted from your own information and shaped to the posting — the skills the employer named are the skills brought forward.",
    illustration: (
      <AppFrame url="mboqara.angisoft.co.ke/documents" label="A CV drafted for a specific role, with the skills the posting names brought forward">
        <DocumentDraftMock />
      </AppFrame>
    ),
  },
  {
    id: "reel-track",
    eyebrow: "Step four — follow through",
    title: "Every application, one workspace",
    body:
      "Saved, applied, interview, offer — each application keeps its documents, notes and next step, online or offline on Android.",
    illustration: (
      <AppFrame url="mboqara.angisoft.co.ke/applications" label="The application tracker, showing applications at each stage">
        <TrackerMock />
      </AppFrame>
    ),
  },
];

const FEATURE_FALLBACK = [
  {
    id: "discover",
    icon: "Search",
    title: "Discovery that covers the ground",
    body:
      "Company career pages and job boards are read every day — 130 employer boards across Kenya and abroad. A role posted on a company's own site is found the same day it appears, without opening nine tabs.",
  },
  {
    id: "eligibility",
    icon: "BadgeCheck",
    title: "Eligibility, before you apply",
    body:
      "The posting's own requirements decide it: citizenship, residency, years of experience, degree or licence. If a candidate in Kenya cannot hold the role, it says so — you stop wasting an afternoon on it.",
  },
  {
    id: "trust",
    icon: "ShieldCheck",
    title: "A trust engine between you and the scam",
    body:
      "Salary outliers, brand-new domains, template spam, fees asked up front. Postings it holds never reach the feed — the decision is honoured, not displayed as decoration.",
  },
  {
    id: "matching",
    icon: "Target",
    title: "A match score that explains itself",
    body:
      "Your skills, experience, location and work-mode preferences compared with each role, newest roles weighted — with the reasons attached.",
  },
  {
    id: "documents",
    icon: "FileText",
    title: "Documents drafted for the role",
    body:
      "A CV, resume, cover letter or application email written from your own information and shaped to that specific job. Edit it, then export to PDF or Word.",
  },
  {
    id: "offline",
    icon: "WifiOff",
    title: "Works on the connection you have",
    body:
      "The Android app keeps your applications and documents available offline and syncs when signal returns — a job search in Nairobi has to survive the power going out.",
  },
];

const MARQUEE_FACTS = [
  "Company career pages read daily",
  "130 employer boards",
  "Every posting scored before it reaches you",
  "Eligibility read from the posting's own words",
  "Offline on Android",
  "Documents drafted per role",
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
  const f = features.data?.length ? features.data : FEATURE_FALLBACK;

  return (
    <MarketingLayout>
      {/* --- hero: the radar runs behind it ---------------------------------- */}
      <section className="mk-video-hero" aria-labelledby="features-title">
        <div className="mk-video-hero__media" aria-hidden="true">
          <BackdropVideo src="/media/radar-loop.mp4" poster="/media/radar-poster.jpg" />
          <span className="mk-video-hero__veil" />
          <span className="mk-aurora" />
        </div>
        <div className="mk-video-hero__inner">
          <div className="mk-container">
            <div className="mk-stagger" style={{ display: "grid", gap: "20px", justifyItems: "start", maxWidth: "780px" }}>
              <span className="mk-eyebrow mk-eyebrow--signal">
                <span className="mk-eyebrow__rule" aria-hidden="true" />
                What MboQara does
              </span>
              <h1 id="features-title" className="mk-display">
                {h?.title ?? "Find real jobs. Apply with confidence."}
              </h1>
              <p className="mk-lede max-w-prose-wide">
                {h?.description ??
                  "MboQara helps students, graduates and professionals find openings worldwide, tells them which ones they can actually hold, drafts the documents for each role, and tracks every application — all in one place."}
              </p>
              <div className="flex flex-wrap gap-3 mt-1">
                <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg mk-glow-line">
                  Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
                </Link>
                <a href="#reel" className="mk-btn mk-btn--ghost mk-btn--lg">
                  <Play className="mk-btn__icon" aria-hidden="true" /> See the product
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- live facts, moving ---------------------------------------------- */}
      <Marquee items={MARQUEE_FACTS} />

      <section className="mk-section pt-6" aria-label="Platform figures">
        <div className="mk-container">
          <InView className="mk-reveal">
            <StatBand stats={PLATFORM_STATS} label="What the platform is doing right now" />
          </InView>
        </div>
      </section>

      {/* --- the reel --------------------------------------------------------- */}
      <section className="mk-section" id="reel" aria-labelledby="reel-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="Inside the product"
            eyebrowTone="insight"
            title={<span id="reel-heading">What each step actually looks like</span>}
            lede="Discovery, trust, documents and tracking — drawn as the screens themselves, not as stock illustrations."
          />
          <InView className="mk-reveal mk-reveal--scale">
            <MediaSlider slides={PRODUCT_REEL} label="How each MboQara feature works" interval={6500} />
          </InView>
        </div>
      </section>

      {/* --- the six capabilities, as a chapter with a sticky marker -----------
          Rows, not cards: each row is the fact, hovered. */}
      <section className="mk-section" aria-labelledby="capabilities-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="The work it does"
            eyebrowTone="signal"
            title={<span id="capabilities-heading">Six things a candidate should not have to do by hand</span>}
            lede="Each of these replaces a morning of browser tabs, a spreadsheet, or a guess."
          />
          <div className="mk-chapter">
            <aside className="mk-chapter__marker">
              <span className="mk-eyebrow mk-eyebrow--signal">Capabilities</span>
              <p className="mt-4 mb-0 text-[0.92rem] leading-[1.7] text-text-soft">
                Hover a row to read it. Every one of these is a decision the platform makes so the candidate
                doesn&apos;t have to.
              </p>
            </aside>
            <div className="mk-stagger">
              {features.loading ? (
                <div className="mk-panel p-6">Loading…</div>
              ) : (
                f.map((feat, i) => {
                  const Icon = ICON_MAP[feat.icon] ?? Rocket;
                  return (
                    <Link key={feat.id} href="/signup" className="mk-row-link group">
                      <span
                        aria-hidden="true"
                        className="grid place-items-center w-11 h-11 rounded-xl border border-hairline bg-[rgba(255,255,255,0.05)] text-signal"
                      >
                        <Icon />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[1.05rem] font-bold text-text">{feat.title}</span>
                        <span className="block mt-1 text-[0.92rem] leading-[1.6] text-text-soft">{feat.body}</span>
                      </span>
                      <span className="mk-numeral text-[0.8rem] text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <ArrowRight className="mk-row-link__arrow w-4 h-4" aria-hidden="true" />
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {/* --- the split editorial — photograph beside offset text -------------
          Deliberately not a card: the copy overlaps the photograph's edge,
          which is what makes a composition read as designed rather than
          stacked. */}
      <section className="mk-section" aria-labelledby="story-heading">
        <div className="mk-container">
          <div className="mk-split">
            <div className="mk-split__media">
              <Image src="/media/woman-laptop.webp" alt="A candidate writing an application at a laptop" fill sizes="(max-width: 960px) 100vw, 52vw" />
            </div>
            <InView className="mk-split__copy mk-reveal mk-reveal--right">
              <div className="mk-glass p-7 lg:p-10 grid gap-4">
                <span className="mk-eyebrow mk-eyebrow--signal">How it started</span>
                <h2 id="story-heading" className="mk-display mk-display--sm">
                  Nine tabs, one spreadsheet, and a week gone
                </h2>
                <p className="m-0 text-[1rem] leading-[1.75] text-text-soft">
                  The usual search is nine boards open, a spreadsheet of what was applied to, and a week
                  that disappears into postings that were never really open to you. MboQara exists because
                  the honest version of that search — knowing which roles are real, which you can hold, and
                  which are traps — was the version nobody had built.
                </p>
                <div className="mk-chip-row mt-2">
                  <span className="mk-chip"><Search aria-hidden="true" /> Read daily</span>
                  <span className="mk-chip mk-chip--verified"><BadgeCheck aria-hidden="true" /> Eligibility answered</span>
                  <span className="mk-chip mk-chip--signal"><ShieldCheck aria-hidden="true" /> Scams held back</span>
                </div>
              </div>
            </InView>
          </div>
        </div>
      </section>

      {/* --- the statement — a section that is only type ---------------------- */}
      <section className="mk-statement" aria-label="The promise">
        <div className="mk-container">
          <InView className="mk-reveal">
            <p className="mk-statement__text mk-statement__text--wide">
              A job search you can{" "}
              <span className="mk-gradient-text">check the work of</span> — every score, every answer,
              every held posting, with its reasons attached.
            </p>
          </InView>
        </div>
      </section>

      {/* --- the scam shield, over imagery ----------------------------------- */}
      <section className="mk-feature-hero" aria-labelledby="shield-heading">
        <div className="mk-feature-hero__media" aria-hidden="true">
          <Image src="/media/career-fair.webp" alt="" fill sizes="100vw" priority />
          <span className="mk-feature-hero__veil" />
        </div>
        <div className="mk-container" style={{ position: "relative" }}>
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center py-20 lg:py-28">
            <InView className="mk-reveal mk-reveal--left">
              <div className="mk-glass mk-glass--verified p-7 lg:p-9 grid gap-4">
                <span className="mk-eyebrow mk-eyebrow--verified">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" /> The Scam Shield
                </span>
                <h2 id="shield-heading" className="mk-display mk-display--sm">
                  Job scams are a Kenyan problem. This is a Kenyan answer.
                </h2>
                <p className="m-0 text-[0.98rem] leading-[1.7] text-text-soft">
                  A fake posting does not cost you an application — it costs the fee you wired for
                  &ldquo;training materials&rdquo;, the cheque you deposited, or the identity you attached to it.
                  The trust engine reads every posting before you do, and shows its work.
                </p>
                <div className="mk-stagger grid gap-2.5 mt-2">
                  {[
                    "Salary against what the same title pays elsewhere",
                    "Domain age, and the text against known templates",
                    "A fee asked before an interview",
                    "An interview that only happens over chat",
                  ].map((fact) => (
                    <div key={fact} className="flex items-start gap-2.5 text-[0.9rem] leading-[1.5] text-text-soft">
                      <BadgeCheck className="w-4 h-4 mt-0.5 shrink-0 text-verified" aria-hidden="true" />
                      {fact}
                    </div>
                  ))}
                </div>
                <p className="m-0 text-[0.85rem] leading-[1.6] text-text-muted">
                  A held posting never enters the feed — the decision is honoured, not displayed as decoration.
                </p>
              </div>
            </InView>
            <InView className="mk-reveal mk-reveal--right" delay={140}>
              <div className="mk-tilt">
                <AppFrame url="mboqara.angisoft.co.ke/opportunities/held" label="The trust engine's report on a held posting">
                  <TrustEngineMock />
                </AppFrame>
              </div>
            </InView>
          </div>
        </div>
      </section>

      {/* --- eligibility ------------------------------------------------------ */}
      <section className="mk-section" aria-labelledby="eligibility-heading">
        <div className="mk-container">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] items-center">
            <InView className="mk-reveal">
              <SectionHeading
                eyebrow="Eligibility"
                eyebrowTone="signal"
                title={<span id="eligibility-heading">Know before you apply whether you can hold the role</span>}
                lede="Most of the indexed catalogue is posted abroad, and much of it carries a residency rule. Reading the requirements takes minutes; MboQara already read them."
              />
              <Link href="/signup" className="mk-btn mk-btn--signal">
                Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
              </Link>
            </InView>
            <InView className="mk-reveal mk-reveal--right" delay={120}>
              <div className="mk-glass p-7 lg:p-9 grid gap-5">
                <span className="mk-big-number mk-big-number--signal">3,396</span>
                <p className="m-0 text-[0.95rem] leading-[1.65] text-text-soft">
                  Of ~28,000 indexed roles, that is how many state requirements a candidate in Kenya can
                  actually meet. The rest are posted abroad with a residency rule nobody reads until the
                  rejection — and the platform says so before you spend the afternoon.
                </p>
                <div className="mk-stagger grid gap-2">
                  {["Citizenship or residency", "Years of experience", "Degree, licence or certification", "Work mode"].map((row) => (
                    <div key={row} className="flex items-center gap-3 text-[0.88rem] text-text-soft">
                      <ScanEye className="w-4 h-4 text-signal" aria-hidden="true" />
                      {row}
                      <span className="ml-auto text-[0.72rem] font-bold uppercase tracking-[0.08em] text-verified">Checked</span>
                    </div>
                  ))}
                </div>
              </div>
            </InView>
          </div>
        </div>
      </section>

      {/* --- the caption band — a photograph and one line of type ------------ */}
      <section className="mk-caption-band" aria-label="Where the roles come from">
        <div className="mk-caption-band__media">
          <Image src="/media/nairobi-skyline.webp" alt="The Nairobi skyline" fill sizes="100vw" />
          <span className="mk-caption-band__veil" />
        </div>
        <div className="mk-caption-band__text">
          <div className="mk-container">
            <InView className="mk-reveal">
              <p className="m-0 max-w-[26ch] text-[clamp(1.3rem,2.6vw,2rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-text">
                Built in Nairobi, for the searches that start here.
              </p>
            </InView>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="features-faq-heading">
        <div className="mk-container">
          <SectionHeading eyebrow="Questions" title={<span id="features-faq-heading">Asked before signing up</span>} />
          <div className="max-w-prose-wide">
            <Faq
              label="Questions about the platform"
              items={[
                {
                  q: "Where do the jobs come from?",
                  a: "Company career pages and job boards are read directly — Workday, Oracle HCM, Taleo, and company sites across Kenya and abroad. MboQara does not invent listings, and each role links back to where it was posted.",
                },
                {
                  q: "What does the match score mean?",
                  a: "It compares your skills, experience, location and work-mode preferences with the role, and weights newer postings slightly. The reasons behind the number are shown with it — a score without its reasoning is not worth having.",
                },
                {
                  q: "Can I trust the postings?",
                  a: "Every posting is scored before it reaches you. One the engine holds is kept out of the feed entirely — 359 this week. The reasons are readable, so you can judge the verdict instead of taking it on faith.",
                },
                {
                  q: "What happens to my data?",
                  a: "Your profile and documents are yours. Read the privacy page for the whole story; the short version is that MboQara does not sell your information, and you can delete your account and its data at any time.",
                },
                {
                  q: "Does it work on my phone?",
                  a: "Yes — there is an Android app that keeps applications and documents available offline, and the web app works in any modern browser. Both talk to the same account.",
                },
                {
                  q: "What does it cost?",
                  a: "Free during development. The pricing page states what will carry a price later; nothing is charged today.",
                },
              ]}
            />
          </div>
        </div>
      </section>

      <CtaBand
        title="Your next role is on someone's career page today"
        text="Create a profile once. MboQara reads the boards, tells you what fits, and writes the documents for each role."
        primary={
          <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg">
            Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
          </Link>
        }
        secondary={
          <Link href="/download" className="mk-btn mk-btn--ghost mk-btn--lg">
            <Sparkles className="mk-btn__icon" aria-hidden="true" /> Get the Android app
          </Link>
        }
      />
    </MarketingLayout>
  );
}
