import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { PageHero, SectionHeading } from "@/components/marketing/page-hero";
import { MediaSlider, type MediaSlide } from "@/components/marketing/media-slider";
import { Bento, BentoCard } from "@/components/marketing/bento";
import { EditorialPhoto } from "@/components/marketing/editorial-photo";
import { FactList } from "@/components/marketing/timeline";
import { Faq, CtaBand } from "@/components/marketing/faq";
import { ArrowRight, Coffee, Cpu, Mail, MapPin, Users } from "lucide-react";
import { pageMetadata, SITE } from "@/lib/seo";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Careers at AngiSoft — build the honest job search",
  description:
    "AngiSoft Technologies is a small Nairobi software studio building MboQara. How we work, what we hire for, and how to send a speculative application.",
  path: "/careers",
  keywords: ["AngiSoft careers", "software jobs Nairobi", "work at AngiSoft", "Kenya tech jobs"],
});

/** The people the product is built for — the brief every hire works to. */
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

const HOW_WE_WORK = [
  {
    id: "small",
    icon: <Users aria-hidden="true" />,
    title: "Small on purpose",
    body:
      "A team small enough that the person who triages the trust queue in the morning ships the fix in the afternoon. Nobody here is a ticket number.",
  },
  {
    id: "candidates",
    icon: <MapPin aria-hidden="true" />,
    title: "The user is a candidate, in Kenya",
    body:
      "Data costs, load-shedding and a market that publishes roles abroad are the design constraints — not edge cases to handle after launch.",
  },
  {
    id: "build",
    icon: <Cpu aria-hidden="true" />,
    title: "Build where the work is",
    body:
      "Nairobi-based, remote-friendly. What matters is the work and the timezone overlap, not the chair you sit in.",
  },
  {
    id: "support",
    icon: <Coffee aria-hidden="true" />,
    title: "Everyone reads support mail",
    body:
      "Including the people who wrote the code. It keeps the product honest — you cannot ignore a bug you have read about in someone's words.",
  },
];

