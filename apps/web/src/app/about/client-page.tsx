"use client";

import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { MediaSlider, type MediaSlide } from "@/components/marketing/media-slider";
import { PageHero, SectionHeading } from "@/components/marketing/page-hero";
import { Bento, BentoCard } from "@/components/marketing/bento";
import { StatBand } from "@/components/marketing/stat-band";
import { EditorialBand, EditorialPhoto } from "@/components/marketing/editorial-photo";
import { Timeline, Quote } from "@/components/marketing/timeline";
import { Faq, CtaBand } from "@/components/marketing/faq";
import { useApi } from "@/lib/hooks";
import {
  ArrowRight,
  ShieldCheck,
  Target,
  Users,
  MapPin,
  WifiOff,
  Gauge,
  HeartHandshake,
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

export interface ComparisonColumn {
  id: string;
  label: string;
  items: string[];
  check: boolean;
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
    icon: <ShieldCheck aria-hidden="true" />,
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
    icon: <Gauge aria-hidden="true" />,
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

export default function AboutPage({
  initialHero = null,
  initialBenefits = null,
  initialStories = null,
}: {
  initialHero?: HeroContent | null;
  initialBenefits?: BenefitContent[] | null;
  initialStories?: TestimonialContent[] | null;
}) {
  const hero = useApi<HeroContent>("/content/about/hero", undefined, initialHero);
  const stories = useApi<TestimonialContent[]>("/content/stories", undefined, initialStories);

  const h = hero.data;
  const t = stories.data?.length ? stories.data : FALLBACK_STORIES;

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="About MboQara"
        eyebrowTone="signal"
        title={h?.title ?? "A job search that tells you the truth"}
        lede={
          h?.description ??
          "MboQara is built by AngiSoft Technologies in Nairobi, Kenya. It exists because the honest version of job hunting — knowing which roles are real, which ones you can hold, and which are traps — was the version nobody had built."
        }
        actions={
          <>
            <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg">
              Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
            </Link>
            <Link href="/features" className="mk-btn mk-btn--ghost mk-btn--lg">
              See what it does
            </Link>
          </>
        }
        media={
          <EditorialPhoto
            src="/media/nairobi-skyline.webp"
            alt="The Nairobi skyline seen from Uhuru Park, with office towers against a wide sky"
            caption="Built in Nairobi, for the searches that start here."
            credit="Jorge Lascar, CC BY 2.0"
            height={460}
            priority
          />
        }
      />

      <EditorialBand
        image="/media/team-meeting.webp"
        alt="A small software team working together around a table with laptops"
        imageCredit="lejoe, CC BY 2.0"
        eyebrow="Who builds it"
        eyebrowTone="insight"
        title="A small team that answers its own support mail"
      >
        <p>
          AngiSoft Technologies is a Kenyan software studio. MboQara started as an internal tool for people who
          were tired of watching friends lose weeks to postings that were never real — and grew into the
          platform those friends now use.
        </p>
        <p>
          We are small on purpose. The person who reads the trust engine's queue in the morning is the person
          who ships the fix in the afternoon, and the contact page reaches all of us.
        </p>
      </EditorialBand>

      <section className="mk-section" aria-labelledby="story-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="How it came to be"
            eyebrowTone="signal"
            title={<span id="story-heading">Four decisions, in the order they were made</span>}
            lede="A product is the sum of the arguments it settled. These are MboQara's."
          />
          <Timeline items={STORY} label="The decisions behind MboQara" />
        </div>
      </section>

      <section className="mk-section" aria-labelledby="values-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="What we believe"
            eyebrowTone="verified"
            title={<span id="values-heading">Principles you can hold the product to</span>}
            lede="These are not aspirations. Each one is visible somewhere in the product, or it is not true."
          />
          <Bento columns={2}>
            {VALUES.map((value, i) => (
              <BentoCard
                key={value.id}
                icon={value.icon}
                title={value.title}
                body={value.body}
                tone={i % 2 === 0 ? "verified" : "insight"}
                delay={i * 80}
              />
            ))}
          </Bento>
        </div>
      </section>

      <section className="mk-section pt-2" aria-label="Platform figures">
        <div className="mk-container">
          <Reveal>
            <StatBand stats={ABOUT_STATS} label="The platform in numbers" />
          </Reveal>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="stories-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="In their words"
            eyebrowTone="insight"
            title={<span id="stories-heading">What changed for people using it</span>}
            lede="From the people MboQara was built for. Names shortened — the words are theirs."
          />
          <div className="grid gap-[1.125rem] grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
            {t.slice(0, 3).map((story, i) => (
              <Reveal key={story.id} delay={i * 90}>
                <Quote text={story.quote} name={story.name} role={story.role} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="about-faq-heading">
        <div className="mk-container">
          <SectionHeading
            eyebrow="Questions"
            title={<span id="about-faq-heading">About us, plainly</span>}
          />
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
