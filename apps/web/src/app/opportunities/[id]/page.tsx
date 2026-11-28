import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  Banknote,
  Briefcase,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/layout";
import { ApplyCta } from "@/components/marketing/apply-cta";
import {
  JsonLd,
  breadcrumbSchema,
  jobPostingSchema,
  webPageSchema,
} from "@/components/seo/json-ld";
import {
  fetchPublicFeaturedJobs,
  fetchPublicOpportunity,
} from "@/lib/server-content";
import { normaliseJobText } from "@/lib/job-text";
import {
  eligibilityLabel,
  formatDate,
  formatSalary,
  titleCase,
} from "@/lib/format";
import { SITE, pageMetadata } from "@/lib/seo";
import type { FeaturedJob, PublicOpportunity } from "@/lib/types";

export const revalidate = 120;

interface PageProps {
  params: Promise<{ id: string }>;
}

function validIso(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

/**
 * Older postings begin with a markdown label such as `**Responsibilities:**`.
 * normaliseJobText() already removes the navigation around the posting, but
 * that label is not useful to a reader or to a search snippet, so remove it
 * after the boundary has been found.
 */
function cleanJobDescription(value: string): string {
  return value
    .replace(
      /^\s*\*{0,2}(?:job purpose statement|about the role|about this role|about the job|job description|role description|the role|what you(?:'|’)?ll do|what you will do|what we are looking for|key accountabilities|responsibilities|requirements|qualifications)\*{0,2}\s*:?\s*/i,
      "",
    )
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*{1,2}/g, "")
    .trim();
}

/**
 * The JobPosting description mirrors the visible page: employer description,
 * named skills, eligibility notes, place and work mode. Every value comes
 * from the auth-free public payload, never from the account-only API.
 */
function descriptionHtml(
  opportunity: PublicOpportunity,
  description: string,
): string {
  const blocks = description
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`);

  if (opportunity.skills.length) {
    blocks.push(
      `<p>Skills named in this posting: ${escapeHtml(opportunity.skills.join(", "))}.</p>`,
    );
  }
  if (opportunity.eligibilityReasons.length) {
    blocks.push(
      `<p>Eligibility notes: ${escapeHtml(opportunity.eligibilityReasons.join("; "))}.</p>`,
    );
  }
  const location = [opportunity.city, opportunity.country]
    .filter(Boolean)
    .join(", ");
  blocks.push(
    `<p>Location: ${escapeHtml(location || SITE.country)}. Work mode: ${escapeHtml(titleCase(opportunity.workMode))}.</p>`,
  );

  return blocks.join("");
}

function relatedRoles(
  jobs: FeaturedJob[],
  opportunity: PublicOpportunity,
): FeaturedJob[] {
  return jobs
    .map((job, index) => {
      let score = 0;
      if (job.country === opportunity.country) score += 4;
      if (job.workMode === opportunity.workMode) score += 2;
      if (job.seniority === opportunity.seniority) score += 1;
      return { job, index, score };
    })
    .filter((entry) => entry.job.id !== opportunity.id)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 4)
    .map((entry) => entry.job);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const opportunity = await fetchPublicOpportunity(id);
  const path = `/opportunities/${encodeURIComponent(id)}`;

  if (!opportunity) {
    return pageMetadata({
      title: "Opportunity not found",
      description: "This role is no longer available.",
      path,
      noindex: true,
    });
  }

  const summary = cleanJobDescription(
    normaliseJobText(opportunity.description),
  ).replace(/\s+/g, " ");
  const location = [opportunity.city, opportunity.country]
    .filter(Boolean)
    .join(", ");
  const intro = `${opportunity.title} at ${opportunity.company}${location ? ` in ${location}` : ""}.`;
  const detailLimit = Math.max(0, 160 - intro.length - 1);
  const detail = summary.slice(0, detailLimit).trim();

  return pageMetadata({
    title: `${opportunity.title} — ${opportunity.company}`,
    description: `${intro}${detail ? ` ${detail}${summary.length > detail.length ? "…" : ""}` : " Read the full posting before you apply."}`,
    path,
    keywords: [
      opportunity.title,
      opportunity.company,
      opportunity.country,
      opportunity.workMode,
      "job opportunity",
    ],
  });
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id } = await params;
  const opportunity = await fetchPublicOpportunity(id);
  if (!opportunity) notFound();

  const [feed] = await Promise.all([fetchPublicFeaturedJobs()]);
  const description = cleanJobDescription(
    normaliseJobText(opportunity.description),
  );
  const paragraphs = description
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const postedAt = validIso(opportunity.postedAt);
  const expiresAt = validIso(opportunity.expiresAt);
  const location = [opportunity.city, opportunity.country]
    .filter(Boolean)
    .join(", ");
  const flagged = (opportunity.riskScore ?? 0) >= 60;
  const related = relatedRoles(feed?.jobs ?? [], opportunity);
  const path = `/opportunities/${encodeURIComponent(opportunity.id)}`;

  return (
    <MarketingLayout>
      <JsonLd
        data={[
          webPageSchema({
            name: `${opportunity.title} — ${opportunity.company}`,
            description: `Read the full public posting for ${opportunity.title} at ${opportunity.company} in ${location || SITE.country}.`,
            path,
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Opportunities", path: "/opportunities" },
            { name: opportunity.title, path },
          ]),
          ...(description && postedAt
            ? [
                jobPostingSchema({
                  opportunity: {
                    id: opportunity.id,
                    title: opportunity.title,
                    company: opportunity.company,
                    country: opportunity.country || SITE.country,
                    city: opportunity.city,
                    workMode: opportunity.workMode,
                    seniority: opportunity.seniority,
                    employmentType: opportunity.employmentType,
                    salaryMin: opportunity.salaryMin,
                    salaryMax: opportunity.salaryMax,
                    currency: opportunity.currency,
                    postedAt,
                    expiresAt: expiresAt ?? undefined,
                  },
                  descriptionHtml: descriptionHtml(opportunity, description),
                  path,
                }),
              ]
            : []),
        ]}
      />

      <section className="op-detail-hero" aria-labelledby="op-detail-title">
        <div className="mk-container">
          <nav className="op-breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/opportunities">Opportunities</Link></li>
              <li aria-current="page">{opportunity.title}</li>
            </ol>
          </nav>

          <div className="op-detail-hero__grid">
            <div className="op-detail-hero__copy">
              <span className="mk-eyebrow mk-eyebrow--signal">
                <span className="mk-eyebrow__rule" aria-hidden="true" />
                {opportunity.company}
              </span>
              <h1 id="op-detail-title" className="mk-display mk-display--sm">
                {opportunity.title}
              </h1>
              <p className="op-detail__byline">
                <MapPin aria-hidden="true" size={16} />
                {location || "Location not stated"}
                <span aria-hidden="true">·</span>
                <Briefcase aria-hidden="true" size={16} />
                {titleCase(opportunity.workMode)}
              </p>

              <div className="op-detail__tags" aria-label="At a glance">
                <span className="op-detail__tag op-detail__tag--pay">
                  <Banknote aria-hidden="true" size={15} />
                  {formatSalary(opportunity.salaryMin ?? null, opportunity.salaryMax ?? null, opportunity.currency ?? null)}
                </span>
                <span className="op-detail__tag">{titleCase(opportunity.seniority)}</span>
                <span className="op-detail__tag">{titleCase(opportunity.employmentType)}</span>
                <span className="op-detail__tag">{opportunity.sourceKind}</span>
              </div>

              <div className="op-detail__actions">
                <ApplyCta opportunityId={opportunity.id} title={opportunity.title} />
                <a href="#role-details" className="mk-btn mk-btn--ghost mk-btn--lg">
                  Read the full posting
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
              </div>
              <p className="op-detail__promise">
                <CheckCircle2 aria-hidden="true" size={16} />
                Read this role free. Sign-in only happens when you press Apply.
              </p>
            </div>

            <aside className="op-detail__facts" aria-label="Role facts">
              <p className="op-detail__facts-title">
                <Sparkles aria-hidden="true" size={17} />
                Fact check
              </p>
              <dl>
                <div>
                  <dt>Posted</dt>
                  <dd>{formatDate(opportunity.postedAt)}</dd>
                </div>
                <div>
                  <dt>Closes</dt>
                  <dd>{opportunity.expiresAt ? formatDate(opportunity.expiresAt) : "Not stated"}</dd>
                </div>
                <div>
                  <dt>Pay</dt>
                  <dd>{formatSalary(opportunity.salaryMin ?? null, opportunity.salaryMax ?? null, opportunity.currency ?? null)}</dd>
                </div>
                <div>
                  <dt>Work mode</dt>
                  <dd>{titleCase(opportunity.workMode)}</dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{titleCase(opportunity.seniority)}</dd>
                </div>
                <div>
                  <dt>Application route</dt>
                  <dd>MboQara application desk</dd>
                </div>
              </dl>
              <p className="op-detail__facts-note">
                <Clock3 aria-hidden="true" size={15} />
                Check the closing date before you draft. Roles can be withdrawn early.
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section className="op-detail-section" id="role-details" aria-labelledby="op-details-title">
        <div className="mk-container op-detail__prose-grid">
          <header className="op-detail__section-head">
            <span className="mk-eyebrow mk-eyebrow--verified">
              <span className="mk-eyebrow__rule" aria-hidden="true" />
              The posting
            </span>
            <h2 id="op-details-title" className="mk-section-heading">
              What this role is really asking for.
            </h2>
            <p className="mk-lede">
              This is the employer&apos;s description, cleaned of job-board
              navigation so the requirements are the first thing you read.
            </p>
          </header>

          {paragraphs.length ? (
            <div className="op-detail__prose">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <div className="op-detail__prose op-detail__prose--empty">
              <p>
                The employer has not shared a full description yet. Check the
                closing date and the screening note before you apply.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="op-detail-section op-fit" id="fit-signals" aria-labelledby="op-fit-title">
        <div className="mk-container">
          <header className="op-section-head">
            <span className="mk-eyebrow mk-eyebrow--insight">
              <span className="mk-eyebrow__rule" aria-hidden="true" />
              Before you apply
            </span>
            <h2 id="op-fit-title" className="mk-section-heading">
              Signals worth checking.
            </h2>
            <p className="mk-lede">
              These are the facts we can show without an account — enough to
              decide whether this role deserves your time.
            </p>
          </header>

          <div className="op-fit__grid">
            <article className="op-fit__card">
              <h3>Skills named in the posting</h3>
              {opportunity.skills.length ? (
                <ul className="op-pills">
                  {opportunity.skills.slice(0, 18).map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
              ) : (
                <p>No specific skills were listed. Read the description for the real requirements.</p>
              )}
            </article>

            <article className="op-fit__card">
              <h3>Eligibility signal</h3>
              <p className="op-fit__lead">{eligibilityLabel(opportunity.eligibility)}</p>
              {opportunity.eligibilityReasons.length ? (
                <ul className="op-fit__reasons">
                  {opportunity.eligibilityReasons.slice(0, 6).map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p>No eligibility note was published with this role.</p>
              )}
            </article>

            <article className="op-fit__card">
              <h3>Screening note</h3>
              <p className="op-fit__lead">
                {flagged ? "Take a closer look" : "Published after screening"}
              </p>
              <p>
                {flagged
                  ? "Some details need extra care. Confirm the employer and the application route before you share documents."
                  : "This posting was checked before it reached the public board. Still verify the employer's own careers page when you apply."}
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="op-detail-section op-approach" aria-labelledby="op-approach-title">
        <div className="mk-container">
          <header className="op-section-head">
            <span className="mk-eyebrow mk-eyebrow--signal">
              <span className="mk-eyebrow__rule" aria-hidden="true" />
              A calmer way to apply
            </span>
            <h2 id="op-approach-title" className="mk-section-heading">
              From reading to applying, in three steps.
            </h2>
          </header>
          <ol className="op-approach__grid">
            <li>
              <span className="op-approach__number mk-numeral">01</span>
              <h3>Read the whole posting</h3>
              <p>See the responsibilities and requirements before anything asks who you are.</p>
              <a href="#role-details">Go to the posting <ArrowRight aria-hidden="true" size={15} /></a>
            </li>
            <li>
              <span className="op-approach__number mk-numeral">02</span>
              <h3>Compare the signals</h3>
              <p>Check skills, eligibility, pay and work mode against the life you actually have.</p>
              <a href="#fit-signals">Go to the signals <ArrowRight aria-hidden="true" size={15} /></a>
            </li>
            <li>
              <span className="op-approach__number mk-numeral">03</span>
              <h3>Apply when it still fits</h3>
              <p>Sign in or create an account here. We keep the role and return you to the application desk.</p>
              <ApplyCta
                opportunityId={opportunity.id}
                title={opportunity.title}
                className="op-approach__cta"
              />
            </li>
          </ol>
        </div>
      </section>

      {related.length ? (
        <section className="op-related" aria-labelledby="op-related-title">
          <div className="mk-container">
            <header className="op-section-head">
              <span className="mk-eyebrow mk-eyebrow--verified">
                <span className="mk-eyebrow__rule" aria-hidden="true" />
                Keep looking
              </span>
              <h2 id="op-related-title" className="mk-section-heading">
                Other roles close to this one.
              </h2>
            </header>
            <ul className="op-related__grid">
              {related.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/opportunities/${encodeURIComponent(job.id)}`}
                    className="op-related__card-link"
                  >
                    <article className="op-related__card">
                      <span className="op-related__company">{job.company}</span>
                      <span className="op-related__title">{job.title}</span>
                      <span className="op-related__meta">
                        {[job.city, job.country].filter(Boolean).join(", ") || SITE.country}
                      </span>
                      <span className="op-related__foot">
                        {formatSalary(job.salaryMin, job.salaryMax, job.currency)}
                        <ArrowRight aria-hidden="true" size={16} />
                      </span>
                    </article>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="op-close" aria-labelledby="op-close-detail-title">
        <div className="op-close__inner">
          <span className="mk-eyebrow mk-eyebrow--verified">
            <span className="mk-eyebrow__rule" aria-hidden="true" />
            Your move
          </span>
          <h2 id="op-close-detail-title" className="mk-section-heading">
            Ready to put your name forward?
          </h2>
          <p className="mk-lede">
            We kept the posting open so you could decide properly. The next
            step is yours alone.
          </p>
          <div className="op-close__actions">
            <ApplyCta opportunityId={opportunity.id} title={opportunity.title} />
            <Link href="/opportunities" className="mk-btn mk-btn--ghost mk-btn--lg">
              Back to all roles
            </Link>
          </div>
          <p className="op-close__trust">
            <ShieldCheck aria-hidden="true" size={16} />
            No account needed to read. No surprise fees. You submit every application yourself.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
