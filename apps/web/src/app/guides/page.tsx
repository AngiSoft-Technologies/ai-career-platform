import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { PageHero, SectionHeading } from "@/components/marketing/page-hero";
import { VideoEmbed } from "@/components/marketing/video-embed";
import { StatBand } from "@/components/marketing/stat-band";
import { Faq, CtaBand } from "@/components/marketing/faq";
import { ArrowRight, BookOpen, PlayCircle, ShieldAlert, Sparkles } from "lucide-react";
import { pageMetadata, SITE } from "@/lib/seo";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Guides — job hunting, CVs, interviews and spotting scams",
  description:
    "Practical guides and videos for the job search itself: spotting job scams, tailoring a CV per role, networking without the cringe, and using AI honestly — from people who do it for a living.",
  path: "/guides",
  keywords: ["job hunting tips", "job scam awareness", "CV tailoring", "interview preparation Kenya", "job search guides"],
});

/** Videos worth the candidate's time, with the channel that made them. */
const VIDEOS = [
  {
    id: "BIOiwpt1RAc",
    title: "Job scams: how to spot the red flags",
    channel: "Anchor News",
    note: "Street-level reporting on job scams in Nigeria — fees for interviews, addresses that do not exist. The same pattern the trust engine looks for, in people's words.",
  },
  {
    id: "RcvJaDFdaIA",
    title: "How I'd find a job in 2025",
    channel: "Lee Harding",
    note: "A short, modern playbook: fix the profile before the boards, use weak ties, write for impact rather than duties, and reach out speculatively.",
  },
  {
    id: "Q41b3OBcE0c",
    title: "Networking on LinkedIn without being annoying",
    channel: "Aaron McGoff",
    note: "How to ask for help in a way that gets answered — the part of the search most candidates skip and most hires come from.",
  },
  {
    id: "Iw_G_j1o6fQ",
    title: "How to use AI for your job search",
    channel: "Google Career Certificates",
    note: "Using AI honestly: transferable skills, a career identity statement, a tailored CV, and a search plan — with the prompts to do it.",
  },
];

const GUIDES = [
  {
    id: "read-a-posting",
    icon: <ShieldAlert aria-hidden="true" />,
    title: "How to read a posting before you trust it",
    minutes: 6,
    body:
      "Five checks, in the order that wastes the least time: does the company's own careers page list the role; does the pay make sense for the title and country; is the interview only over chat; is a fee asked anywhere before an offer; and how old is the domain itself. Any two of those failing is enough to stop — MboQara runs the same checks and shows its work.",
  },
  {
    id: "eligibility",
    icon: <BookOpen aria-hidden="true" />,
    title: "The eligibility question, answered first",
    minutes: 4,
    body:
      "Most postings in this market are published abroad, and a large share carry a residency rule buried near the bottom. Read the requirements section before the job description: citizenship, experience, degree, licence. If you cannot hold it, the posting is not an opportunity — it is an afternoon.",
  },
  {
    id: "cv-per-role",
    icon: <Sparkles aria-hidden="true" />,
    title: "One CV per role, written in their language",
    minutes: 8,
    body:
      "Take the requirements from the posting and put your matching evidence next to each one. Cut anything that does not argue for this specific job. Name the tools the employer named, exactly as they named them — the screening software and the human both match on words, not on vibes.",
  },
  {
    id: "networking",
    icon: <PlayCircle aria-hidden="true" />,
    title: "Networking when you hate networking",
    minutes: 5,
    body:
      "You are not asking for a job. You are telling people what you are looking for, once, clearly, so they can recognise it when it passes. One message, one specific ask, no guilt. The weak ties — the classmate, the former colleague, the cousin's friend — see opportunities your feed never will.",
  },
  {
    id: "follow-up",
    icon: <BookOpen aria-hidden="true" />,
    title: "Following up without pestering",
    minutes: 4,
    body:
      "One follow-up, five to seven days after applying, three sentences: what you applied for, one line on why you fit, and a question. Then wait. A second follow-up is fine a week later; a third is a rejection you are writing yourself. Track the dates so you know which is which.",
  },
  {
    id: "ai-honestly",
    icon: <Sparkles aria-hidden="true" />,
    title: "Using AI in your search, honestly",
    minutes: 7,
    body:
      "AI is good at turning your messy history into the shape a posting asks for, and bad at inventing experience you do not have — which is exactly what an interview will expose. Use it to draft and to tighten. Never to claim. The story you tell in the room has to be the one on the page.",
  },
];

const GUIDE_STATS = [
  {
    value: 359,
    label: "Scam postings held this week",
    note: "What the trust engine caught, so candidates never saw them. Your own five checks do the same job.",
    tone: "verified" as const,
  },
  {
    value: 3396,
    label: "Roles a candidate can hold",
    note: "Of ~28k indexed roles. The eligibility question saves the applications that were never real.",
    tone: "signal" as const,
  },
  {
    value: 130,
    suffix: "+",
    label: "Boards worth knowing",
    note: "Company career pages first — most employers post there before anywhere else, and some only there.",
    tone: "insight" as const,
  },
  {
    value: 91,
    label: "Active roles in Kenya today",
    note: "The local market moves too. Check the country filter before assuming nothing is hiring.",
    tone: "plain" as const,
  },
];

