import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { PageHero, SectionHeading } from "@/components/marketing/page-hero";
import { Bento, BentoCard } from "@/components/marketing/bento";
import { StatBand, Callout } from "@/components/marketing/stat-band";
import { EditorialBand, EditorialPhoto } from "@/components/marketing/editorial-photo";
import { FactList } from "@/components/marketing/timeline";
import { AppFrame } from "@/components/marketing/app-frame";
import { Faq, CtaBand } from "@/components/marketing/faq";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  FileSearch,
  Mail,
  MapPin,
  ScanEye,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { pageMetadata, SITE } from "@/lib/seo";
import { JsonLd, breadcrumbSchema, webPageSchema } from "@/components/seo/json-ld";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "For employers — reach candidates who can actually hold the role",
  description:
    "MboQara reads your careers page daily, resolves your postings into company pages, and shows them to candidates who meet your stated requirements — with a trust engine that protects your brand from impersonators.",
  path: "/employers",
  keywords: ["employers Kenya", "post jobs Kenya", "hiring Nairobi", "job board Kenya", "recruitment Kenya"],
});

/** How a company's aggregated page looks inside the product. */
function CompanyPageMock() {
  return (
    <div className="mk-mock">
      <div className="mk-mock__bar" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 750, color: "var(--mk-text)", fontSize: "0.92rem" }}>
          <Building2 size={15} aria-hidden="true" /> KenGen
        </span>
        <span className="mk-mock__pill mk-mock__pill--verified">
          <BadgeCheck aria-hidden="true" /> 14 roles posted
        </span>
      </div>
      <div className="mk-mock__row">
        <span className="mk-mock__row-label">Junior Data Analyst</span>
        <span className="mk-mock__row-value mk-mock__row-value--signal">2 days ago</span>
      </div>
      <div className="mk-mock__row">
        <span className="mk-mock__row-label">Graduate Trainee, Engineering</span>
        <span className="mk-mock__row-value">5 days ago</span>
      </div>
      <div className="mk-mock__row">
        <span className="mk-mock__row-label">Hydrology Officer</span>
        <span className="mk-mock__row-value">11 days ago</span>
      </div>
      <div className="mk-mock__meta" style={{ marginTop: 4 }}>
        <span>
          <ScanEye aria-hidden="true" /> Read from your careers page daily
        </span>
        <span>
          <Wallet aria-hidden="true" /> Salary shown where you state it
        </span>
      </div>
    </div>
  );
}

const EMPLOYER_STATS = [
  {
    value: 130,
    suffix: "+",
    label: "Boards read daily",
    note: "Workday, Oracle HCM, Taleo and company career pages — including yours, if it is one of them.",
    tone: "verified" as const,
  },
  {
    value: 27,
    suffix: "k",
    label: "Roles candidates search",
    note: "The catalogue a candidate's search runs across. Being in it correctly is worth more than a bigger listing.",
    tone: "insight" as const,
  },
  {
    value: 3396,
    label: "Candidates can hold",
    note: "Eligibility is resolved from your stated requirements, so the people who see the role can meet it.",
    tone: "signal" as const,
  },
  {
    value: 0,
    label: "Fees to be listed",
    note: "You post on your own site. MboQara reads it. There is no paid placement in the feed — ever.",
    tone: "plain" as const,
  },
];

const EMPLOYER_FAQS = [
  {
    q: "Do we have to pay to appear?",
    a: "No. MboQara reads publicly posted roles from employer career pages and job boards. There is no paid placement, no bidding for position, and no way to buy a higher rank — the ranking is a match between your stated requirements and the candidate's profile.",
  },
  {
    q: "Which career sites do you read?",
    a: "Workday, Oracle HCM, Taleo and company-hosted career pages, across Kenya and abroad. If your roles are posted on one of those, they are already being read. If yours is something else, write to us and we will tell you plainly whether we can read it.",
  },
  {
    q: "How do you decide a candidate “can hold” the role?",
    a: "From the requirements in your posting: citizenship or residency, years of experience, degree, licence or certification, and work mode. If your posting does not state a requirement, it is not assumed — the absence is carried through as unknown, not as a pass or a fail.",
  },
  {
    q: "What does the trust engine do to our brand?",
    a: "It protects it. Scam postings imitate real employers, and a candidate who has been scammed once in your name does not apply to your real posting. Postings that imitate your company are held, and the queue that reviews them can be alerted directly.",
  },
  {
    q: "What data do you show candidates about us?",
    a: "What you publish: the role, its requirements, the salary if you state it, the location and work mode, the closing date, and a link back to where it is posted. MboQara does not invent company descriptions, and does not host your applications.",
  },
  {
    q: "Can we correct a posting that was read wrong?",
    a: "Yes — write through the contact page with the link. Corrections are applied to the listing and, where the reading was wrong for a structural reason, to the reader that caused it.",
  },
];

