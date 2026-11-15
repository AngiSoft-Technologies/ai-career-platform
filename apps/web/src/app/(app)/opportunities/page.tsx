"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Briefcase,
  Compass,
  Globe2,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import {
  Badge,
  Button,
  Chip,
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
import {
  eligibilityLabel,
  eligibilityTone,
  formatSalary,
  relativeTime,
  titleCase,
} from "@/lib/format";
import type { Opportunity } from "@/lib/types";

interface OpportunitiesResponse {
  items: Opportunity[];
  total: number;
}

interface FacetsResponse {
  countries: Array<{ country: string; count: number }>;
}

const PAGE_SIZE = 24;

const WORK_MODES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On site" },
] as const;

const SENIORITIES = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
] as const;

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "industrial_attachment", label: "Attachment" },
  { value: "trainee", label: "Trainee" },
  { value: "freelance", label: "Freelance" },
] as const;

/**
 * The feed of every role the platform monitors, ranked for the person
 * looking at it.
 *
 * Two things it has to do well: say how many roles there are (a thousand
 * of them is the normal case, not an edge case) and let the person move
 * through them. The pager counts the ranked set, the filters are in the
 * URL so a search can be shared and the back button works, and the country
 * list comes from the catalogue rather than from the page in front of the
 * reader.
 */
function OpportunitiesPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [search, setSearch] = useState(params.get("q") ?? "");
  const [country, setCountry] = useState(params.get("country") ?? "");
  const [workMode, setWorkMode] = useState(params.get("workMode") ?? "");
  const [employmentType, setEmploymentType] = useState(
    params.get("employmentType") ?? "",
  );
  const [seniority, setSeniority] = useState(params.get("seniority") ?? "");
  const [eligibility, setEligibility] = useState(params.get("eligibility") ?? "");
  const [semantic, setSemantic] = useState(params.get("semantic") === "true");
  const [page, setPage] = useState(Number(params.get("page") ?? 1) || 1);
  const [showFilters, setShowFilters] = useState(false);

  const debounced = useDebounced(search, 350);

  // The filters and the page live in the URL: a search is a thing people
  // share, and the back button has to work.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set("q", debounced);
    if (country) next.set("country", country);
    if (workMode) next.set("workMode", workMode);
    if (employmentType) next.set("employmentType", employmentType);
    if (seniority) next.set("seniority", seniority);
    if (eligibility) next.set("eligibility", eligibility);
    if (semantic) next.set("semantic", "true");
    if (page > 1) next.set("page", String(page));
    const suffix = next.toString();
    router.replace(suffix ? `/opportunities?${suffix}` : "/opportunities", {
      scroll: false,
    });
  }, [
    country,
    debounced,
    router,
    semantic,
    seniority,
    workMode,
    employmentType,
    eligibility,
    page,
  ]);

  const query = useMemo(
    () => ({
      q: debounced || undefined,
      country: country || undefined,
      workMode: workMode || undefined,
      employmentType: employmentType || undefined,
      seniority: seniority || undefined,
      eligibility: eligibility || undefined,
      semantic: semantic ? "true" : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [
      debounced,
      country,
      workMode,
      employmentType,
      seniority,
      eligibility,
      semantic,
      page,
    ],
  );

  const { data, loading, error, offline, refresh } =
    useApi<OpportunitiesResponse>("/opportunities", query);
  const facets = useApi<FacetsResponse>("/opportunities/facets");

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A filter change invalidates the page: page nine of the old result set
  // is not page nine of the new one.
  const setFilter = useCallback(
    (setter: (value: string) => void, value: string) => {
      setter(value);
      setPage(1);
    },
    [],
  );

  const activeFilters = [
    country && { label: country, clear: () => setFilter(setCountry, "") },
    workMode && {
      label: titleCase(workMode),
      clear: () => setFilter(setWorkMode, ""),
    },
    seniority && {
      label: titleCase(seniority),
      clear: () => setFilter(setSeniority, ""),
    },
    employmentType && {
      label: titleCase(employmentType),
      clear: () => setFilter(setEmploymentType, ""),
    },
    eligibility === "eligible" && {
      label: "Open to me",
      clear: () => setFilter(setEligibility, ""),
    },
    semantic && {
      label: "Semantic search",
      clear: () => setSemantic(false),
    },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Discovery"
        title="Opportunities"
        description="Every opening we monitor, ranked against your profile. Filter it, then work through it a page at a time."
        actions={
          <div className="flex items-center gap-2">
            {offline ? <Badge tone="warning">Offline cache</Badge> : null}
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={refresh}
            >
              Refresh
            </Button>
          </div>
        }
        meta={
          <p className="text-[0.84rem] text-app-muted">
            {loading && items.length === 0
              ? "Searching the catalogue…"
              : total === 0
                ? "No roles match these filters"
                : `${total.toLocaleString()} role${total === 1 ? "" : "s"} matched · page ${page} of ${pages}`}
          </p>
        }
      />

      <section className="rounded-app-lg border border-app-border bg-app-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-app-border p-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Role title, skill or company"
            className="min-w-[220px] flex-1"
          />
          <Button
            variant={showFilters ? "primary" : "outline"}
            size="sm"
            icon={<SlidersHorizontal size={14} />}
            onClick={() => setShowFilters((value) => !value)}
          >
            Filters
          </Button>
          <SegmentedControl
            label="Sort"
            value={semantic ? "semantic" : "rank"}
            onChange={(value) => {
              setSemantic(value === "semantic");
              setPage(1);
            }}
            options={[
              { value: "rank", label: "Best match" },
              { value: "semantic", label: "Semantic" },
            ]}
          />
        </div>

        {showFilters ? (
          <div className="flex flex-col gap-4 p-4">
            <FilterGroup label="Work mode">
              {WORK_MODES.map((mode) => (
                <Chip
                  key={mode.value}
                  active={workMode === mode.value}
                  onClick={() =>
                    setFilter(
                      setWorkMode,
                      workMode === mode.value ? "" : mode.value,
                    )
                  }
                >
                  {mode.label}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Level">
              {SENIORITIES.map((level) => (
                <Chip
                  key={level.value}
                  active={seniority === level.value}
                  onClick={() =>
                    setFilter(
                      setSeniority,
                      seniority === level.value ? "" : level.value,
                    )
                  }
                >
                  {level.label}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Employment type">
              {EMPLOYMENT_TYPES.map((type) => (
                <Chip
                  key={type.value}
                  active={employmentType === type.value}
                  onClick={() =>
                    setFilter(
                      setEmploymentType,
                      employmentType === type.value ? "" : type.value,
                    )
                  }
                >
                  {type.label}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Country">
              {(facets.data?.countries ?? []).slice(0, 12).map((entry) => (
                <Chip
                  key={entry.country}
                  active={country === entry.country}
                  onClick={() =>
                    setFilter(
                      setCountry,
                      country === entry.country ? "" : entry.country,
                    )
                  }
                >
                  {entry.country}
                  <span className="text-[0.68rem] text-app-muted">
                    {entry.count.toLocaleString()}
                  </span>
                </Chip>
              ))}
              {facets.loading ? (
                <span className="text-[0.78rem] text-app-muted">Loading…</span>
              ) : null}
            </FilterGroup>

            <FilterGroup label="Eligibility">
              <Chip
                active={eligibility === "eligible"}
                onClick={() =>
                  setFilter(
                    setEligibility,
                    eligibility === "eligible" ? "" : "eligible",
                  )
                }
              >
                Open to me
              </Chip>
              <span className="text-[0.76rem] text-app-muted">
                The question the product exists to answer: twenty thousand of
                the catalogue&apos;s roles are in Germany or the United
                States, and a candidate who cannot hold them has no use for
                them.
              </span>
            </FilterGroup>
          </div>
        ) : null}

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-app-border px-4 py-3">
            <span className="text-[0.74rem] font-semibold tracking-[0.1em] text-app-muted uppercase">
              Filtering by
            </span>
            {activeFilters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={filter.clear}
                className="inline-flex items-center gap-1.5 rounded-full border border-app-accent/40 bg-app-accent-soft px-2.5 py-1 text-[0.75rem] font-medium text-app-accent transition-colors duration-150 hover:border-app-accent/70"
              >
                {filter.label}
                <span aria-hidden>×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCountry("");
                setWorkMode("");
                setSeniority("");
                setEmploymentType("");
                setEligibility("");
                setSemantic(false);
                setPage(1);
              }}
              className="text-[0.75rem] text-app-muted underline underline-offset-2 hover:text-app-soft"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-app-lg border border-app-danger/40 bg-app-danger/8 px-4 py-3 text-[0.86rem] text-app-danger">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="flex flex-col gap-2.5">
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Compass size={26} />}
          title="No roles matched"
          description="Try widening the filters, or tell us a board we are missing and we will add it to monitoring."
          action={
            <Link href="/sources">
              <Button size="sm" variant="outline">
                Suggest a source
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <OpportunityRow key={item.id} item={item} />
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-[0.72rem] font-semibold tracking-[0.1em] text-app-muted uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function OpportunityRow({ item }: { item: Opportunity }) {
  const score = item.match?.score;
  const risk = item.riskScore ?? null;

  return (
    <li>
      <Link
        href={`/opportunities/${item.id}`}
        className={cx(
          "group block rounded-app-lg border border-app-border bg-app-surface p-4",
          "transition-[border-color,transform,box-shadow] duration-200",
          "hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-md",
        )}
      >
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{titleCase(item.seniority)}</Badge>
              <Badge tone="info">{titleCase(item.workMode)}</Badge>
              {item.employmentType ? (
                <Badge tone="neutral">{titleCase(item.employmentType)}</Badge>
              ) : null}
              {item.eligibility && item.eligibility !== "unknown" ? (
                <Badge tone={eligibilityTone(item.eligibility)}>
                  {eligibilityLabel(item.eligibility)}
                </Badge>
              ) : null}
              {risk !== null && risk >= 60 ? (
                <Badge tone="danger">Risk {Math.round(risk)}</Badge>
              ) : null}
            </div>

            <h3 className="mt-2 text-[1rem] font-semibold text-app-text">
              {item.title}
            </h3>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.82rem] text-app-muted">
              <span className="inline-flex items-center gap-1.5">
                <Briefcase size={13} />
                {item.companyName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13} />
                {item.city ? `${item.city}, ` : ""}
                {item.country}
              </span>
              <span className="font-mono text-[0.78rem]">
                {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
              </span>
              <span>{relativeTime(item.postedAt)}</span>
            </div>

            {item.skills?.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {item.skills.slice(0, 6).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-app-sm border border-app-border bg-app-surface-2/70 px-1.5 py-0.5 text-[0.72rem] text-app-soft"
                  >
                    {skill}
                  </span>
                ))}
                {item.skills.length > 6 ? (
                  <span className="px-1 py-0.5 text-[0.72rem] text-app-muted">
                    +{item.skills.length - 6} more
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-4">
            {typeof score === "number" ? (
              <div className="flex flex-col items-center">
                <MatchRing score={score} size={54} />
                <span className="mt-1 text-[0.66rem] font-semibold tracking-[0.1em] text-app-muted uppercase">
                  match
                </span>
              </div>
            ) : (
              <div className="flex w-14 flex-col items-center">
                <span className="font-mono text-[1.35rem] font-bold text-app-soft">
                  {item.country.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-app-muted uppercase">
                  global
                </span>
              </div>
            )}
            <ArrowUpRight
              size={16}
              className="text-app-muted transition-colors duration-150 group-hover:text-app-accent"
            />
          </div>
        </div>
      </Link>
    </li>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2.5">
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
      }
    >
      <OpportunitiesPageInner />
    </Suspense>
  );
}