export default function CareersPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Careers at AngiSoft Technologies",
            description:
              "How the small Nairobi studio behind MboQara works, what it hires for, and how to send a speculative application.",
            path: "/careers",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Careers", path: "/careers" },
          ]),
        ]}
      />
      <MarketingLayout>
        <PageHero
          eyebrow="Careers at AngiSoft"
          eyebrowTone="signal"
          title="Build the honest job search with us"
          lede="AngiSoft Technologies is the small Nairobi studio behind MboQara. We hire rarely and carefully — and we read every speculative application, because that is how the last hire happened."
          actions={
            <>
              <a href={`mailto:${SITE.email}?subject=Speculative%20application`} className="mk-btn mk-btn--signal mk-btn--lg">
                <Mail className="mk-btn__icon" aria-hidden="true" /> Send a speculative application
              </a>
              <Link href="/about" className="mk-btn mk-btn--ghost mk-btn--lg">
                Read the story first
              </Link>
            </>
          }
          media={
            <EditorialPhoto
              src="/media/team-meeting.webp"
              alt="A small team working together around a table with laptops"
              caption="A studio small enough to know everyone's name."
              credit="lejoe, CC BY 2.0"
              height={440}
            />
          }
        />

        <section className="mk-section" aria-labelledby="open-roles-heading">
          <div className="mk-container">
            <div className="mk-panel grid gap-5 p-[clamp(26px,4vw,44px)]">
              <span className="mk-eyebrow mk-eyebrow--signal">
                <span className="mk-eyebrow__rule" aria-hidden="true" />
                Open roles
              </span>
              <h2 id="open-roles-heading" className="mk-display mk-display--sm" style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}>
                No advertised roles right now
              </h2>
              <p style={{ margin: 0, maxWidth: "min(100%, 60rem)", fontSize: "1rem", lineHeight: 1.7, color: "var(--mk-text-soft)" }}>
                We would rather say that plainly than keep a listings page warm with roles that do not exist.
                When something opens, it is posted here and in the feed — and it is usually filled by
                someone who wrote to us first.
              </p>
              <p style={{ margin: 0, maxWidth: "min(100%, 60rem)", fontSize: "0.98rem", lineHeight: 1.7, color: "var(--mk-text-soft)" }}>
                Send a speculative application anyway: what you have built, what you would want to work on
                here, and the kind of work you want more of. We keep them and read them when a role opens —
                the last engineer we hired arrived that way.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={`mailto:${SITE.email}?subject=Speculative%20application`} className="mk-btn mk-btn--signal">
                  <Mail className="mk-btn__icon" aria-hidden="true" /> Write to us
                </a>
                <Link href="/contact" className="mk-btn mk-btn--ghost">
                  Ask a question instead
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="hiring-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="How hiring works here"
              eyebrowTone="verified"
              title={<span id="hiring-heading">No take-home tests. No five-round gauntlet.</span>}
              lede="A process is a promise about how a company treats people. This one is short on purpose."
            />
            <FactList
              label="The hiring process"
              items={[
                { term: "1. What you send", detail: "Something you built, and a note on why" },
                { term: "2. First conversation", detail: "45 minutes, no whiteboard" },
                { term: "3. A real problem", detail: "A paid piece of work on the actual codebase" },
                { term: "4. The team", detail: "Everyone you would work with, in one room" },
                { term: "5. An answer", detail: "Either way, within a week — with reasons" },
              ]}
            />
            <p className="mt-5 mb-0 max-w-prose-wide text-[0.92rem] leading-[1.65] text-text-muted">
              Take-home tests are unpaid work disguised as diligence; five rounds are a way of never deciding.
              We pay for the piece of work, we tell you what we decided, and we tell you why.
            </p>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="values-work-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="How we work"
              eyebrowTone="insight"
              title={<span id="values-work-heading">Four things that are true of working here</span>}
            />
            <Bento columns={2}>
              {HOW_WE_WORK.map((item, i) => (
                <BentoCard
                  key={item.id}
                  icon={item.icon}
                  title={item.title}
                  body={item.body}
                  tone={i % 2 === 0 ? "insight" : "signal"}
                  delay={i * 80}
                />
              ))}
            </Bento>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="who-we-serve-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="Who the work is for"
              eyebrowTone="signal"
              title={<span id="who-we-serve-heading">Every feature answers to one of these people</span>}
              lede="If a change does not help one of them, it does not ship. That is the whole of the product strategy."
            />
            <MediaSlider slides={WHO_WE_SERVE} label="The people MboQara is built for" interval={7000} />
          </div>
        </section>

        <section className="mk-section" aria-labelledby="careers-faq-heading">
          <div className="mk-container">
            <SectionHeading eyebrow="Questions" title={<span id="careers-faq-heading">Before you write</span>} />
            <div className="max-w-prose-wide">
              <Faq
                label="Questions about working at AngiSoft"
                items={[
                  {
                    q: "What roles do you usually hire for?",
                    a: "Engineering, data and the odd bit of design — the disciplines the platform is made of. When a role opens it is posted here, but most hiring has started with someone writing first.",
                  },
                  {
                    q: "Do you take interns?",
                    a: "Yes, and gladly, when there is a project that deserves a real contribution rather than fetching coffee. Say what you want to learn and we will tell you honestly whether we can teach it this quarter.",
                  },
                  {
                    q: "Is the role remote?",
                    a: "Remote-friendly with Nairobi hours. Some overlap matters when you are shipping a product used by people in the same timezone.",
                  },
                  {
                    q: "What is the pay like?",
                    a: "We state a range in the posting when there is a posting, and we say it in the first conversation when there is not. Nobody should have to guess.",
                  },
                  {
                    q: "I have never worked in software. Should I still write?",
                    a: "If you have built something — a shop's inventory sheet that works, a tool for your matatu crew, anything — write. Evidence of care beats credentials here.",
                  },
                ]}
              />
            </div>
          </div>
        </section>

        <CtaBand
          title="Write before the posting exists"
          text="One paragraph on what you have built and what you want to work on. That is the whole application."
          primary={
            <a href={`mailto:${SITE.email}?subject=Speculative%20application`} className="mk-btn mk-btn--signal mk-btn--lg">
              <Mail className="mk-btn__icon" aria-hidden="true" /> Send it
            </a>
          }
          secondary={
            <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
              Hiring, not applying? <ArrowRight className="mk-btn__icon" aria-hidden="true" />
            </Link>
          }
        />
      </MarketingLayout>
    </>
  );
}
