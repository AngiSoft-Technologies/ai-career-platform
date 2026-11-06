import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { PageHero, SectionHeading } from "@/components/marketing/page-hero";
import { ContactForm } from "@/components/marketing/contact-form";
import { EditorialPhoto } from "@/components/marketing/editorial-photo";
import { FactList } from "@/components/marketing/timeline";
import { Bento, BentoCard } from "@/components/marketing/bento";
import { VideoEmbed } from "@/components/marketing/video-embed";
import { CtaBand } from "@/components/marketing/faq";
import { Mail, MapPin, Clock, Globe, ArrowRight, Download, MessageCircleQuestion, BookOpen, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { pageMetadata, SITE } from "@/lib/seo";
import { JsonLd, breadcrumbSchema, organizationSchema, webPageSchema } from "@/components/seo/json-ld";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Contact MboQara — job search, CV and application tracker support",
  description:
    "Talk to the MboQara team in Nairobi, Kenya. Questions about job search, matching, CVs and cover letters, application tracking, privacy or the Android app — we reply.",
  path: "/contact",
  keywords: ["contact MboQara", "MboQara support", "MboQara help", "job app support Kenya", "career platform contact"],
});

/** What we promise on response time, because a contact page without one is a wish. */
const RESPONSES = [
  { term: "Support and account help", detail: "Within one working day" },
  { term: "Report a suspicious posting", detail: "Same day — trust queue is watched continuously" },
  { term: "Privacy and data requests", detail: "Within 30 days, by law; usually far sooner" },
  { term: "Employers and partnerships", detail: "Within three working days" },
  { term: "Press", detail: "Within two working days" },
];

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "Contact MboQara",
            description:
              "Talk to the MboQara team in Nairobi, Kenya about job search, matching, documents, application tracking and privacy.",
            path: "/contact",
            type: "ContactPage",
          }),
          organizationSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Contact", path: "/contact" },
          ]),
        ]}
      />
      <MarketingLayout>
        <PageHero
          eyebrow="Contact"
          eyebrowTone="signal"
          title="Talk to the people who built it"
          lede="Questions about the search, the matching, a document that came out wrong, or a posting you think we should check — write to us. A small team reads everything."
          actions={
            <>
              <a href={`mailto:${SITE.email}`} className="mk-btn mk-btn--signal mk-btn--lg">
                <Mail className="mk-btn__icon" aria-hidden="true" /> {SITE.email}
              </a>
              <Link href="/faq" className="mk-btn mk-btn--ghost mk-btn--lg">
                <MessageCircleQuestion className="mk-btn__icon" aria-hidden="true" /> Read the FAQ first
              </Link>
            </>
          }
          media={
            <EditorialPhoto
              src="/media/woman-laptop.webp"
              alt="A woman working at a laptop, writing"
              caption="Every message reaches the team, not a ticket queue."
              credit="Rawpixel, CC0"
              height={420}
            />
          }
        />

        <section className="mk-section" style={{ paddingTop: "8px" }} aria-labelledby="form-heading">
          <div className="mk-container">
            <div className="mk-hero-split mk-hero-split--with-media" style={{ gap: "clamp(24px, 3vw, 44px)", alignItems: "start" }}>
              <Reveal>
                <div className="mk-panel" style={{ padding: "clamp(22px, 3vw, 34px)" }}>
                  <h2 id="form-heading" style={{ margin: "0 0 6px", fontSize: "1.4rem", fontWeight: 750, letterSpacing: "-0.02em", color: "var(--mk-text)" }}>
                    Send us a message
                  </h2>
                  <p style={{ margin: "0 0 22px", fontSize: "0.92rem", lineHeight: 1.6, color: "var(--mk-text-soft)" }}>
                    Tell us what you were trying to do and what happened. Screenshots help; so does the link to
                    the role or page in question.
                  </p>
                  <ContactForm />
                </div>
              </Reveal>

              <Reveal delay={120}>
                <div style={{ display: "grid", gap: "18px" }}>
                  <div className="mk-panel" style={{ padding: "24px 26px", display: "grid", gap: "18px" }}>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 750, color: "var(--mk-text)" }}>
                      Other ways to reach us
                    </h3>
                    <a href={`mailto:${SITE.email}`} className="mk-contact-link">
                      <Mail className="mk-contact-link__icon" aria-hidden="true" />
                      <div>
                        <div className="mk-contact-link__label">Email</div>
                        <div className="mk-contact-link__value">{SITE.email}</div>
                      </div>
                    </a>
                    <a href="https://www.angisoft.co.ke" target="_blank" rel="noopener noreferrer" className="mk-contact-link">
                      <Globe className="mk-contact-link__icon" aria-hidden="true" />
                      <div>
                        <div className="mk-contact-link__label">The studio</div>
                        <div className="mk-contact-link__value">angisoft.co.ke</div>
                      </div>
                    </a>
                    <div className="mk-contact-link">
                      <MapPin className="mk-contact-link__icon" aria-hidden="true" />
                      <div>
                        <div className="mk-contact-link__label">Office</div>
                        <div className="mk-contact-link__value">AngiSoft Technologies, Nairobi, Kenya</div>
                      </div>
                    </div>
                    <div className="mk-contact-link">
                      <Clock className="mk-contact-link__icon" aria-hidden="true" />
                      <div>
                        <div className="mk-contact-link__label">Hours</div>
                        <div className="mk-contact-link__value">Mon–Fri, 9am–6pm EAT</div>
                      </div>
                    </div>
                  </div>

                  <div className="mk-panel" style={{ padding: "24px 26px" }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: "1.05rem", fontWeight: 750, color: "var(--mk-text)" }}>
                      When we reply
                    </h3>
                    <FactList items={RESPONSES} label="Response times by topic" />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="selfserve-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="Before you write"
              eyebrowTone="verified"
              title={<span id="selfserve-heading">Most answers are already written down</span>}
              lede="Three minutes of reading usually beats a day of waiting for a reply — and the queue stays free for what actually needs a human."
            />
            <Bento columns={3}>
              <BentoCard
                icon={<MessageCircleQuestion aria-hidden="true" />}
                title="The FAQ"
                body="Where the data comes from, what the match score means, what the trust engine holds, and what happens to your information."
                tone="verified"
                footer={
                  <Link href="/faq" className="mk-btn mk-btn--ghost mk-btn--sm" style={{ marginTop: "4px", width: "fit-content" }}>
                    <ArrowRight className="mk-btn__icon" aria-hidden="true" /> Read the FAQ
                  </Link>
                }
              />
              <BentoCard
                icon={<BookOpen aria-hidden="true" />}
                title="Guides for the search itself"
                body="Job-hunting advice worth watching — spotting scams, networking without the cringe, using AI in the search — from people who do it for a living."
                tone="signal"
                footer={
                  <Link href="/guides" className="mk-btn mk-btn--ghost mk-btn--sm" style={{ marginTop: "4px", width: "fit-content" }}>
                    <ArrowRight className="mk-btn__icon" aria-hidden="true" /> Open the guides
                  </Link>
                }
              />
              <BentoCard
                icon={<ShieldCheck aria-hidden="true" />}
                title="Report a suspicious posting"
                body="Seen a listing that asks for a fee, an interview over chat only, or a company that does not exist? Report it — the trust queue is watched continuously."
                tone="insight"
                footer={
                  <a href={`mailto:${SITE.email}?subject=Reporting%20a%20suspicious%20posting`} className="mk-btn mk-btn--ghost mk-btn--sm" style={{ marginTop: "4px", width: "fit-content" }}>
                    <ArrowRight className="mk-btn__icon" aria-hidden="true" /> Report by email
                  </a>
                }
              />
            </Bento>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="employers-heading">
          <div className="mk-container">
            <div className="mk-hero-split mk-hero-split--with-media" style={{ gap: "clamp(24px, 3vw, 44px)", alignItems: "center" }}>
              <SectionHeading
                eyebrow="For employers"
                eyebrowTone="signal"
                title={<span id="employers-heading">Hiring? There is a page for you too</span>}
                lede="MboQara reads your careers page like a candidate would — then shows the role to people who can actually hold it. If you post roles, the employers page explains how that works and how to reach us."
              />
              <Reveal delay={100}>
                <div className="mk-panel" style={{ padding: "24px 26px", display: "grid", gap: "14px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 750, color: "var(--mk-text)" }}>
                    What employers ask first
                  </h3>
                  <FactList
                    label="Employer quick facts"
                    items={[
                      { term: "Cost to be listed", detail: "Free — employers post on their own sites" },
                      { term: "How often boards are read", detail: "Daily" },
                      { term: "Company pages", detail: "Aggregated per employer, with role history" },
                      { term: "Contact for hiring", detail: "Write via the employers page" },
                    ]}
                  />
                  <Link href="/employers" className="mk-btn mk-btn--signal" style={{ width: "fit-content" }}>
                    For employers <ArrowRight className="mk-btn__icon" aria-hidden="true" />
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-label="A short video on job hunting">
          <div className="mk-container">
            <SectionHeading
              eyebrow="While you wait"
              eyebrowTone="insight"
              title="Six minutes on spotting a job scam"
              lede="The most useful thing a job seeker in this market can watch. It is the same reasoning the trust engine runs on every posting, in a person's words."
            />
            <div style={{ maxWidth: "720px" }}>
              <Reveal>
                <VideoEmbed
                  videoId="BIOiwpt1RAc"
                  title="Job scams: how to spot the red flags"
                  channel="Anchor News"
                />
              </Reveal>
            </div>
          </div>
        </section>

        <CtaBand
          title="The fastest way to reach us is to use it"
          text="Create a profile, find the thing that is broken, and tell us. Testers' reports move this platform more than our plans do."
          primary={
            <Link href="/signup" className="mk-btn mk-btn--signal mk-btn--lg">
              Create my profile <ArrowRight className="mk-btn__icon" aria-hidden="true" />
            </Link>
          }
          secondary={
            <a href={SITE.playStoreUrl} target="_blank" rel="noopener noreferrer" className="mk-btn mk-btn--ghost mk-btn--lg">
              <Download className="mk-btn__icon" aria-hidden="true" /> Get the Android app
            </a>
          }
      />
      </MarketingLayout>
    </>
  );
}
