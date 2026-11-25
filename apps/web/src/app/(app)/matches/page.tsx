"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, MapPin, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Page,
  Pagination,
  Panel,
  SearchInput,
  SegmentedControl,
  Skeleton,
  StatStrip,
  Toolbar,
  cx,
} from "@/components/ui";
import { CompanyMark, EmptySearchArt, HeroSplit } from "@/components/app-art";
import { useApi, useDebounced } from "@/lib/hooks";
import { formatSalary, relativeTime, titleCase } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

interface MatchesResponse {
  items: Opportunity[];
  total: number;
}

const PAGE_SIZE = 20;

/**
 * The ranked feed.
 *
 * Ranking happens on the API over the whole catalogue, and this page moves
 * through that pool a page at a time. The count on the page is the count of
 * the pool, so the number and the pager agree.
 */
function MatchesPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [search, setSearch] = useState(params.get("q") ?? "");
  const [mode, setMode] = useState<"rank" | "semantic">(
    params.get("semantic") === "true" ? "semantic" : "rank",
  );
  const [page, setPage] = useState(Number(params.get("page") ?? 1) || 1);
  const debounced = useDebounced(search, 350);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set("q", debounced);
    if (mode === "semantic") next.set("semantic", "true");
    if (page > 1) next.set("page", String(page));
    const suffix = next.toString();
    router.replace(suffix ? `/matches?${suffix}` : "/matches", { scroll: false });
  }, [debounced, mode, page, router]);

  const query = useMemo(
    () => ({
      q: debounced || undefined,
      semantic: mode === "semantic" ? "true" : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [debounced, mode, page],
  );

  const { data, loading, error, refresh } = useApi<MatchesResponse>("/matches", query);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const strong = items.filter((item) => (item.match?.score ?? 0) >= 80).length;
  const average = items.length
    ? Math.round(items.reduce((sum, item) => sum + (item.match?.score ?? 0), 0) / items.length)
    : 0;
  const remote = items.filter((item) => item.workMode === "remote").length;

  return (
    <Page>
      <HeroSplit
        src="https://cdn1.angisoft.co.ke/mboqara/images/mboqara/careers/engineering-professional.webp"
        alt="An engineer working at a laptop"
        eyebrow="Ranking"
        priority
        title="Your best matches"
        description="Skills, location, work mode and seniority shape each role's fit score. Every score is explained, so you can see why a role is high — and what would move it."
        actions={
          <Button variant="outline" size="sm" onClick={refresh}>
            Re-rank
          </Button>
        }
        stats={[
          {
            label: "Ranked roles",
            value: loading && items.length === 0 ? "—" : total.toLocaleString(),
            hint: "in the pool",
          },
          {
            label: "Strong fits",
            value: items.length ? strong.toLocaleString() : "—",
            hint: "scoring 80+",
          },
          {
            label: "Average score",
            value: items.length ? average : "—",
            hint: "on this page",
          },
          {
            label: "Remote",
            value: items.length ? remote.toLocaleString() : "—",
            hint: "on this page",
          },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="font-mono text-[0.56rem] tracking-[0.18em] text-app-muted uppercase">
              {stat.label}
            </dt>
            <dd className="mt-1.5 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums text-app-text">
              {stat.value}
            </dd>
            <dd className="mt-1 text-[0.7rem] text-app-muted">{stat.hint}</dd>
          </div>
        ))}
      />

      <StatStrip
        items={[
          {
            label: "Pool",
            value: loading && items.length === 0 ? "…" : total.toLocaleString(),
            hint: "roles ranked against your profile",
          },
          {
            label: "Page",
            value: page.toLocaleString(),
            hint: `of ${Math.max(1, Math.ceil(total / PAGE_SIZE)).toLocaleString()}`,
          },
          {
            label: "Mode",
            value: mode === "semantic" ? "Semantic" : "Rule-based",
            hint: mode === "semantic" ? "meaning, not keywords" : "skills and location",
          },
        ]}
      />

      <Toolbar className="border-t-0 pt-0">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search within your matches"
          className="min-w-[220px] flex-1"
        />
        <SegmentedControl
          label="Ranking mode"
          value={mode}
          onChange={(value) => {
            setMode(value);
            setPage(1);
          }}
          options={[
            { value: "rank", label: "Rule-based" },
            { value: "semantic", label: "Semantic" },
          ]}
        />
      </Toolbar>

      {error ? (
        <div className="rounded-app-md border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-[0.86rem] text-app-danger">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <Panel className="divide-y divide-app-border">
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="flex items-start gap-4 px-5 py-5">
              <Skeleton height={48} width={48} className="rounded-app-md" />
              <div className="flex-1">
                <Skeleton height={16} width="46%" />
                <div className="mt-2.5 flex gap-2">
                  <Skeleton height={11} width="18%" />
                  <Skeleton height={11} width="24%" />
                  <Skeleton height={11} width="14%" />
                </div>
              </div>
              <Skeleton height={34} width={34} />
            </div>
          ))}
        </Panel>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<EmptySearchArt />}
          title="No matches yet"
          description="Fill in your profile and we will rank every opportunity we monitor against it."
          action={
            <Link href="/profile">
              <Button size="sm">Complete profile</Button>
            </Link>
          }
        />
      ) : (
        <>
          <Panel>
            <ul className="divide-y divide-app-border">
              {items.map((item) => (
                <li key={item.id}>
                  <MatchRow item={item} />
                </li>
              ))}
            </ul>
          </Panel>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </Page>
  );
}

