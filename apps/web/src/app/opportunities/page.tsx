import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Banknote,
  Clock3,
  Compass,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/layout";
import {
  JsonLd,
  breadcrumbSchema,
  itemListSchema,
  webPageSchema,
} from "@/components/seo/json-ld";
import { fetchPublicFeaturedJobs } from "@/lib/server-content";
import { formatDate, formatSalary, titleCase } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import type { FeaturedJob } from "@/lib/types";

export const revalidate = 120;

export const metadata = pageMetadata({
  title: "Opportunities — read live roles before you sign up",
  description:
    "Browse live jobs from Kenya, Africa and worldwide. Open any opportunity in full — responsibilities, pay, location and fit signals — before you create an account or apply.",
  path: "/opportunities",
  keywords: [
    "live jobs Kenya",
    "browse opportunities Africa",
    "remote jobs Africa",
    "job descriptions before signup",
  ],
});

function roleLocation(job: FeaturedJob): string {
  return [job.city, job.country].filter(Boolean).join(", ") || "Location not stated";
}

export default async function OpportunitiesPage() {
  const feed = await fetchPublicFeaturedJobs();
  const jobs = feed?.jobs ?? [];
  const kenyaCount = jobs.filter((job) => job.country === "Kenya").length;
  const flexibleCount = jobs.filter((job) =>
    /remote|hybrid|virtual|anywhere/i.test(`${job.workMode} ${job.city}`),
  ).length;
  const salaryCount = jobs.filter((job) => job.salaryMin || job.salaryMax).length;

  return (
    <MarketingLayout>
      <JsonLd
        data={[
          webPageSchema({
            name: "Opportunities — MboQara",
            description:
              "Read live job opportunities in full before signing up: responsibilities, salary, location, seniority and fit signals.",
            path: "/opportunities",
            type: "CollectionPage",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Opportunities", path: "/opportunities" },
          ]),
          ...(jobs.length
            ? [
                itemListSchema({
                  name: "Live opportunities on MboQara",
                  items: jobs.slice(0, 24).map((job) => ({
                    name: job.title,
                    description: `${job.company} · ${roleLocation(job)} · ${titleCase(job.workMode)}`,
                    url: `/opportunities/${encodeURIComponent(job.id)}`,
                  })),
                }),
              ]
            : []),
        ]}
      />

      <section className="op-hero" aria-labelledby="op-hero-title">
        <div className="op-hero__inner">
          <div className="op-hero__copy">
            <span className="mk-eyebrow mk-eyebrow--signal">
              <span className="mk-eyebrow__rule" aria-hidden="true" />
              Open roles, no sign-up wall
            </span>
            <h1 id="op-hero-title" className="mk-display">
              Read the whole role before you decide.
            </h1>
            <p className="mk-lede">
              Real opportunities, with the employer&apos;s own description, pay,
              location and screening signals. Nothing is hidden behind a form
              until you are ready to apply.
            </p>
            <div className="op-hero__actions">
              <a href="#live-roles" className="mk-btn mk-btn--signal mk-btn--lg">
                See live roles
                <ArrowDown aria-hidden="true" size={17} />
              </a>
              <Link href="/guides" className="mk-btn mk-btn--ghost mk-btn--lg">
                How to choose well
              </Link>
            </div>
            <p className="op-hero__note">
              You can read every posting free. We only ask for an account on
              Apply — and we bring you straight back to it.
            </p>
          </div>

          <aside className="op-hero__panel" aria-labelledby="op-check-title">
            <div className="op-hero__panel-photo" aria-hidden="true" />
            <div className="op-hero__panel-body">
              <p id="op-check-title" className="op-hero__panel-kicker">
                A role you can actually evaluate
              </p>
              <ul className="op-hero__checks">
                <li>
                  <Sparkles aria-hidden="true" size={17} />
                  <span>What the work really involves, in the employer&apos;s words</span>
                </li>
                <li>
                  <MapPin aria-hidden="true" size={17} />
                  <span>Where it is, how it works, and who it is for</span>
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" size={17} />
                  <span>Screening notes before you spend an afternoon applying</span>
                </li>
              </ul>
              <p className="op-hero__count">
                <span className="mk-numeral">{jobs.length}</span>
                <span>live roles in the current feed</span>
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="op-signals" aria-label="What is live right now">
        <div className="mk-container op-signals__inner">
          <article className="op-signal">
            <Compass aria-hidden="true" size={20} />
            <strong className="mk-numeral">{kenyaCount}</strong>
            <span>Kenya roles in this feed</span>
            <p>Home-market opportunities lead the list, newest first.</p>
          </article>
          <article className="op-signal">
            <Banknote aria-hidden="true" size={20} />
            <strong className="mk-numeral">{salaryCount}</strong>
            <span>with published pay</span>
            <p>See the number before you invest time in an application.</p>
          </article>
          <article className="op-signal">
            <Clock3 aria-hidden="true" size={20} />
            <strong className="mk-numeral">{flexibleCount}</strong>
            <span>remote or flexible</span>
            <p>Filter with your eyes: work mode is on every role card.</p>
          </article>
        </div>
      </section>

      <section className="op-list-section" id="live-roles" aria-labelledby="op-list-title">
        <div className="mk-container">
          <header className="op-section-head">
            <span className="mk-eyebrow mk-eyebrow--verified">
              <span className="mk-eyebrow__rule" aria-hidden="true" />
              The live board
            </span>
            <h2 id="op-list-title" className="mk-section-heading">
              Start with a role, not a form.
            </h2>
            <p className="mk-lede">
              Every title below opens a full public page. Choose one that
              catches your eye, read it properly, then apply only if it still
              feels right.
            </p>
          </header>

          {jobs.length ? (
            <ol className="op-role-list">
              {jobs.map((job, index) => (
                <li key={job.id}>
                  <Link
                    href={`/opportunities/${encodeURIComponent(job.id)}`}
                    className="op-role"
                  >
                    <span className="op-role__rank mk-numeral" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="op-role__body">
                      <span className="op-role__company">{job.company}</span>
                      <span className="op-role__title">{job.title}</span>
                      <span className="op-role__meta">
                        <span className="op-role__meta-item">
                          <MapPin aria-hidden="true" size={14} />
                          {roleLocation(job)}
                        </span>
                        <span className="op-role__meta-item">
                          {titleCase(job.workMode)}
                        </span>
                        <span className="op-role__meta-item">
                          {titleCase(job.seniority)}
                        </span>
                        {job.riskScore != null && job.riskScore >= 60 ? (
                          <span className="op-role__flag">Review carefully</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="op-role__side">
                      <span className="op-role__salary">
                        {formatSalary(job.salaryMin, job.salaryMax, job.currency)}
                      </span>
                      <span className="op-role__posted">
                        Posted {formatDate(job.postedAt)}
                      </span>
                      <ArrowRight className="op-role__arrow" aria-hidden="true" size={18} />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="op-empty">
              <h3>New roles are being added.</h3>
              <p>
                The live feed is empty for a moment. Read the guides while the
                next batch is prepared — they work on any job board.
              </p>
              <Link href="/guides" className="mk-btn mk-btn--ghost">
                Browse the guides
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="op-questions" aria-labelledby="op-questions-title">
        <div className="mk-container">
          <header className="op-section-head">
            <span className="mk-eyebrow mk-eyebrow--insight">
              <span className="mk-eyebrow__rule" aria-hidden="true" />
              How to use this page
            </span>
            <h2 id="op-questions-title" className="mk-section-heading">
              Three questions worth answering first.
            </h2>
          </header>
          <ol className="op-questions__grid">
            <li className="op-question">
              <span className="op-question__step mk-numeral">01</span>
              <h3>What does the employer actually want?</h3>
              <p>
                Read the full posting on the role page. No sign-up, no preview
                cut short at the interesting part.
              </p>
            </li>
            <li className="op-question">
              <span className="op-question__step mk-numeral">02</span>
              <h3>Does the reality fit your life?</h3>
              <p>
                Check location, work mode, seniority, pay and eligibility in
                one place before you start drafting anything.
              </p>
            </li>
            <li className="op-question">
              <span className="op-question__step mk-numeral">03</span>
              <h3>Is this worth your best application?</h3>
              <p>
                When the answer is yes, Apply opens the account step and then
                returns to this exact opportunity.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="op-close" aria-labelledby="op-close-title">
        <div className="op-close__inner">
          <span className="mk-eyebrow mk-eyebrow--verified">
            <span className="mk-eyebrow__rule" aria-hidden="true" />
            Read first, join when it matters
          </span>
          <h2 id="op-close-title" className="mk-section-heading">
            Find one role that deserves your best draft.
          </h2>
          <p className="mk-lede">
            The posting is open. The fit signals are open. The account is only
            for the moment you decide to apply.
          </p>
          <div className="op-close__actions">
            <a href="#live-roles" className="mk-btn mk-btn--signal mk-btn--lg">
              Back to live roles
              <ArrowRight aria-hidden="true" size={17} />
            </a>
            <Link href="/guides" className="mk-btn mk-btn--ghost mk-btn--lg">
              Read the guides
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
