"use client";

import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { MediaSlider, type MediaSlide } from "@/components/marketing/media-slider";
import { PageHero, SectionHeading } from "@/components/marketing/page-hero";
import { Bento, BentoCard } from "@/components/marketing/bento";
import {
  AppFrame,
  DocumentDraftMock,
  OpportunityFeedMock,
  TrackerMock,
  TrustEngineMock,
} from "@/components/marketing/app-frame";
import { StatBand, Callout } from "@/components/marketing/stat-band";
import { VideoEmbed } from "@/components/marketing/video-embed";
import { Faq, CtaBand } from "@/components/marketing/faq";
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
  BadgeCheck,
  WifiOff,
  ScanEye,
  Layers,
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

function IconFromName(name: string) {
  const Comp = ICON_MAP[name] || Rocket;
  return <Comp aria-hidden="true" />;
}

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
    suffix: "",
    label: "Roles a candidate can hold",
    note: "Postings whose stated requirements a candidate in Kenya can actually meet.",
    tone: "signal" as const,
  },
  {
    value: 359,
    suffix: "",
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
      "Company career pages and job boards are read every day — 130 employer boards across Kenya and abroad. A role posted on a company's own site is found the same day, without you opening nine tabs.",
  },
  {
    id: "eligibility",
    icon: "BadgeCheck",
    title: "Eligibility, before you apply",
    body:
      "The posting's own requirements decide it: citizenship, residency, years of experience, licence or degree. If a candidate in Kenya cannot hold the role, it says so — you stop wasting an afternoon on it.",
  },
  {
    id: "trust",
    icon: "ShieldCheck",
    title: "A trust engine between you and the scam",
    body:
      "Salary outliers, brand-new domains, template spam, fees asked up front. Postings it holds never reach the feed, and the reasons stay readable so you can judge the verdict yourself.",
  },
  {
    id: "matching",
    icon: "Target",
    title: "A match score that explains itself",
    body:
      "Your skills, experience, location and work-mode preferences compared with each role, newest roles weighted — with the reasons attached. A score you can argue with is more useful than a score you cannot.",
  },
  {
    id: "documents",
    icon: "FileText",
    title: "Documents drafted for the role",
    body:
      "CV, resume, cover letter or application email, written from your own information and shaped to that specific job. Edit it, then export to PDF or Word.",
  },
  {
    id: "offline",
    icon: "WifiOff",
    title: "Works on the connection you have",
    body:
      "The Android app keeps your applications and documents available offline and syncs when signal returns — because a job search in Nairobi survives a blackout, and so should your data.",
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
  const f = features.data?.length ? features.data : FEATURE_FALLBACK;

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="What MboQara does"
        eyebrowTone="signal"
        title={h?.title ?? "Find real jobs. Apply with confidence."}
        lede={
          h?.description ??
          "MboQara helps students, graduates and professionals find openings worldwide, tells them which ones they can actually hold, drafts the documents for each role, and tracks every application — all in one place."
        }
        actions={
          <>
            <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg">
              Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
            </Link>
            <a href="#product-reel" className="mk-btn mk-btn--ghost mk-btn--lg">
              <ScanEye className="mk-btn__icon" aria-hidden="true" /> See the product
            </a>
          </>
        }
        media={
          <AppFrame url="mboqara.angisoft.co.ke/opportunities" label="The MboQara opportunity feed: ranked roles with match scores and eligibility badges">
            <OpportunityFeedMock />
          </AppFrame>
        }
      />

      <section className="mk-section pt-6" aria-label="Platform figures">
        <div className="mk-container">
          <Reveal>
            <StatBand stats={PLATFORM_STATS} label="What the platform is doing right now" />
          </Reveal>
        </div>
      </section>

      <section className="mk-section" id="product-reel" aria-labelledby="reel-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="Inside the product"
            eyebrowTone="insight"
            title={<span id="reel-heading">What each step actually looks like</span>}
            lede="Discovery, trust, documents and tracking — drawn as the screens themselves, not as stock illustrations."
          />
          <MediaSlider
            slides={PRODUCT_REEL}
            label="How each MboQara feature works"
            interval={6500}
          />
        </div>
      </section>

      <section className="mk-section" aria-labelledby="features-grid-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="The work it does"
            eyebrowTone="signal"
            title={<span id="features-grid-heading">Six things a candidate should not have to do by hand</span>}
            lede="Each of these replaces a morning of browser tabs, a spreadsheet, or a guess."
          />
          {features.loading ? (
            <Bento columns={3}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="mk-panel h-[220px] p-7">
                  <span className="text-text-muted text-[0.9rem]">Loading…</span>
                </div>
              ))}
            </Bento>
          ) : (
            <Bento columns={3}>
              {f.map((feat, i) => (
                <BentoCard
                  key={feat.id}
                  delay={i * 70}
                  icon={IconFromName(feat.icon)}
                  title={feat.title}
                  body={feat.body}
                  tone={i % 3 === 0 ? "signal" : i % 3 === 1 ? "verified" : "insight"}
                  footer={
                    <Link href="/signup" className="mk-btn mk-btn--ghost mk-btn--sm mt-1 w-fit">
                      <ArrowRight className="mk-btn__icon" aria-hidden="true" /> Get started
                    </Link>
                  }
                />
              ))}
            </Bento>
          )}
        </div>
      </section>

      {/* The Scam Shield — the feature the platform exists for, told with the
          numbers and with somebody else's video about the same problem. */}
      <section className="mk-section" aria-labelledby="shield-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="The Scam Shield"
            eyebrowTone="verified"
            title={<span id="shield-heading">Job scams are a Kenyan problem. This is a Kenyan answer.</span>}
            lede="A fake posting does not cost you an application — it costs you the fee you wired for “training materials”, the cheque you deposited, or the identity you attached to it. The trust engine reads every posting before you do."
          />
          <div className="mk-hero-split mk-hero-split--with-media gap-6 lg:gap-10 items-start">
            <Reveal>
              <div className="grid gap-[1.125rem]">
                <Callout
                  icon={<ShieldCheck size={26} aria-hidden="true" />}
                  tone="verified"
                  title="What it checks, in its own words"
                  aside={<span className="mk-mock__pill mk-mock__pill--verified">Live</span>}
                >
                  <p className="m-0">
                    Salary against what the same title pays elsewhere. Domain age. Posting text against known
                    templates. A fee asked before an interview. An interview that only happens over chat. Nothing
                    here is a secret: the pane shows the reasons, so you can disagree with the verdict.
                  </p>
                  <p className="m-0">
                    A held posting never enters the feed — the decision is honoured, not displayed as decoration.
                    Moderators review the queue; candidates simply never see it.
                  </p>
                </Callout>
                <AppFrame url="mboqara.angisoft.co.ke/opportunities/held" label="The trust engine's report on a held posting">
                  <TrustEngineMock />
                </AppFrame>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="grid gap-[1.125rem]">
                <VideoEmbed
                  videoId="BIOiwpt1RAc"
                  title="Job scams: how to spot the red flags"
                  channel="Anchor News"
                />
                <div className="mk-panel grid gap-2.5 p-5 lg:px-5.5">
                  <h3 className="m-0 text-[1rem] font-bold text-text">
                    Watch for these on any posting
                  </h3>
                  <ul className="m-0 pl-[1.1rem] grid gap-2 text-[0.9rem] leading-[1.6] text-text-soft">
                    <li>A fee before an interview — training, equipment, a “background check”.</li>
                    <li>An interview that only ever happens over WhatsApp or Telegram.</li>
                    <li>A pay figure that is out of line for the title and the country.</li>
                    <li>A company whose own career page does not list the role.</li>
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="eligibility-heading">
        <div className="mk-container">
          <div className="mk-hero-split mk-hero-split--with-media gap-6 lg:gap-12 items-center">
            <SectionHeading
              eyebrow="Eligibility"
              eyebrowTone="signal"
              title={<span id="eligibility-heading">Know before you apply whether you can hold the role</span>}
              lede="Most of the indexed catalogue is posted abroad, and much of it carries a residency rule. Reading the requirements takes minutes; MboQara already read them."
            />
            <Reveal delay={100}>
              <div className="grid gap-2.5">
                {[
                  ["Citizenship or residency required", "Checked against the posting's own words"],
                  ["Years of experience", "Matched to what your profile states"],
                  ["Degree, licence or certification", "Named in the posting, named on you"],
                  ["Work mode", "Onsite in Nairobi, hybrid, or remote"],
                ].map(([label, note]) => (
                  <div key={label} className="mk-mock__row">
                    <BadgeCheck size={15} color="var(--mk-verified)" aria-hidden="true" />
                    <span className="mk-mock__row-label">
                      {label}
                      <span className="block text-[0.68rem] text-text-muted">{note}</span>
                    </span>
                    <span className="mk-mock__row-value mk-mock__row-value--verified">Verified</span>
                  </div>
                ))}
                <p className="mt-1.5 mb-0 text-[0.8rem] text-text-muted">
                  Of ~28,000 indexed roles, about 3,400 state requirements a candidate in Kenya can meet.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="features-faq-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="Questions"
            title={<span id="features-faq-heading">Asked before signing up</span>}
          />
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
                  a: "Every posting is scored before it reaches you. One the engine holds is kept out of the feed entirely — roughly 359 this week. The reasons are readable, so you can judge the verdict instead of taking it on faith.",
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
            <Layers className="mk-btn__icon" aria-hidden="true" /> Get the Android app
          </Link>
        }
      />
    </MarketingLayout>
  );
}
