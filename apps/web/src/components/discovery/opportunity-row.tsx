"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, CalendarClock, Globe, Wallet } from "lucide-react";
import { Badge, cx } from "@/components/ui";
import { CompanyMark } from "@/components/app-art";
import {
  eligibilityLabel,
  eligibilityTone,
  formatDate,
  formatSalary,
  relativeTime,
  titleCase,
} from "@/lib/format";
import type { Opportunity } from "@/lib/types";
import { SaveToggle } from "./save-toggle";

/** One catalogue or wish-list row. The link and the save control stay siblings. */
export function OpportunityRow({
  item,
  compact = false,
  saved = false,
  savedAt,
  showScore = false,
  onSavedChange,
}: {
  item: Opportunity;
  compact?: boolean;
  saved?: boolean;
  savedAt?: string;
  showScore?: boolean;
  onSavedChange?: (saved: boolean) => void;
}) {
  const score = item.match?.score;
  const risk = item.riskScore ?? null;
  const location = [item.city, item.country].filter(Boolean).join(", ");

  return (
    <li>
      <div
        className={cx(
          "group flex items-start gap-4 transition-colors duration-150 hover:bg-app-surface-2/50",
          compact ? "px-4 py-3" : "px-5 py-4",
        )}
      >
        <Link
          href={`/opportunities/${item.id}`}
          className="flex min-w-0 flex-1 items-start gap-4"
        >
          <CompanyMark
            name={item.companyName}
            size={compact ? 38 : 46}
            className="shrink-0 rounded-app-md"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3
                className={cx(
                  "font-medium tracking-[-0.012em] text-app-text transition-colors duration-150 group-hover:text-app-accent",
                  compact ? "text-[0.9rem]" : "text-[1rem]",
                )}
              >
                {item.title}
              </h3>
              {risk !== null && risk >= 60 ? (
                <Badge tone="danger">Risk {Math.round(risk)}</Badge>
              ) : null}
              {item.eligibility && item.eligibility !== "unknown" ? (
                <Badge tone={eligibilityTone(item.eligibility)}>
                  {eligibilityLabel(item.eligibility)}
                </Badge>
              ) : null}
            </div>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8rem] text-app-soft">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Building2 size={12} className="text-app-muted" aria-hidden />
                {item.companyName}
              </span>
              {location ? (
                <>
                  <span aria-hidden className="text-app-muted/60">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-app-muted">
                    <Globe size={12} aria-hidden />
                    {location}
                  </span>
                </>
              ) : null}
              {item.salaryMin || item.salaryMax ? (
                <>
                  <span aria-hidden className="text-app-muted/60">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[0.74rem] text-app-muted">
                    <Wallet size={12} aria-hidden />
                    {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
                  </span>
                </>
              ) : null}
            </p>

            {!compact ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{titleCase(item.seniority)}</Badge>
                <Badge tone="info">{titleCase(item.workMode)}</Badge>
                {item.employmentType ? (
                  <Badge tone="neutral">{titleCase(item.employmentType)}</Badge>
                ) : null}
                {(item.skills ?? []).slice(0, 4).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-app-sm border border-app-border bg-app-surface-2/40 px-1.5 py-0.5 text-[0.7rem] text-app-muted"
                  >
                    {skill}
                  </span>
                ))}
                {(item.skills ?? []).length > 4 ? (
                  <span className="text-[0.7rem] text-app-muted">
                    +{item.skills.length - 4}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </Link>

        <div className="flex shrink-0 flex-col items-end gap-2 pl-1">
          <SaveToggle
            opportunityId={item.id}
            saved={saved}
            onChange={onSavedChange}
            label={saved ? "Saved" : "Save"}
          />
          {showScore && typeof score === "number" ? (
            <span className="text-right">
              <span className="block font-display text-[1.35rem] leading-none font-semibold tabular-nums text-app-text">
                {Math.round(score)}
              </span>
              <span className="font-mono text-[0.54rem] tracking-[0.16em] text-app-muted uppercase">
                match
              </span>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-[0.66rem] text-app-muted">
            <CalendarClock size={11} aria-hidden />
            {savedAt ? `Saved ${formatDate(savedAt)}` : relativeTime(item.postedAt)}
          </span>
          <ArrowUpRight
            size={15}
            className="hidden text-app-muted transition-colors duration-150 group-hover:text-app-accent sm:block"
            aria-hidden
          />
        </div>
      </div>
    </li>
  );
}