function MatchRow({ item }: { item: Opportunity }) {
  const score = Math.round(item.match?.score ?? 0);
  const gaps = item.match?.gaps ?? [];

  return (
    <Link
      href={`/opportunities/${item.id}`}
      className="group flex items-start gap-4 px-4 py-4 transition-colors duration-150 hover:bg-app-surface-2/40 sm:gap-5 sm:px-5"
    >
      <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-app-border pr-3 sm:pr-4">
        <span
          className={cx(
            "font-display text-[1.75rem] leading-none font-semibold tabular-nums",
            score >= 80 ? "text-app-success" : score >= 60 ? "text-app-text" : "text-app-warning",
          )}
        >
          {score}
        </span>
        <span className="font-mono text-[0.52rem] tracking-[0.14em] text-app-muted uppercase">
          match
        </span>
        <span
          aria-hidden
          className={cx(
            "mt-1 h-[3px] w-8 overflow-hidden rounded-full bg-app-surface-2",
          )}
        >
          <span
            className={cx(
              "block h-full rounded-full",
              score >= 80 ? "bg-app-success" : score >= 60 ? "bg-app-accent" : "bg-app-warning",
            )}
            style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
          />
        </span>
      </div>

      <CompanyMark
        name={item.companyName}
        size={40}
        className="mt-0.5 hidden rounded-app-md sm:grid"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[1rem] leading-snug font-medium tracking-[-0.01em] text-app-text group-hover:text-app-accent">
              {item.title}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.78rem] text-app-soft">
              <span className="font-medium">{item.companyName}</span>
              <span aria-hidden className="text-app-muted">
                ·
              </span>
              <span className="inline-flex items-center gap-1 text-app-muted">
                <MapPin size={12} />
                {item.city ? `${item.city}, ` : ""}
                {item.country}
              </span>
              <span aria-hidden className="text-app-muted">
                ·
              </span>
              <span className="font-mono text-[0.72rem] text-app-muted">
                {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
              </span>
            </p>
          </div>
          <ArrowUpRight
            size={15}
            className="hidden shrink-0 text-app-muted transition-colors duration-150 group-hover:text-app-accent sm:block"
          />
        </div>

        {item.match?.explanation ? (
          <p className="mt-2.5 max-w-[80ch] border-l-2 border-app-border pl-3 text-[0.82rem] leading-relaxed text-app-soft">
            {item.match.explanation}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{titleCase(item.seniority)}</Badge>
          <Badge tone="info">{titleCase(item.workMode)}</Badge>
          {item.skills?.slice(0, 4).map((skill) => (
            <span
              key={skill}
              className="rounded-app-sm border border-app-border bg-app-surface-2/40 px-1.5 py-0.5 text-[0.7rem] text-app-muted"
            >
              {skill}
            </span>
          ))}
          {gaps.length === 0 ? <Badge tone="success" dot>No gaps</Badge> : null}
          {gaps.slice(0, 3).map((gap) => (
            <Badge key={gap} tone="warning">
              {gap}
            </Badge>
          ))}
          <span className="ml-auto font-mono text-[0.66rem] text-app-muted">
            {relativeTime(item.postedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function MatchesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2.5">
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      }
    >
      <MatchesPageInner />
    </Suspense>
  );
}
