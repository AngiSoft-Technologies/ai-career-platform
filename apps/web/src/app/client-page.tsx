"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingLayout } from "@/components/marketing/layout";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/components/session";
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  ShieldCheck,
  Sparkles,
  FileText,
  Briefcase,
  Globe,
  Check,
  Users,
  Search,
  Brain,
  HardDrive,
  Rocket,
  Target,
  Mail,
  Clock,
} from "lucide-react";
interface FeaturedJob {
  id: string;
  title: string;
  company: string;
  city: string;
  country: string;
  workMode: string;
  seniority: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
}

interface Benefit {
  id: string;
  title: string;
  body: string;
  icon: string;
}

interface ComparisonColumn {
  label: string;
  items: string[];
  check: boolean;
}

interface ComparisonContent {
  columns: ComparisonColumn[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  FileText,
  Mail,
  Briefcase,
  ShieldCheck,
  Rocket,
  Search,
  Clock,
  Users,
  Brain,
  Globe,
  HardDrive,
};

function IconFromName(name: string) {
  const Comp = ICON_MAP[name] || Sparkles;
  return <Comp aria-hidden="true" />;
}

function salaryLabel(job: FeaturedJob): string | null {
  if (job.salaryMin === null && job.salaryMax === null) return null;
  const format = (value: number) =>
    new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const currency = job.currency ? `${job.currency} ` : "";
  if (job.salaryMin !== null && job.salaryMax !== null) {
    return `${currency}${format(job.salaryMin)} – ${format(job.salaryMax)}`;
  }
  return `${currency}${format((job.salaryMin ?? job.salaryMax) as number)}`;
}

export default function LandingPage() {
  const { session } = useSession();
  const benefits = useApi<Benefit[]>("/content/benefits");
  const comparison = useApi<ComparisonContent>("/content/comparison");
  const featuredJobs = useApi<{ jobs: FeaturedJob[] }>("/public/featured");

  const b = benefits.data?.length ? benefits.data : [
    { id: "discover", title: "Find relevant opportunities", body: "Explore roles that fit your skills, experience and preferences.", icon: "Search" },
    { id: "match", title: "Understand your fit", body: "See the experience and skills that connect you to a role.", icon: "Target" },
    { id: "resume", title: "Prepare with purpose", body: "Bring your most relevant experience forward for each application.", icon: "FileText" },
    { id: "track", title: "Keep every step together", body: "Organise applications, documents and follow-ups in one workspace.", icon: "Briefcase" },
  ];
  const c = comparison.data?.columns?.length ? comparison.data.columns : [
    { label: "One focused search", items: ["Explore opportunities from multiple sources", "Keep your preferences in view"], check: true },
    { label: "A clearer application", items: ["See relevant skills and experience", "Tailor your resume for the role"], check: true },
    { label: "Your choice at every step", items: ["Review before you share", "Apply through the original channel"], check: true },
  ];
  const jobs = featuredJobs.data?.jobs ?? [];
  const jobSlider = useRef<HTMLDivElement>(null);
  const gate = (path: string) =>
    session ? path : `/signup?next=${encodeURIComponent(path)}`;
  const slideJobs = (direction: 1 | -1) => {
    const track = jobSlider.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>(".jr-job-card");
    const distance = card ? card.offsetWidth + 16 : track.clientWidth * 0.8;
    track.scrollBy({ left: direction * distance, behavior: "smooth" });
  };

  useEffect(() => {
    document.title = "Find work that fits you | Job Radar";
  }, []);

  return (
    <MarketingLayout>
      <section className="jr-hero" aria-labelledby="hero-title">
        <div className="jr-hero__inner">
          <div className="jr-hero__copy">
            <span className="jr-eyebrow"><Sparkles aria-hidden="true" /> Your next move, made clearer</span>
            <h1 id="hero-title">Find work that fits the life you’re building.</h1>
            <p>Discover relevant opportunities, shape your resume for each role, and keep every application moving from one workspace.</p>
            <div className="jr-hero__actions">
              <Link href="/signup" className="jr-button jr-button--primary">Build my career profile <ArrowRight aria-hidden="true" /></Link>
              <Link href={gate("/opportunities")} className="jr-button jr-button--quiet">Browse opportunities</Link>
            </div>
            <p className="jr-hero__note">Your experience stays yours. You choose what to share and when to apply.</p>
          </div>

          <div className="jr-hero__visual">
            <Image
              src="/media/careers/lagos-career-story.webp"
              alt="A professional working on her laptop in a Lagos café"
              fill
              priority
              sizes="(max-width: 760px) 100vw, 52vw"
              className="jr-hero__photo"
            />
            <div className="jr-match-preview" aria-label="Job match preview">
              <div className="jr-match-preview__top"><span className="jr-live-dot" /> Example match <span className="jr-match-preview__fit">Strong fit</span></div>
              <div className="jr-match-preview__job">{jobs[0]?.title ?? "Product Designer"}</div>
              <div className="jr-match-preview__company">{jobs[0]?.company ?? "A role matched to your profile"}</div>
              <div className="jr-match-preview__meta"><span>{jobs[0]?.city ?? "Nairobi"}{jobs[0]?.workMode ? ` · ${jobs[0].workMode}` : " · Hybrid"}</span><span>Skills align</span></div>
              <div className="jr-match-preview__bar"><span /></div>
              <div className="jr-match-preview__bottom"><span>Review match details</span><ArrowRight aria-hidden="true" /></div>
            </div>
            <div className="jr-hero__photo-caption"><span>CAREERS TAKE MANY SHAPES</span><span>One place to move yours forward</span></div>
          </div>
        </div>
      </section>

      <section className="jr-workflow" aria-labelledby="workflow-title">
        <div className="jr-workflow__copy">
          <span className="jr-eyebrow jr-eyebrow--dark">From opportunity to application</span>
          <h2 id="workflow-title">A better search is more than a list of jobs.</h2>
          <p>See how your experience lines up, make thoughtful changes to your resume, then keep the next steps together.</p>
          <ul className="jr-workflow__steps">
            <li><span>01</span><div><strong>Find your next opportunity</strong><small>Explore roles that fit your skills and preferences.</small></div></li>
            <li><span>02</span><div><strong>Shape your application</strong><small>Bring relevant experience forward in your resume.</small></div></li>
            <li><span>03</span><div><strong>Keep your momentum</strong><small>Track applications and follow-ups in one place.</small></div></li>
          </ul>
        </div>
        <div className="jr-editor" aria-label="Resume editor preview">
          <div className="jr-editor__top"><div className="jr-editor__dots"><i /><i /><i /></div><span>Resume workspace</span><span className="jr-editor__saved"><Check aria-hidden="true" /> Saved</span></div>
          <div className="jr-editor__body">
            <aside className="jr-editor__rail"><span className="is-active"><FileText aria-hidden="true" /> Resume</span><span><Target aria-hidden="true" /> Match notes</span><span><Briefcase aria-hidden="true" /> Applications</span></aside>
            <div className="jr-resume-page">
              <div className="jr-resume-page__identity"><div className="jr-resume-page__avatar">AM</div><div><strong>Amara Mwangi</strong><small>Product Designer</small></div></div>
              <div className="jr-resume-page__rule" />
              <div className="jr-resume-page__heading">PROFILE</div>
              <div className="jr-resume-page__line jr-resume-page__line--long" /><div className="jr-resume-page__line" />
              <div className="jr-resume-page__heading">EXPERIENCE</div>
              <div className="jr-resume-page__role"><strong>Product Designer</strong><span>2022 — Present</span></div>
              <div className="jr-resume-page__line jr-resume-page__line--long" /><div className="jr-resume-page__line jr-resume-page__line--medium" />
              <div className="jr-resume-page__role"><strong>UX Designer</strong><span>2020 — 2022</span></div>
              <div className="jr-resume-page__line jr-resume-page__line--long" />
              <div className="jr-resume-page__heading">SKILLS</div>
              <div className="jr-resume-page__tags"><span>Research</span><span>Prototyping</span><span>Figma</span></div>
            </div>
            <div className="jr-editor__suggestion"><span><Sparkles aria-hidden="true" /> Match insight</span><strong>Bring your research work into focus.</strong><small>Connect your user research experience to this role’s requirements.</small><button type="button">Review suggestion</button></div>
          </div>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="how-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">How we help you get hired</span>
            <h2 id="how-heading" className="mk-section-heading">From searching to applying, without the busywork</h2>
          </header>
          <div className="mk-grid mk-grid--4">
            {benefits.loading ? (
              <div className="mk-grid mk-grid--4" style={{ gap: "24px" }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="mk-card" style={{ height: "200px", display: "flex", flexDirection: "column", gap: "12px", padding: "24px" }}>
                    <div className="mk-card__icon" style={{ color: "var(--mk-text-muted)" }}><Sparkles /></div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--mk-text-muted)" }}>{"Loading…"}</div>
                    <div style={{ fontSize: "0.88rem", color: "var(--mk-text-soft)", lineHeight: 1.6 }}>{"Loading…"}</div>
                  </div>
                ))}
              </div>
            ) : b.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>More benefits coming soon.</p>
            ) : (
              b.map((benefit, i) => (
                <Reveal key={benefit.id} delay={i * 80} className="mk-card">
                  <div className="mk-card__icon">{IconFromName(benefit.icon)}</div>
                  <h3 className="mk-card__title">{benefit.title}</h3>
                  <p className="mk-card__text">{benefit.body}</p>
                </Reveal>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mk-section" style={{ background: "var(--mk-surface)", borderTop: "1px solid var(--mk-border)", borderBottom: "1px solid var(--mk-border)" }} aria-labelledby="vs-heading">
        <div className="mk-container">
          <header className="mk-section-header">
            <span className="mk-section-eyebrow">Why Job Radar</span>
            <h2 id="vs-heading" className="mk-section-heading">Built for you, not for recruiters</h2>
          </header>
          <div className="mk-grid mk-grid--3">
            {comparison.loading ? (
              <div className="mk-grid mk-grid--3" style={{ gap: "24px" }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="mk-card" style={{ padding: "24px" }}>
                    <h3 className="mk-card__title" style={{ color: "var(--mk-text-muted)" }}>{"Loading…"}</h3>
                    <ul className="mk-footer__list" style={{ color: "var(--mk-text-muted)" }}>
                      <li style={{ fontSize: "0.85rem", marginBottom: "8px" }}>{"Loading…"}</li>
                      <li style={{ fontSize: "0.85rem", marginBottom: "8px" }}>{"Loading…"}</li>
                      <li style={{ fontSize: "0.85rem", marginBottom: "8px" }}>{"Loading…"}</li>
                    </ul>
                  </div>
                ))}
              </div>
            ) : c.length === 0 ? (
              <p style={{ color: "var(--mk-text-muted)", textAlign: "center" }}>More details coming soon.</p>
            ) : (
              c.map((col, ci) => (
                <div key={ci} className="mk-card">
                  <h3 className="mk-card__title" style={{ marginBottom: "12px", color: col.check ? "var(--mk-success)" : "var(--mk-text-soft)" }}>
                    {col.label}
                  </h3>
                  <ul className="mk-footer__list" style={{ color: "var(--mk-text-soft)" }}>
                    {col.items.map((item, ii) => (
                      <li key={ii} style={{ marginBottom: "8px", fontSize: "0.85rem" }}>
                        <span style={{ color: col.check ? "var(--mk-success)" : "var(--mk-text-muted)", marginRight: "6px" }}>
                          {col.check ? "✓" : "✗"}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="jr-jobs" aria-labelledby="jobs-title">
        <div className="jr-jobs__inner">
          <div className="jr-jobs__heading">
            <div>
              <span className="jr-eyebrow jr-eyebrow--dark">Live opportunities</span>
              <h2 id="jobs-title">Roles worth a closer look.</h2>
            </div>
            <p>A preview of active roles on Job Radar.</p>
          </div>

          <div className="jr-jobs__controls" aria-label="Job slider controls">
            <button type="button" className="jr-jobs__arrow" onClick={() => slideJobs(-1)} aria-label="Previous jobs">
              <ArrowLeft aria-hidden="true" />
            </button>
            <button type="button" className="jr-jobs__arrow" onClick={() => slideJobs(1)} aria-label="Next jobs">
              <ArrowRight aria-hidden="true" />
            </button>
          </div>

          <div
            className="jr-jobs__track"
            ref={jobSlider}
            tabIndex={0}
            aria-label="Available jobs"
          >
            {featuredJobs.loading
              ? [0, 1, 2].map((item) => (
                  <div key={item} className="jr-job-card jr-job-card--loading" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                ))
              : jobs.map((job) => {
                  const salary = salaryLabel(job);
                  return (
                    <Link
                      key={job.id}
                      href={gate(`/opportunities/${job.id}`)}
                      className="jr-job-card"
                    >
                      <div className="jr-job-card__top">
                        <span>{job.company}</span>
                        <span className="jr-job-card__live">Live</span>
                      </div>
                      <h3 className="jr-job-card__title">{job.title}</h3>
                      <div className="jr-job-card__meta">
                        <span><MapPin aria-hidden="true" />{job.city || job.country}</span>
                        <span><Briefcase aria-hidden="true" />{job.workMode}</span>
                      </div>
                      <div className="jr-job-card__tags">
                        <span>{job.seniority}</span>
                        {salary ? <span>{salary}</span> : null}
                      </div>
                      <div className="jr-job-card__cta">
                        View role
                        <ArrowRight aria-hidden="true" />
                      </div>
                    </Link>
                  );
                })}
            {!featuredJobs.loading && jobs.length === 0 ? (
              <p className="jr-jobs__empty">New roles are being added. Check back shortly.</p>
            ) : null}
          </div>

          <div className="jr-jobs__more">
            <Link href={gate("/opportunities")} className="mk-btn mk-btn--primary mk-btn--lg">
              {session ? "View all jobs" : "Create a free account"} <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}
