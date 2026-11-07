"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState , Suspense } from "react";
import { Briefcase, Compass, Filter, MapPin, RefreshCw, Search } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  MatchRing,
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

const WORK_MODES = ["remote", "hybrid", "onsite"];
const SENIORITIES = ["intern", "junior", "mid", "senior", "lead"];
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "industrial_attachment", "trainee", "freelance"];

function OpportunitiesPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [country, setCountry] = useState(params.get("country") ?? "");
  const [workMode, setWorkMode] = useState(params.get("workMode") ?? "");
  const [employmentType, setEmploymentType] = useState(params.get("employmentType") ?? "");
  const [seniority, setSeniority] = useState(params.get("seniority") ?? "");
  const [eligibility, setEligibility] = useState(params.get("eligibility") ?? "");
  const [semantic, setSemantic] = useState(false);

  const debounced = useDebounced(search);
  const query = useMemo(
    () => ({
      q: debounced || undefined,
      country: country || undefined,
      workMode: workMode || undefined,
      employmentType: employmentType || undefined,
      seniority: seniority || undefined,
      eligibility: eligibility || undefined,
      semantic: semantic ? "true" : undefined,
      limit: 40,
    }),
    [debounced, country, workMode, employmentType, seniority, eligibility, semantic],
  );

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set("q", debounced);
    if (country) next.set("country", country);
    if (workMode) next.set("workMode", workMode);
    if (employmentType) next.set("employmentType", employmentType);
    if (seniority) next.set("seniority", seniority);
    if (eligibility) next.set("eligibility", eligibility);
    if (semantic) next.set("semantic", "true");
    const suffix = next.toString();
    router.replace(suffix ? `/opportunities?${suffix}` : "/opportunities", { scroll: false });
  }, [country, debounced, router, semantic, seniority, workMode, employmentType, eligibility]);

  const { data, loading, error, offline, refresh } = useApi<OpportunitiesResponse>(
    "/opportunities",
    query,
  );

  const items = data?.items ?? [];
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(item.country);
    return [...set].sort();
  }, [items]);

  const toggle = (key: string, value: string, setter: (value: string) => void) => {
    setter(key === value ? "" : value);
  };

  return (
    <div className="stack gap-[1.2rem]">
      <div className="row row-wrap justify-between items-end">
        <div>
          <div className="eyebrow">Discovery</div>
          <h1 className="display mt-1" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)" }}>
            Opportunities
          </h1>
          <p className="text-muted text-[0.9rem] mt-1">
            {loading ? "Searching…" : `${items.length} roles · global coverage, every profession`}
          </p>
        </div>
        <div className="row gap-2">
          {offline ? <Badge tone="warning">Offline cache</Badge> : null}
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="stack gap-[0.8rem]">
          <div
            className="row"
            style={{
              gap: "0.5rem",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "0.55rem 0.8rem",
            }}
          >
            <Search size={16} className="text-muted" />
            <input
              className="opportunity-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  router.push(`/opportunities?q=${encodeURIComponent(search)}`);
                }
              }}
              placeholder="Role title, skill, company…"
              aria-label="Search opportunities"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                width: "100%",
                fontSize: "0.92rem",
                fontFamily: "var(--font-body)",
              }}
            />
          </div>

          <div className="row row-wrap gap-1.5">
            <span className="eyebrow" style={{ marginRight: "0.3rem" }}>
              <Filter size={12} className="align-[-1px]" /> Mode
            </span>
            {WORK_MODES.map((mode) => (
              <Chip
                key={mode}
                active={workMode === mode}
                onClick={() => toggle("workMode", mode, setWorkMode)}
              >
                {titleCase(mode)}
              </Chip>
            ))}
            <span className="eyebrow " style={{ margin: "0 0.3rem 0 0.8rem" }}>
              Level
            </span>
            {SENIORITIES.map((level) => (
              <Chip
                key={level}
                active={seniority === level}
                onClick={() => toggle("seniority", level, setSeniority)}
              >
                {titleCase(level)}
              </Chip>
            ))}
            {countries.length > 0 ? (
              <>
                <span className="eyebrow " style={{ margin: "0 0.3rem 0 0.8rem" }}>
                  Country
                </span>
                {countries.slice(0, 8).map((item) => (
                  <Chip
                    key={item}
                    active={country === item}
                    onClick={() => toggle("country", item, setCountry)}
                  >
                    {item}
                  </Chip>
                ))}
              </>
            ) : null}
            <span className="eyebrow " style={{ margin: "0 0.3rem 0 0.8rem" }}>
              Employment Type
            </span>
            {EMPLOYMENT_TYPES.map((type) => (
              <Chip
                key={type}
                active={employmentType === type}
                onClick={() => toggle("employmentType", type, setEmploymentType)}
              >
                {titleCase(type)}
              </Chip>
            ))}
            <span className="spacer" />
            <Chip active={semantic} onClick={() => setSemantic((value) => !value)}>
              Semantic AI search
            </Chip>
            {/* The question the product exists to answer, as a filter.
                Twenty thousand of the catalogue's roles are in Germany
                or the United States, and a candidate who cannot hold
                them has no use for them. */}
            <span className="eyebrow " style={{ margin: "0 0.3rem 0 0.8rem" }}>
              You can hold
            </span>
            <Chip
              active={eligibility === "eligible"}
              onClick={() => toggle("eligibility", "eligible", setEligibility)}
            >
              Open to me
            </Chip>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="p-4">
          <p style={{ fontSize: "0.88rem", color: "var(--danger)" }}>{error}</p>
        </Card>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="stack">
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Compass size={28} />}
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
        <div className="stack" style={{ gap: "0.7rem" }}>
          {items.map((item) => (
            <OpportunityRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpportunityRow({ item }: { item: Opportunity }) {
  const score = item.match?.score;
  const risk = item.riskScore ?? null;

  return (
    <Link href={`/opportunities/${item.id}`} className="surface-hover">
      <div
        className="surface"
        style={{
          padding: "0.95rem 1.05rem",
          display: "flex",
          gap: "1rem",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div className="flex-1" style={{ minWidth: 240 }}>
          <div className="row row-wrap" style={{ gap: "0.45rem", marginBottom: 4 }}>
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
            {risk !== null && risk >= 60 ? <Badge tone="danger">Risk {Math.round(risk)}</Badge> : null}
          </div>
          <h3 className="text-[1rem]">{item.title}</h3>
          <div
            className="row row-wrap"
            style={{ gap: "0.7rem", marginTop: 5, fontSize: "0.82rem", color: "var(--text-muted)" }}
          >
            <span className="row gap-1.5">
              <Briefcase size={13} /> {item.companyName}
            </span>
            <span className="row gap-1.5">
              <MapPin size={13} /> {item.city ? `${item.city}, ` : ""}
              {item.country}
            </span>
            <span className="mono">{formatSalary(item.salaryMin, item.salaryMax, item.currency)}</span>
            <span>{relativeTime(item.postedAt)}</span>
          </div>
          {item.skills?.length ? (
            <div className="row row-wrap" style={{ gap: "0.3rem", marginTop: 8 }}>
              {item.skills.slice(0, 6).map((skill) => (
                <span
                  key={skill}
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.14rem 0.45rem",
                    borderRadius: 6,
                    background: "var(--surface-2)",
                    color: "var(--text-soft)",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {typeof score === "number" ? (
          <div className="text-center">
            <MatchRing score={score} size={58} />
            <div className="eyebrow mt-1">
              match
            </div>
          </div>
        ) : (
          <div className="text-center" style={{ minWidth: 58 }}>
            <div className="mono" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
              {item.country.slice(0, 2).toUpperCase()}
            </div>
            <div className="eyebrow">global</div>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<div className="stack gap-2.5"><div className="surface p-4" /><div className="surface p-4" /></div>}>
      <OpportunitiesPageInner />
    </Suspense>
  );
}