export default function EmployersPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: "For employers — MboQara",
            description:
              "MboQara reads employer career pages daily, resolves eligibility from stated requirements, and runs a trust engine that keeps scam postings out of the feed.",
            path: "/employers",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "For employers", path: "/employers" },
          ]),
        ]}
      />
      <MarketingLayout>
        <PageHero
          eyebrow="For employers"
          eyebrowTone="signal"
          title="Your roles, in front of people who can hold them"
          lede="MboQara reads your careers page every day, resolves what each posting actually requires, and shows it to candidates who meet it — with a trust engine that keeps scam postings out of the feed, including the ones imitating you."
          actions={
            <>
              <a href={`mailto:${SITE.email}?subject=Employers%20—%20talking%20to%20MboQara`} className="mk-btn mk-btn--signal mk-btn--lg">
                <Mail className="mk-btn__icon" aria-hidden="true" /> Talk to us
              </a>
              <Link href="/contact" className="mk-btn mk-btn--ghost mk-btn--lg">
                <ArrowRight className="mk-btn__icon" aria-hidden="true" /> Send the details
              </Link>
            </>
          }
          media={
            <AppFrame url="mboqara.angisoft.co.ke/companies/kengen" label="A company's aggregated page inside MboQara, listing its posted roles and when each was read">
              <CompanyPageMock />
            </AppFrame>
          }
        />

        <section className="mk-section" style={{ paddingTop: "24px" }} aria-label="Platform figures for employers">
          <div className="mk-container">
            <Reveal>
              <StatBand stats={EMPLOYER_STATS} label="What MboQara reads and resolves" />
            </Reveal>
          </div>
        </section>

        <EditorialBand
          image="/media/career-fair.webp"
          alt="Candidates and recruiters talking at a careers fair"
          imageCredit="COD Newsroom, CC BY 2.0"
          eyebrow="The honest version"
          eyebrowTone="signal"
          title="A careers fair where everyone can read the requirements"
        >
          <p>
            A careers fair wastes nobody's time: you say what the role needs, and the people who cannot hold it
            walk past. A job board cannot do that — it shows everything to everyone and calls the noise
            “reach”.
          </p>
          <p>
            MboQara reads the requirements instead, and the candidate sees the answer before applying. You get
            applications from people who meet the bar; they stop spending afternoons on roles that were never
            theirs.
          </p>
        </EditorialBand>

        <section className="mk-section" aria-labelledby="what-happens-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="What happens to your postings"
              eyebrowTone="verified"
              title={<span id="what-happens-heading">Read plainly, shown accurately, never sold</span>}
              lede="Four things happen to every role you publish. Nothing else does."
            />
            <Bento columns={2}>
              <BentoCard
                icon={<FileSearch aria-hidden="true" />}
                title="Read from your own site"
                body="Your careers page is read daily — the posting itself, from you, not a reseller's copy. If your board is Workday, Oracle HCM or Taleo, it is read properly, including the salary and closing date where you state them."
                tone="verified"
                span={2}
              />
              <BentoCard
                icon={<BadgeCheck aria-hidden="true" />}
                title="Requirements resolved"
                body="Citizenship, residency, experience, degree, licence, work mode — taken from your posting's own words. What you do not state is carried through as unknown, never assumed."
                tone="insight"
              />
              <BentoCard
                icon={<Users aria-hidden="true" />}
                title="Shown to the right people"
                body="Ranked by how a candidate's profile meets your requirements. A candidate who cannot hold the role is told so before applying, which is why the applications you receive are real ones."
                tone="signal"
              />
              <BentoCard
                icon={<ShieldCheck aria-hidden="true" />}
                title="Brand protected"
                body="A trust engine holds postings that imitate employers, ask for fees, or come from month-old domains. Your name is not used to lure anyone, and the review queue can be alerted directly."
                tone="verified"
                span={2}
              />
            </Bento>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="company-pages-heading">
          <div className="mk-container">
            <div className="mk-hero-split mk-hero-split--with-media" style={{ gap: "clamp(24px, 3vw, 44px)", alignItems: "center" }}>
              <SectionHeading
                eyebrow="Company pages"
                eyebrowTone="insight"
                title={<span id="company-pages-heading">Your whole hiring history, in one place</span>}
                lede="Every role you publish is resolved to your company, so a candidate researching you sees what you are hiring for over time — and which boards you use. It is the research they would do anyway, done accurately."
              />
              <Reveal delay={100}>
                <FactList
                  label="What a company page carries"
                  items={[
                    { term: "Roles currently posted", detail: "Read daily from your boards" },
                    { term: "Requirements per role", detail: "As your posting states them" },
                    { term: "Where each role is posted", detail: "Your own careers page, linked" },
                    { term: "Salary", detail: "Shown where you state it, hidden where you do not" },
                    { term: "Cost", detail: "None" },
                  ]}
                />
              </Reveal>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="employers-faq-heading">
          <div className="mk-container">
            <SectionHeading
              eyebrow="Questions"
              eyebrowTone="signal"
              title={<span id="employers-faq-heading">What hiring teams ask</span>}
            />
            <div style={{ maxWidth: "820px" }}>
              <Faq label="Questions from employers" items={EMPLOYER_FAQS} />
            </div>
          </div>
        </section>

        <CtaBand
          title="Post on your site. We will do the rest."
          text="No account, no fee, no listing form. If your careers page can be read, it already is — and if it cannot, tell us and we will look."
          primary={
            <a href={`mailto:${SITE.email}?subject=Employers%20—%20talking%20to%20MboQara`} className="mk-btn mk-btn--signal mk-btn--lg">
              <Mail className="mk-btn__icon" aria-hidden="true" /> Talk to us
            </a>
          }
          secondary={
            <Link href="/about" className="mk-btn mk-btn--ghost mk-btn--lg">
              <MapPin className="mk-btn__icon" aria-hidden="true" /> Who is reading your page
            </Link>
          }
        />
      </MarketingLayout>
    </>
  );
}
