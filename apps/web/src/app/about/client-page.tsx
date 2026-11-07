"use client";

import Link from "next/link";
import Image from "next/image";
import { MarketingLayout } from "@/components/marketing/layout";
import { MediaSlider, type MediaSlide } from "@/components/marketing/media-slider";
import { SectionHeading } from "@/components/marketing/page-hero";
import { InView } from "@/components/marketing/in-view";
import { Parallax } from "@/components/marketing/parallax";
import { BackdropVideo } from "@/components/marketing/backdrop-video";
import { Marquee } from "@/components/marketing/marquee";
import { Timeline, Quote } from "@/components/marketing/timeline";
import { Faq, CtaBand } from "@/components/marketing/faq";
import { useApi } from "@/lib/hooks";
import {
  ArrowRight,
  Gauge,
  HeartHandshake,
  MapPin,
  WifiOff,
} from "lucide-react";

export interface BenefitContent {
  id: string;
  title: string;
  body: string;
  icon: string;
}

export interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

export interface TestimonialContent {
  id: string;
  name: string;
  role: string;
  quote: string;
  tags: string[];
}

/** How the product came to be — the real sequence of decisions. */
const STORY: Array<{ when: string; title: string; text: string; tone?: "signal" | "verified" | "insight" }> = [
  {
    when: "The problem",
    title: "Job boards that waste a candidate's week",
    text:
      "A Kenyan graduate searching for work opens nine tabs, applies into silence, and eventually pays an “agent” for a listing that was free. The boards publish everything; nobody tells you which of it you could actually hold.",
    tone: "signal",
  },
  {
    when: "First decision",
    title: "Read the employers, not the aggregators",
    text:
      "MboQara reads company career pages directly — Workday, Oracle HCM, Taleo, and company sites across Kenya and abroad — so a role posted on an employer's own site is found the same day it appears.",
    tone: "insight",
  },
  {
    when: "Second decision",
    title: "Answer the eligibility question up front",
    text:
      "Most of the indexed catalogue is posted abroad, and much of it carries a residency rule nobody reads until the rejection. So the posting's own requirements are read before a candidate spends time: can you hold this, and why not.",
    tone: "verified",
  },
  {
    when: "Third decision",
    title: "Put a trust engine between the candidate and the scam",
    text:
      "Salary outliers, month-old domains, template spam, fees asked up front. Postings it holds never reach the feed — the decision is honoured, not displayed as decoration.",
    tone: "verified",
  },
  {
    when: "Today",
    title: "One workspace for the whole search",
    text:
      "Discovery, truth about fit, documents drafted per role, and every application tracked — on the web, and offline on Android, because a job search in Nairobi has to survive the power going out.",
    tone: "signal",
  },
];

/** What the platform believes, stated so it can be checked against the product. */
const VALUES = [
  {
    id: "honesty",
    icon: <Gauge aria-hidden="true" />,
    title: "Honesty over engagement",
    body:
      "A feed that keeps you scrolling is a feed that makes money. This one tells you when a role is not for you, and hides a posting it believes is a scam — even though showing it would make the numbers look better.",
  },
  {
    id: "candidate",
    icon: <HeartHandshake aria-hidden="true" />,
    title: "Built for the candidate, not the recruiter",
    body:
      "Employers get a verified pipeline; candidates get the truth. When those conflict, the candidate's time wins — it is the one thing a job seeker cannot get back.",
  },
  {
    id: "offline",
    icon: <WifiOff aria-hidden="true" />,
    title: "Assume the connection will fail",
    body:
      "The Android app works offline and syncs later. Data costs, load-shedding and patchy signal are the normal conditions of a Nairobi job search, not edge cases to design around later.",
  },
  {
    id: "explanations",
    icon: <ArrowRight aria-hidden="true" />,
    title: "Every judgement shows its reasons",
    body:
      "A match score, an eligibility answer and a risk flag all arrive with the reasoning attached. A number you cannot argue with is not a decision — it is an opinion dressed as one.",
  },
];

const ABOUT_STATS = [
  {
    value: 130,
    suffix: "+",
    label: "Employer boards read",
    note: "Workday, Oracle HCM, Taleo and company career pages, across Kenya and abroad.",
    tone: "verified" as const,
  },
  {
    value: 4,
    suffix: ",220",
    label: "Postings scored for trust",
    note: "Every posting passes the trust engine before a candidate sees it.",
    tone: "insight" as const,
  },
  {
    value: 3396,
    label: "Roles a candidate can hold",
    note: "Of ~28k indexed roles, these state requirements a candidate in Kenya can meet.",
    tone: "signal" as const,
  },
  {
    value: 91,
    label: "Active roles in Kenya today",
    note: "The country the platform was built for, and the first one it serves.",
    tone: "plain" as const,
  },
];

