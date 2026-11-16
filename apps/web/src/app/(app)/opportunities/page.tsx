"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  Compass,
  Globe,
  LayoutGrid,
  ListFilter,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  FilterGroup,
  FilterOption,
  FilterRail,
  Page,
  PageHeader,
  Pagination,
  Panel,
  ScopeBanner,
  SearchInput,
  SegmentedControl,
  Skeleton,
  cx,
} from "@/components/ui";
import { CompanyMark, EmptySearchArt } from "@/components/app-art";
import { useApi, useDebounced } from "@/lib/hooks";
import {
  eligibilityLabel,
  eligibilityTone,
  formatSalary,
  relativeTime,
  titleCase,
} from "@/lib/format";
import type { Opportunity, Profile } from "@/lib/types";

interface OpportunitiesResponse {
  items: Opportunity[];
  total: number;
}

interface FacetsResponse {
  countries: Array<{ country: string; count: number }>;
  workModes: Array<{ workMode: string; count: number }>;
  seniorities: Array<{ seniority: string; count: number }>;
  employmentTypes: Array<{ employmentType: string; count: number }>;
}

interface ProfileResponse {
  profile: Profile;
}

const PAGE_SIZE_OPTIONS = [24, 48, 96];

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
 * Two views of the same catalogue:
 *
 *   • "Best match" ranks every opening against the profile and applies the
 *     candidate's own constraints — employment type, geography, and the
 *     remote-only preference. That is the useful default, but it is also a
 *     filtered set, and a filtered set that says nothing about its own
 *     filter reads as an empty platform. The scope banner names the
 *     constraints and offers the whole catalogue in one click.
 *
 *   • "All roles" pages through the entire catalogue, unranked and
 *     unfiltered by the profile, for someone who wants to see the market
 *     rather than the shortlist.
 *
 * Filters live in the URL, so a search can be shared and the back button
 * works.
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
  // "ranked" pages the profile-matched feed; "all" pages the whole
  // catalogue. The default is ranked, because that is the point of the
  // product, but it is one click away from the alternative and the banner
  // says so.
  const [ranked, setRanked] = useState(params.get("ranked") !== "false");
  const [page, setPage] = useState(Number(params.get("page") ?? 1) || 1);
  const [pageSize, setPageSize] = useState(Number(params.get("size") ?? 24) || 24);
  const [compact, setCompact] = useState(params.get("view") === "compact");
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
    if (!ranked) next.set("ranked", "false");
    if (compact) next.set("view", "compact");
    if (pageSize !== 24) next.set("size", String(pageSize));
    if (page > 1) next.set("page", String(page));
    const suffix = next.toString();
    router.replace(suffix ? `/opportunities?${suffix}` : "/opportunities", {
      scroll: false,
    });
  }, [
    compact,
    country,
    debounced,
    eligibility,
    employmentType,
    page,
    pageSize,
    ranked,
    router,
    semantic,
    seniority,
    workMode,
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
      ranked: ranked ? "true" : "false",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [
      debounced,
      country,
      workMode,
      employmentType,
      seniority,
      eligibility,
      semantic,
      ranked,
      page,
      pageSize,
    ],
  );

  const { data, loading, error, offline, refresh } =
    useApi<OpportunitiesResponse>("/opportunities", query);
  const facets = useApi<FacetsResponse>("/opportunities/facets");
  const profile = useApi<ProfileResponse>("/profile");

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const profileValue = profile.data?.profile;

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

  const clearAll = () => {
    setCountry("");
    setWorkMode("");
    setSeniority("");
    setEmploymentType("");
    setEligibility("");
    setSemantic(false);
    setPage(1);
  };

  // The constraints the ranked feed is silently applying. Naming them is the
  // difference between "five roles" and "five roles that fit your profile,
  // out of thirty-nine thousand".
  const scopeConstraints = useMemo(() => {
    if (!profileValue) return [];
    const entries: Array<{ label: string; value: string }> = [];
    if (profileValue.location || profileValue.country) {
      entries.push({
        label: "Based in",
        value: [profileValue.location, profileValue.country].filter(Boolean).join(", "),
      });
    }
    if (profileValue.preferredCountries?.length || profileValue.preferredLocations?.length) {
      entries.push({
        label: "Open to",
        value: [
          ...(profileValue.preferredLocations ?? []),
          ...(profileValue.preferredCountries ?? []),
        ]
          .slice(0, 3)
          .join(", "),
      });
    }
    if (profileValue.employmentTypes?.length) {
      entries.push({
        label: "Contract",
        value: profileValue.employmentTypes.map(titleCase).join(", "),
      });
    }
    if (profileValue.remotePreferred) {
      entries.push({ label: "Work mode", value: "Remote only" });
    }
    return entries;
  }, [profileValue]);

  const filters = (
    <div className="flex flex-col gap-6">
      <FilterGroup label="Work mode">
        <div className="flex flex-col gap-0.5">
          {WORK_MODES.map((mode) => (
            <FilterOption
              key={mode.value}
              label={mode.label}
              active={workMode === mode.value}
              onClick={() =>
                setFilter(setWorkMode, workMode === mode.value ? "" : mode.value)
              }
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Level">
        <div className="flex flex-wrap gap-1.5">
          {SENIORITIES.map((level) => (
            <Chip
              key={level.value}
              active={seniority === level.value}
              onClick={() =>
                setFilter(setSeniority, seniority === level.value ? "" : level.value)
              }
            >
              {level.label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Employment">
        <div className="flex flex-wrap gap-1.5">
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
        </div>
      </FilterGroup>

      <FilterGroup label="Country">
        <div className="flex flex-col gap-0.5">
          {(facets.data?.countries ?? [])
            .filter((entry) => entry.country.length > 2)
            .slice(0, 16)
            .map((entry) => (
              <FilterOption
                key={entry.country}
                label={entry.country}
                count={entry.count}
                active={country === entry.country}
                onClick={() =>
                  setFilter(setCountry, country === entry.country ? "" : entry.country)
                }
              />
            ))}
          {facets.loading ? (
            <span className="px-1 py-2 text-[0.76rem] text-app-muted">Loading…</span>
          ) : null}
        </div>
      </FilterGroup>

      <FilterGroup label="Eligibility">
        <FilterOption
          label="Only roles I can hold"
          active={eligibility === "eligible"}
          onClick={() =>
            setFilter(setEligibility, eligibility === "eligible" ? "" : "eligible")
          }
        />
        <p className="px-1 text-[0.72rem] leading-relaxed text-app-muted">
          Removes postings that require a right to work you do not have.
        </p>
      </FilterGroup>

      {activeFilters.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={clearAll} className="self-start">
          Clear all filters
        </Button>
      ) : null}
    </div>
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Discovery"
        title="Opportunities"
        description="Every opening we monitor, ranked against your profile. Narrow the catalogue with filters, then work through it a page at a time."
        art={{
          src: "https://cdn.angisoft.co.ke/public/images/mboqara/careers/lagos-career-story.webp",
          alt: "A candidate researching roles from a cafe table",
          caption: "Ranked against your profile",
        }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {offline ? <Badge tone="warning" dot>Offline cache</Badge> : null}
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={refresh}
              loading={loading && items.length > 0}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {ranked ? (
        <ScopeBanner
          title={`${total.toLocaleString()} roles fit your profile`}
          constraints={scopeConstraints}
          action={
            <Button
              variant="outline"
              size="sm"
              icon={<Globe size={14} />}
              onClick={() => {
                setRanked(false);
                setPage(1);
              }}
            >
              Browse the whole catalogue
            </Button>
          }
        >
          Your ranked feed applies the filters in your profile — where you are
          based, the contract types you will take, and whether you only work
          remotely. Switch to the full catalogue to see every opening we
          monitor, ranked by date instead.
        </ScopeBanner>
      ) : (
        <ScopeBanner
          title={`${total.toLocaleString()} roles in the catalogue`}
          constraints={[]}
          action={
            <Button
              variant="outline"
              size="sm"
              icon={<Sparkles size={14} />}
              onClick={() => {
                setRanked(true);
                setPage(1);
              }}
            >
              Back to ranked for me
            </Button>
          }
        >
          You are looking at every opening we monitor, newest first, without
          the profile filters applied. Turn ranking back on to see only the
          roles that fit your skills, location and seniority.
        </ScopeBanner>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[264px_minmax(0,1fr)] xl:gap-8">
        <FilterRail>{filters}</FilterRail>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
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
              className="lg:hidden"
            >
              Filters{activeFilters.length ? ` (${activeFilters.length})` : ""}
            </Button>
            <SegmentedControl
              label="Sort"
              size="sm"
              value={ranked ? "rank" : "semantic"}
              onChange={(value) => {
                if (value === "rank") {
                  setRanked(true);
                  setSemantic(false);
                } else {
                  setRanked(false);
                  setSemantic(false);
                }
                setPage(1);
              }}
              options={[
                { value: "rank", label: "Best match" },
                { value: "semantic", label: "All roles" },
              ]}
            />
            <SegmentedControl
              label="Density"
              size="sm"
              value={compact ? "compact" : "comfortable"}
              onChange={(value) => setCompact(value === "compact")}
              options={[
                { value: "comfortable", label: <ListFilter size={13} aria-label="Comfortable rows" /> },
                { value: "compact", label: <LayoutGrid size={13} aria-label="Compact rows" /> },
              ]}
            />
          </div>

          {showFilters ? (
            <Panel className="p-5 lg:hidden">{filters}</Panel>
          ) : null}

          {activeFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  onClick={filter.clear}
                  className="inline-flex items-center gap-1.5 rounded-app-pill border border-app-accent/30 bg-app-accent-soft px-2.5 py-1 text-[0.74rem] font-medium text-app-accent transition-colors duration-150 hover:border-app-accent/60"
                >
                  {filter.label}
                  <X size={12} aria-hidden />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-[0.74rem] text-app-muted underline underline-offset-2 transition-colors hover:text-app-text"
              >
                Clear all
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-app-md border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-[0.86rem] text-app-danger">
              {error}
            </div>
          ) : null}

          {loading && items.length === 0 ? (
            <Panel className="divide-y divide-app-border">
              {Array.from({ length: 8 }).map((_, row) => (
                <div key={row} className="flex items-center gap-4 px-5 py-5">
                  <Skeleton height={48} width={48} className="rounded-app-md" />
                  <div className="flex-1">
                    <Skeleton height={15} width="42%" />
                    <div className="mt-2.5 flex gap-2">
                      <Skeleton height={11} width="18%" />
                      <Skeleton height={11} width="14%" />
                      <Skeleton height={11} width="22%" />
                    </div>
                  </div>
                  <Skeleton height={30} width={56} />
                </div>
              ))}
            </Panel>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<EmptySearchArt />}
              title="No roles matched"
              description="Try widening the filters, switch to the full catalogue, or tell us a board we are missing and we will add it to monitoring."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {activeFilters.length > 0 ? (
                    <Button size="sm" variant="outline" onClick={clearAll}>
                      Clear filters
                    </Button>
                  ) : null}
                  {ranked ? (
                    <Button size="sm" onClick={() => setRanked(false)}>
                      Browse all roles
                    </Button>
                  ) : null}
                  <Link href="/sources">
                    <Button size="sm" variant="ghost">
                      Suggest a source
                    </Button>
                  </Link>
                </div>
              }
            />
          ) : (
            <>
              <Panel className="overflow-visible">
                <ul className="divide-y divide-app-border">
                  {items.map((item) => (
                    <OpportunityRow key={item.id} item={item} compact={compact} ranked={ranked} />
                  ))}
                </ul>
              </Panel>

              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

function OpportunityRow({
  item,
  compact,
  ranked,
}: {
  item: Opportunity;
  compact: boolean;
  ranked: boolean;
}) {
  const score = item.match?.score;
  const risk = item.riskScore ?? null;

  return (
    <li>
      <Link
        href={`/opportunities/${item.id}`}
        className={cx(
          "group flex items-start gap-4 transition-colors duration-150 hover:bg-app-surface-2/50",
          compact ? "px-4 py-3" : "px-5 py-4",
        )}
      >
        <CompanyMark
          name={item.companyName}
          size={compact ? 38 : 46}
          className="rounded-app-md"
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
              <Building2 size={12} className="text-app-muted" />
              {item.companyName}
            </span>
            <span aria-hidden className="text-app-muted/60">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 text-app-muted">
              <Globe size={12} />
              {item.city ? `${item.city}, ` : ""}
              {item.country}
            </span>
            {item.salaryMin || item.salaryMax ? (
              <>
                <span aria-hidden className="text-app-muted/60">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[0.74rem] text-app-muted">
                  <Wallet size={12} />
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
              {item.skills?.slice(0, 4).map((skill) => (
                <span
                  key={skill}
                  className="rounded-app-sm border border-app-border bg-app-surface-2/40 px-1.5 py-0.5 text-[0.7rem] text-app-muted"
                >
                  {skill}
                </span>
              ))}
              {item.skills && item.skills.length > 4 ? (
                <span className="text-[0.7rem] text-app-muted">
                  +{item.skills.length - 4}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 pl-2">
          {ranked && typeof score === "number" ? (
            <>
              <span
                className={cx(
                  "font-display font-semibold tabular-nums text-app-text",
                  compact ? "text-[1.25rem] leading-none" : "text-[1.55rem] leading-none",
                )}
              >
                {Math.round(score)}
              </span>
              <span className="font-mono text-[0.54rem] tracking-[0.16em] text-app-muted uppercase">
                match
              </span>
            </>
          ) : (
            <span className="font-mono text-[0.72rem] text-app-muted">
              {item.country.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="mt-1 inline-flex items-center gap-1 text-[0.66rem] text-app-muted">
            <CalendarClock size={11} />
            {relativeTime(item.postedAt)}
          </span>
        </div>

        <ArrowUpRight
          size={16}
          className="mt-1 hidden shrink-0 text-app-muted transition-colors duration-150 group-hover:text-app-accent sm:block"
        />
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
