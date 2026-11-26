"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Globe,
  LayoutGrid,
  ListFilter,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
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
} from "@/components/ui";
import { EmptySearchArt } from "@/components/app-art";
import { OpportunityRow } from "@/components/discovery/opportunity-row";
import { ProfessionFilter } from "@/components/discovery/profession-filter";
import { sceneForPath } from "@/lib/app-scenes";
import { useApi, useDebounced } from "@/lib/hooks";
import { titleCase } from "@/lib/format";
import type { ProfessionFacet, SavedOpportunity } from "@angisoft/mboqara-contracts";
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
  professions?: ProfessionFacet[];
}

interface SavedResponse {
  items: SavedOpportunity[];
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
 * The whole catalogue, newest first. Ranking is an optional second view:
 * useful for a final shortlist, but not what someone sees when they arrive
 * to find work. Filters live in the URL so a search can be shared and the
 * back button works.
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
  const [profession, setProfession] = useState(params.get("profession") ?? "");
  const [eligibility, setEligibility] = useState(params.get("eligibility") ?? "");
  const [semantic, setSemantic] = useState(params.get("semantic") === "true");
  // The full catalogue is the default. Ranking is a deliberate second step.
  const [ranked, setRanked] = useState(params.get("ranked") === "true");
  const [page, setPage] = useState(Number(params.get("page") ?? 1) || 1);
  const [pageSize, setPageSize] = useState(Number(params.get("size") ?? 24) || 24);
  const [compact, setCompact] = useState(params.get("view") === "compact");
  const [showFilters, setShowFilters] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const debounced = useDebounced(search, 350);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set("q", debounced);
    if (country) next.set("country", country);
    if (workMode) next.set("workMode", workMode);
    if (employmentType) next.set("employmentType", employmentType);
    if (seniority) next.set("seniority", seniority);
    if (profession) next.set("profession", profession);
    if (eligibility) next.set("eligibility", eligibility);
    if (semantic) next.set("semantic", "true");
    if (ranked) next.set("ranked", "true");
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
    profession,
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
      profession: profession || undefined,
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
      profession,
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
  const savedQuery = useApi<SavedResponse>("/feed/state/saved", { limit: 200 });

  useEffect(() => {
    if (savedQuery.data) {
      setSavedIds(
        new Set(savedQuery.data.items.map((entry) => entry.opportunity.id)),
      );
    }
  }, [savedQuery.data]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const profileValue = profile.data?.profile;
  const professions = facets.data?.professions ?? [];
  const professionLabel =
    professions.find((entry) => entry.slug === profession)?.name ?? profession;

  const setFilter = useCallback(
    (setter: (value: string) => void, value: string) => {
      setter(value);
      setPage(1);
    },
    [],
  );

  const updateSaved = useCallback((id: string, saved: boolean) => {
    setSavedIds((previous) => {
      const next = new Set(previous);
      if (saved) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const activeFilters = [
    profession && {
      label: `Profession: ${professionLabel}`,
      clear: () => setFilter(setProfession, ""),
    },
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
    setProfession("");
    setEligibility("");
    setSemantic(false);
    setPage(1);
  };

  // The constraints the ranked view applies silently. Naming them prevents a
  // short list from reading as an empty platform.
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
      <ProfessionFilter
        professions={professions}
        value={profession}
        loading={facets.loading}
        onChange={(value) => setFilter(setProfession, value)}
      />

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

  const scene = sceneForPath("/opportunities");

  return (
    <Page>
      <PageHeader
        eyebrow="Discovery"
        title="Opportunities"
        description="Every opening we monitor, newest first. Filter by profession, country and work mode, then save the roles worth a closer look."
        art={{ src: scene.src, alt: scene.alt, caption: scene.caption }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {offline ? <Badge tone="warning" dot>Offline cache</Badge> : null}
            <Link href="/saved">
              <Button variant="outline" size="sm" icon={<Bookmark size={14} />}>
                Saved roles
              </Button>
            </Link>
            <Button
              variant="ghost"
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
              variant="ghost"
              size="sm"
              icon={<Globe size={14} />}
              onClick={() => {
                setRanked(false);
                setPage(1);
              }}
            >
              Show the whole catalogue
            </Button>
          }
        >
          This is a ranked shortlist. Your profile's location, contract type and
          remote preference narrow the catalogue before ranking.
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
              Best match
            </Button>
          }
        >
          You are seeing every opening we monitor, newest first, without profile
          filters. Best match is a separate shortlist you can switch to at any time.
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
              label="View"
              size="sm"
              value={ranked ? "rank" : "all"}
              onChange={(value) => {
                setRanked(value === "rank");
                setPage(1);
              }}
              options={[
                { value: "all", label: "All roles" },
                { value: "rank", label: "Best match" },
              ]}
            />
            <SegmentedControl
              label="Density"
              size="sm"
              value={compact ? "compact" : "comfortable"}
              onChange={(value) => setCompact(value === "compact")}
              options={[
                {
                  value: "comfortable",
                  label: <ListFilter size={13} aria-label="Comfortable rows" />,
                },
                {
                  value: "compact",
                  label: <LayoutGrid size={13} aria-label="Compact rows" />,
                },
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
              description="Try widening the filters, or tell us a board we are missing and we will add it to monitoring."
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
                  ) : (
                    <Link href="/sources">
                      <Button size="sm" variant="ghost">
                        Suggest a source
                      </Button>
                    </Link>
                  )}
                </div>
              }
            />
          ) : (
            <>
              <Panel className="overflow-visible">
                <ul className="divide-y divide-app-border">
                  {items.map((item) => (
                    <OpportunityRow
                      key={item.id}
                      item={item}
                      compact={compact}
                      saved={savedIds.has(item.id)}
                      showScore={ranked}
                      onSavedChange={(value) => updateSaved(item.id, value)}
                    />
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