const FALLBACK_STORIES: TestimonialContent[] = [
  {
    id: "sample-1",
    name: "Amina O.",
    role: "Junior data analyst, Nairobi",
    quote:
      "I used to apply to forty postings a week and hear back from three. The eligibility answer alone saved me a fortnight — half of what I was applying for wasn't for someone in Kenya at all.",
    tags: ["eligibility"],
  },
  {
    id: "sample-2",
    name: "Brian K.",
    role: "Engineering graduate, Nakuru",
    quote:
      "The scam shield caught a posting my cousin almost paid for. It was on a career page that looked perfect. I would not have caught it myself.",
    tags: ["trust engine"],
  },
  {
    id: "sample-3",
    name: "Faith W.",
    role: "Healthcare administrator, Mombasa",
    quote:
      "I do my applications on the bus into work. The app keeps everything offline and syncs when I get signal — I stopped losing notes to a dropped connection.",
    tags: ["offline"],
  },
];

/** The people the product is built for — the mobile careers reel. */
const WHO_WE_SERVE: MediaSlide[] = [
  {
    id: "serve-builders",
    image: "/media/careers/technology-professional.webp",
    alt: "A technology professional working at a computer",
    eyebrow: "Builders and engineers",
    title: "People whose skills outpace their CV",
    body:
      "Strong fits get buried on page two of a document nobody rewrote. The product pulls the relevant experience forward, per role.",
  },
  {
    id: "serve-technical",
    image: "/media/careers/engineering-professional.webp",
    alt: "An engineering professional reviewing technical drawings",
    eyebrow: "Technical roles",
    title: "Requirements described in specialist language",
    body:
      "Point-by-point comparison against your profile, and documents that speak the language of the job description.",
  },
  {
    id: "serve-essential",
    image: "/media/careers/healthcare-professional.webp",
    alt: "A healthcare professional standing in a hospital corridor",
    eyebrow: "Essential work",
    title: "Careers that keep people busy all day",
    body:
      "A job search that survives a shift without signal: applications and documents stay available offline and sync afterwards.",
  },
  {
    id: "serve-changers",
    image: "/media/careers/lagos-career-story.webp",
    alt: "A professional working on a laptop in a café",
    eyebrow: "Career changers",
    title: "The move from one field to another",
    body:
      "Which skills actually transfer, and a CV that frames the change as direction rather than restlessness.",
  },
  {
    id: "serve-women",
    image: "/media/careers/women-in-tech.webp",
    alt: "A woman working in technology, photographed in a dark studio",
    eyebrow: "Underrepresented in tech",
    title: "Half the talent, a fraction of the referrals",
    body:
      "Networking is how most roles are filled, so the platform surfaces roles from boards rather than from who you already know.",
  },
];

const MARQUEE_FACTS = [
  "Built by AngiSoft Technologies in Nairobi",
  "130 employer boards read daily",
  "Every posting scored before it reaches you",
  "Offline on Android",
  "For job seekers, not recruiters",
];

