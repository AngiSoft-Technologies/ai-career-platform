"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Check,
  CircleAlert,
  FileText,
  Globe2,
  MapPin,
} from "lucide-react";
import { Badge, Button, Meta, Panel, PanelHead, Rows, Row, Skeleton } from "@/components/ui";
import { CompanyMark } from "@/components/app-art";
import { titleCase } from "@/lib/format";
import type { Opportunity } from "@/lib/types";
import type { FitSummary, ResumeSuggestion, RoleCriteria } from "./role-analysis";

function safeUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function CriteriaList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[0.84rem] leading-relaxed text-app-soft">
          <span aria-hidden className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-app-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Responsibilities and requirements, with the source of each made explicit. */
export function RoleCriteriaSection({
  title,
  eyebrow,
  criteria,
  kind,
}: {
  title: string;
  eyebrow: string;
  criteria: RoleCriteria;
  kind: "responsibilities" | "requirements";
}) {
  const items = criteria[kind];
  if (items.length === 0) return null;
  const prepared = criteria.prepared[kind];

  return (
    <section className="border-t border-app-border px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-[0.95rem] font-semibold tracking-[-0.01em] text-app-text">
            {title}
          </h3>
        </div>
        {prepared ? (
          <Badge tone="info">Prepared from the posting</Badge>
        ) : (
          <Badge tone="neutral">Stated in the posting</Badge>
        )}
      </div>
      <div className="mt-4">
        <CriteriaList items={items} />
      </div>
      {prepared ? (
        <p className="mt-4 text-[0.75rem] leading-relaxed text-app-muted">
          Prepared from the posting. Confirm on the employer's page.
        </p>
      ) : null}
    </section>
  );
}

/** Evidence-backed strengths and weaknesses — no invented qualities. */
export function FitAssessment({ fit, loading }: { fit: FitSummary; loading: boolean }) {
  if (loading) {
    return (
      <Panel>
        <PanelHead eyebrow="Your position" title="Strengths and weaknesses" />
        <div className="flex flex-col gap-2 border-t border-app-border px-5 py-5">
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="65%" />
          <Skeleton height={14} width="72%" />
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHead
        eyebrow="Your position"
        title="Strengths and weaknesses"
        description="From your profile and default resume."
      />
      <div className="grid gap-5 border-t border-app-border px-5 py-5">
        <div>
          <p className="flex items-center gap-2 text-[0.82rem] font-semibold text-app-text">
            <Check size={14} className="text-app-success" aria-hidden />
            Strengths supported by evidence
          </p>
          {fit.strengths.length ? (
            <ul className="mt-2.5 flex flex-col gap-2">
              {fit.strengths.map((item) => (
                <li key={item} className="text-[0.8rem] leading-relaxed text-app-soft">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[0.8rem] leading-relaxed text-app-muted">
              Nothing supported yet. Add a resume or complete your profile to see
              evidence-backed strengths here.
            </p>
          )}
        </div>
        <div className="border-t border-app-border pt-5">
          <p className="flex items-center gap-2 text-[0.82rem] font-semibold text-app-text">
            <CircleAlert size={14} className="text-app-warning" aria-hidden />
            Weaknesses and gaps
          </p>
          {fit.weaknesses.length ? (
            <ul className="mt-2.5 flex flex-col gap-2">
              {fit.weaknesses.map((item) => (
                <li key={item} className="text-[0.8rem] leading-relaxed text-app-soft">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[0.8rem] leading-relaxed text-app-muted">
              No gaps were found in the evidence available.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Concrete edits, each one opening the document that would be changed. */
export function ResumeImprovements({ suggestions }: { suggestions: ResumeSuggestion[] }) {
  if (suggestions.length === 0) return null;

  return (
    <Panel>
      <PanelHead
        eyebrow="Before you apply"
        title="Proposed resume improvements"
        description="Add only what you can support."
      />
      <Rows className="border-t border-app-border">
        {suggestions.map((suggestion, index) => (
          <Row key={suggestion.title} className="flex-col gap-2 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-app-sm border border-app-border bg-app-surface-2 font-mono text-[0.65rem] text-app-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-[0.85rem] font-medium text-app-text">{suggestion.title}</p>
                <p className="mt-1 text-[0.79rem] leading-relaxed text-app-muted">
                  {suggestion.detail}
                </p>
              </div>
            </div>
            <Link href={suggestion.href} className="ml-10 self-start">
              <Button size="sm" variant="ghost" icon={<FileText size={13} />}>
                Open editor
              </Button>
            </Link>
          </Row>
        ))}
      </Rows>
    </Panel>
  );
}

/** Who is hiring, from facts already attached to the opportunity. */
export function HiringCompany({ opportunity }: { opportunity: Opportunity }) {
  const website = safeUrl(opportunity.companyWebsite);
  const location = [opportunity.city, opportunity.country].filter(Boolean).join(", ");
  const source = opportunity.sourceKind || titleCase(opportunity.platform);

  return (
    <Panel>
      <PanelHead eyebrow="Hiring company" title={opportunity.companyName} />
      <div className="border-t border-app-border px-5 py-5">
        <div className="flex items-center gap-3">
          <CompanyMark name={opportunity.companyName} size={44} className="rounded-app-md" />
          <div className="min-w-0">
            <p className="truncate text-[0.9rem] font-medium text-app-text">
              {opportunity.companyName}
            </p>
            <p className="truncate text-[0.75rem] text-app-muted">
              {location || "Location not stated"}
            </p>
          </div>
        </div>
        <Rows className="mt-4">
          <Row className="grid grid-cols-1 gap-4 px-0 py-3 sm:grid-cols-2">
            <Meta
              label="Company site"
              value={
                website ? (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-app-accent hover:underline"
                  >
                    <Globe2 size={12} aria-hidden />
                    Visit website
                    <ArrowUpRight size={11} aria-hidden />
                  </a>
                ) : (
                  "Not listed"
                )
              }
            />
            <Meta label="Published on" value={source} />
            <Meta
              label="Location"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={12} aria-hidden />
                  {location || "Not stated"}
                </span>
              }
            />
            <Meta
              label="Open roles"
              value={
                <Link
                  href={`/companies/${opportunity.companySlug}`}
                  className="inline-flex items-center gap-1 text-app-accent hover:underline"
                >
                  <Building2 size={12} aria-hidden />
                  Company page
                  <ArrowUpRight size={11} aria-hidden />
                </Link>
              }
            />
          </Row>
        </Rows>
      </div>
    </Panel>
  );
}
