"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, MapPin, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MatchRing,
  Pagination,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Skeleton,
  cx,
} from "@/components/ui";
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
 * Ranking happens on the API over a pool of the newest matching roles, and
 * this page moves through that pool a page at a time. The count on the page
 * is the count of the pool, so the number and the pager agree.
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Ranking"
        title="Your best matches"
        description="Skills, location, work mode and seniority shape each role's fit score. Every score is explained."
        actions={
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
        }
        meta={
          <p className="text-[0.84rem] text-app-muted">
            {loading && items.length === 0
              ? "Ranking every monitored role…"
              : `${total.toLocaleString()} ranked role${total === 1 ? "" : "s"} · page ${page}`}
          </p>
        }
      />

      <section className="rounded-app-lg border border-app-border bg-app-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
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
        </div>
      </section>

      {error ? (
        <div className="rounded-app-lg border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-[0.86rem] text-app-danger">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="flex flex-col gap-2.5">
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={26} />}
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
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <MatchRow item={item} />
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function MatchRow({ item }: { item: Opportunity }) {
  const score = item.match?.score ?? 0;
  const gaps = item.match?.gaps ?? [];

  return (
    <Link
      href={`/opportunities/${item.id}`}
      className={cx(
        "group block rounded-app-lg border border-app-border bg-app-surface p-4",
        "transition-[border-color,transform,box-shadow] duration-200",
        "hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-md",
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <MatchRing score={score} size={56} />

        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{titleCase(item.seniority)}</Badge>
            <Badge tone="info">{titleCase(item.workMode)}</Badge>
            {gaps.length === 0 ? <Badge tone="success">No gaps</Badge> : null}
          </div>

          <h3 className="mt-2 text-[1rem] font-semibold text-app-text">{item.title}</h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.81rem] text-app-muted">
            <span>{item.companyName}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} />
              {item.city ? `${item.city}, ` : ""}
              {item.country}
            </span>
            <span className="font-mono text-[0.76rem]">
              {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
            </span>
            <span>{relativeTime(item.postedAt)}</span>
          </div>

          {item.match?.explanation ? (
            <p className="mt-2 line-clamp-2 text-[0.8rem] leading-relaxed text-app-soft">
              {item.match.explanation}
            </p>
          ) : null}

          {gaps.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[0.7rem] font-semibold tracking-[0.08em] text-app-muted uppercase">
                Gaps
              </span>
              {gaps.slice(0, 3).map((gap) => (
                <Badge key={gap} tone="warning">
                  {gap}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <ArrowUpRight
          size={16}
          className="shrink-0 text-app-muted transition-colors duration-150 group-hover:text-app-accent"
        />
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