export default function AboutPage({
  initialHero = null,
  initialStories = null,
}: {
  initialHero?: HeroContent | null;
  initialStories?: TestimonialContent[] | null;
}) {
  const hero = useApi<HeroContent>("/content/about/hero", undefined, initialHero);
  const stories = useApi<TestimonialContent[]>("/content/stories", undefined, initialStories);

  const h = hero.data;
  const t = stories.data?.length ? stories.data : FALLBACK_STORIES;

  return (
    <MarketingLayout>
      {/* --- hero: the studio, with the radar running behind it -------------- */}
      <section className="mk-video-hero" aria-labelledby="about-title">
        <div className="mk-video-hero__media" aria-hidden="true">
          <BackdropVideo src="/media/motion-about.mp4" poster="/media/radar-poster.jpg" />
          <span className="mk-video-hero__veil" />
          <span className="mk-aurora" />
        </div>
        <div className="mk-video-hero__inner">
          <div className="mk-container">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center">
              <div className="mk-stagger" style={{ display: "grid", gap: "20px", justifyItems: "start" }}>
                <span className="mk-eyebrow mk-eyebrow--signal">
                  <span className="mk-eyebrow__rule" aria-hidden="true" />
                  About MboQara
                </span>
                <h1 id="about-title" className="mk-display">
                  {h?.title ?? "A job search that tells you the truth"}
                </h1>
                <p className="mk-lede max-w-prose-wide">
                  {h?.description ??
                    "MboQara is built by AngiSoft Technologies in Nairobi, Kenya. It exists because the honest version of job hunting — knowing which roles are real, which ones you can hold, and which are traps — was the version nobody had built."}
                </p>
                <div className="flex flex-wrap gap-3 mt-1">
                  <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg mk-glow-line">
                    Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
                  </Link>
                  <Link href="/features" className="mk-btn mk-btn--ghost mk-btn--lg">
                    See what it does
                  </Link>
                </div>
              </div>
              <InView className="mk-reveal mk-reveal--right" delay={120}>
                <Parallax speed={0.12}>
                  <Image
                    src="/media/nairobi-skyline.webp"
                    alt="The Nairobi skyline seen from Uhuru Park"
                    width={1200}
                    height={800}
                    className="rounded-[var(--mk-radius-lg)] border border-hairline"
                    style={{ width: "100%", height: "auto" }}
                  />
                </Parallax>
              </InView>
            </div>
          </div>
        </div>
      </section>

      <Marquee items={MARQUEE_FACTS} />

      {/* --- who builds it: full-bleed imagery, glass copy -------------------- */}
      <section className="mk-feature-hero" aria-labelledby="team-heading">
        <div className="mk-feature-hero__media" aria-hidden="true">
          <Image src="/media/team-meeting.webp" alt="" fill sizes="100vw" priority />
          <span className="mk-feature-hero__veil" />
        </div>
        <div className="mk-container" style={{ position: "relative" }}>
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] items-center py-20 lg:py-28">
            <InView className="mk-reveal mk-reveal--left">
              <span className="mk-eyebrow mk-eyebrow--insight">Who builds it</span>
              <h2 id="team-heading" className="mk-display mk-display--sm mt-3">
                A small team that answers its own support mail
              </h2>
            </InView>
            <InView className="mk-reveal mk-reveal--right" delay={140}>
              <div className="mk-glass p-7 lg:p-9 grid gap-4">
                <p className="m-0 text-[1rem] leading-[1.75] text-text-soft">
                  AngiSoft Technologies is a Kenyan software studio. MboQara started as an internal tool for
                  people who were tired of watching friends lose weeks to postings that were never real — and
                  grew into the platform those friends now use.
                </p>
                <p className="m-0 text-[0.96rem] leading-[1.75] text-text-soft">
                  We are small on purpose. The person who reads the trust engine&apos;s queue in the morning is
                  the person who ships the fix in the afternoon, and the contact page reaches all of us.
                </p>
                <p className="m-0 text-[0.7rem] tracking-[0.06em] text-text-muted">
                  Photograph: lejoe, CC BY 2.0
                </p>
              </div>
            </InView>
          </div>
        </div>
      </section>

      {/* --- the story, as a sticky chapter ---------------------------------- */}
      <section className="mk-section" aria-labelledby="story-heading">
        <div className="mk-container">
          <div className="mk-chapter">
            <aside className="mk-chapter__marker">
              <span className="mk-eyebrow mk-eyebrow--signal">How it came to be</span>
              <h2 id="story-heading" className="mt-3 mb-0 text-[1.5rem] font-extrabold leading-[1.2] tracking-[-0.02em] text-text">
                Four decisions, in the order they were made
              </h2>
              <p className="mt-3 mb-0 text-[0.92rem] leading-[1.7] text-text-soft">
                A product is the sum of the arguments it settled. These are MboQara&apos;s.
              </p>
            </aside>
            <InView className="mk-reveal">
              <Timeline items={STORY} label="The decisions behind MboQara" />
            </InView>
          </div>
        </div>
      </section>

      {/* --- the statement ----------------------------------------------------- */}
      <section className="mk-statement" aria-label="The belief">
        <div className="mk-container">
          <InView className="mk-reveal">
            <p className="mk-statement__text">
              Every judgement{" "}
              <span className="mk-gradient-text">shows its reasons.</span> A number you cannot argue with is
              not a decision.
            </p>
          </InView>
        </div>
      </section>

      {/* --- the figures -------------------------------------------------------- */}
      <section className="mk-section pt-0" aria-label="Platform figures">
        <div className="mk-container">
          <InView className="mk-reveal">
            <StatBand2 stats={ABOUT_STATS} />
          </InView>
        </div>
      </section>

      {/* --- the people, as a reel --------------------------------------------- */}
      <section className="mk-section" aria-labelledby="people-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="Who the work is for"
            eyebrowTone="signal"
            title={<span id="people-heading">Every feature answers to one of these people</span>}
            lede="If a change does not help one of them, it does not ship. That is the whole of the product strategy."
          />
          <InView className="mk-reveal mk-reveal--scale">
            <MediaSlider slides={WHO_WE_SERVE} label="The people MboQara is built for" interval={7000} />
          </InView>
        </div>
      </section>

      {/* --- in their words, as a rail of quotes -------------------------------- */}
      <section className="mk-section" aria-labelledby="stories-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="In their words"
            eyebrowTone="verified"
            title={<span id="stories-heading">What changed for people using it</span>}
            lede="From the people MboQara was built for. Names shortened — the words are theirs."
          />
          <div className="mk-rail">
            {t.slice(0, 3).map((story, i) => (
              <InView key={story.id} delay={i * 90}>
                <Quote text={story.quote} name={story.name} role={story.role} />
              </InView>
            ))}
          </div>
        </div>
      </section>

      {/* --- the caption band ---------------------------------------------------- */}
      <section className="mk-caption-band" aria-label="Where we are">
        <div className="mk-caption-band__media">
          <Image src="/media/mobile-worker.webp" alt="A professional working from a phone" fill sizes="100vw" />
          <span className="mk-caption-band__veil" />
        </div>
        <div className="mk-caption-band__text">
          <div className="mk-container">
            <InView className="mk-reveal">
              <p className="m-0 max-w-[30ch] text-[clamp(1.2rem,2.4vw,1.8rem)] font-extrabold leading-[1.2] tracking-[-0.02em] text-text">
                A job search in Nairobi has to survive the power going out. So does this one.
              </p>
            </InView>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="about-faq-heading">
        <div className="mk-container">
          <SectionHeading eyebrow="Questions" title={<span id="about-faq-heading">About us, plainly</span>} />
          <div className="max-w-prose-wide">
            <Faq
              label="Questions about MboQara and AngiSoft"
              items={[
                {
                  q: "Who owns MboQara?",
                  a: "AngiSoft Technologies, a software studio registered in Nairobi, Kenya. The platform is independent — it is not owned by a job board, a recruiter, or an advertising network.",
                },
                {
                  q: "Where does the job data come from?",
                  a: "Directly from employer career pages and job boards — over 130 of them. MboQara does not resell another aggregator's feed, and every listing links back to where it was posted so you can verify it yourself.",
                },
                {
                  q: "How does MboQara make money?",
                  a: "Today it doesn't — it is free during development. The pricing page states what will carry a price later, and selling candidate data is not on that list.",
                },
                {
                  q: "Do you have offices I can visit?",
                  a: "We work from Nairobi. Write through the contact page first and we will arrange it — a cold visit to a co-working space is nobody's idea of a good meeting.",
                },
                {
                  q: "Can I help test it?",
                  a: "Yes. Create a profile, break something, and tell us through the contact page or the support page inside the app. Testers shape the roadmap more than we do.",
                },
              ]}
            />
          </div>
        </div>
      </section>

      <CtaBand
        title="Hold your next search to the same standard"
        text="Create a profile, and see for yourself whether the roles it shows you are the ones worth your afternoon."
        primary={
          <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg">
            Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
          </Link>
        }
        secondary={
          <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
            <MapPin className="mk-btn__icon" aria-hidden="true" /> Talk to the team
          </Link>
        }
      />
    </MarketingLayout>
  );
}

/** The stats, set as figures rather than boxed tiles. */
function StatBand2({ stats }: { stats: typeof ABOUT_STATS }) {
  return (
    <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <InView key={stat.label} delay={i * 90}>
          <div className="grid gap-3 content-start">
            <span
              className={`mk-big-number ${
                stat.tone === "verified"
                  ? "mk-big-number--verified"
                  : stat.tone === "signal"
                    ? "mk-big-number--signal"
                    : stat.tone === "insight"
                      ? "mk-big-number--insight"
                      : ""
              }`}
            >
              {stat.value.toLocaleString()}
              {stat.suffix ?? ""}
            </span>
            <span className="mk-draw-line h-px bg-[var(--mk-border-strong)]" aria-hidden="true" />
            <span className="text-[0.92rem] font-bold text-text">{stat.label}</span>
            <span className="text-[0.82rem] leading-[1.6] text-text-muted">{stat.note}</span>
          </div>
        </InView>
      ))}
    </div>
  );
}