export default function GuidesPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Guides — MboQara",
            description:
              "Videos and written guides for the job search itself: spotting scams, tailoring documents, networking, following up, and using AI honestly.",
            path: "/guides",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
          ]),
        ]}
      />
      <MarketingLayout>
        <PageHero
          eyebrow="Guides"
          eyebrowTone="insight"
          title="The search itself, explained properly"
          lede="Videos from people who do this for a living, and written guides that take minutes. None of it is about MboQara — it is about how to look for work in this market without losing a fortnight to a fake posting."
          actions={
            <>
              <a href="#videos" className="mk-btn mk-btn--signal mk-btn--lg">
                <PlayCircle className="mk-btn__icon" aria-hidden="true" /> Watch the videos
              </a>
              <a href="#written" className="mk-btn mk-btn--ghost mk-btn--lg">
                <BookOpen className="mk-btn__icon" aria-hidden="true" /> Read the guides
              </a>
            </>
          }
        />

        <section className="mk-section pt-6" aria-label="Figures behind the guides">
          <div className="mk-container">
            <Reveal>
              <StatBand stats={GUIDE_STATS} label="The numbers the guides are built around" />
            </Reveal>
          </div>
        </section>

        <section className="mk-section" id="videos" aria-labelledby="videos-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="Watch"
              eyebrowTone="signal"
              title={<span id="videos-heading">Four videos worth your evening</span>}
              lede="Each one loads nothing from YouTube until you press play — the page stays fast and private until you choose otherwise."
            />
            <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
              {VIDEOS.map((video, i) => (
                <Reveal key={video.id} delay={i * 80}>
                  <div className="grid gap-3">
                    <VideoEmbed videoId={video.id} title={video.title} channel={video.channel} />
                    <p className="m-0 text-[0.88rem] leading-[1.6] text-text-muted">
                      {video.note}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section" id="written" aria-labelledby="written-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="Read"
              eyebrowTone="verified"
              title={<span id="written-heading">Six guides, each a few minutes</span>}
              lede="Written for this market. Short, specific, and checkable against your own experience."
            />
            <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
              {GUIDES.map((guide, i) => (
                <Reveal key={guide.id} delay={i * 60}>
                  <article className="mk-panel grid content-start gap-3 h-full p-6 lg:px-6.5">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        color: i % 2 === 0 ? "var(--mk-signal)" : "var(--mk-verified)",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid var(--mk-border)",
                      }}
                    >
                      {guide.icon}
                    </span>
                    <h3 className="m-0 text-[1.05rem] font-bold tracking-[-0.01em] text-text">
                      {guide.title}
                    </h3>
                    <p className="m-0 text-[0.9rem] leading-[1.65] text-text-soft">
                      {guide.body}
                    </p>
                    <p className="mk-numeral" style={{ margin: 0, fontSize: "0.74rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--mk-text-muted)" }}>
                      {guide.minutes} min read
                    </p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="guides-faq-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="Questions"
              title={<span id="guides-faq-heading">About the search, not the product</span>}
            />
            <div className="max-w-prose-wide">
              <Faq
                label="Questions about job hunting"
                items={[
                  {
                    q: "I have applied to a hundred postings and heard nothing. What is wrong?",
                    a: "Usually the applications, not the market. One tailored document beats ten generic ones: take the requirements from the posting and put your evidence next to each. If you are applying to roles you cannot hold — residency, experience — the count of applications will never fix it.",
                  },
                  {
                    q: "Is it worth using AI to write my CV?",
                    a: "To draft and tighten, yes. To claim experience you do not have, no — an interview will find it, and being caught costs more than a thin CV ever will. Keep the final document in your own words.",
                  },
                  {
                    q: "How do I know a posting is a scam?",
                    a: "Start with the company's own careers page: if the role is not listed there, treat it as unverified. Then check the pay against the market, and be suspicious of any fee before an offer, or an interview that only happens over chat. The first video on this page covers the pattern in detail.",
                  },
                  {
                    q: "Should I follow up after applying?",
                    a: "Once, five to seven days later, briefly and specifically. Then wait. Track what you sent and when, so a second follow-up is a decision rather than a fade.",
                  },
                  {
                    q: "Nothing is hiring in my field right now. What now?",
                    a: "Widen the geography before you widen the ambition — most of the indexed catalogue is remote-friendly or posted abroad. Then use the waiting time to fix the things that are always broken: the CV, the portfolio, the five people who would take your call.",
                  },
                ]}
              />
            </div>
          </div>
        </section>

        <CtaBand
          title="Put the guides to work on a feed you can trust"
          text="Create a profile and MboQara reads the boards, tells you which roles you can hold, and keeps the scams out of the way."
          primary={
            <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg">
              Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
            </Link>
          }
          secondary={
            <Link href="/features" className="mk-btn mk-btn--ghost mk-btn--lg">
              See what it does
            </Link>
          }
        />
      </MarketingLayout>
    </>
  );
}
