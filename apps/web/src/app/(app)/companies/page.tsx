"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ExternalLink } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  StatTile,
  cx,
} from "@/components/ui";
import { useApi, useDebounced } from "@/lib/hooks";
import { formatSalary, titleCase } from "@/lib/format";

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  website?: string | null;
  careers_url?: string | null;
  industry?: string | null;
  country?: string | null;
  open_roles: number;
  new_this_week: number;
}

interface CompaniesResponse {
  items: CompanyRow[];
  total: number;
}

const PAGE_SIZE = 24;

function CompaniesPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(Number(params.get("page") ?? 1) || 1);
  const debounced = useDebounced(search, 320);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set("q", debounced);
    if (page > 1) next.set("page", String(page));
    const suffix = next.toString();
    router.replace(suffix ? `/companies?${suffix}` : "/companies", { scroll: false });
  }, [debounced, page, router]);

  // The search runs on the API. Filtering the page in the browser made the
  // filter a lie: it could only find names that happened to be on the page.
  const { data, loading } = useApi<CompaniesResponse>("/companies", {
    q: debounced || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Employers"
        title="Companies hiring now"
        description="Every company we have verified a live role for, ordered by how much they are hiring."
        meta={
          <p className="text-[0.84rem] text-app-muted">
            {loading && items.length === 0
              ? "Loading the register…"
              : `${total.toLocaleString()} compan${total === 1 ? "y" : "ies"} · page ${page}`}
          </p>
        }
        actions={
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Filter by name"
            className="w-[260px]"
          />
        }
      />

      {loading && items.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton height={150} />
          <Skeleton height={150} />
          <Skeleton height={150} />
          <Skeleton height={150} />
          <Skeleton height={150} />
          <Skeleton height={150} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Building2 size={26} />}
          title="No companies found"
          description={debounced ? `Nothing matches “${debounced}”.` : undefined}
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/companies/${company.slug}`}
                  className="group flex h-full flex-col rounded-app-lg border border-app-border bg-app-surface p-4 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <strong className="text-[1rem] text-app-text">{company.name}</strong>
                    {company.new_this_week > 0 ? (
                      <Badge tone="success">+{company.new_this_week} this week</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[0.77rem] text-app-muted">
                    {[company.industry, company.country].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-auto pt-3">
                    <StatTile label="Open roles" value={String(company.open_roles)} />
                  </div>
                </Link>
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

export default function CompaniesPage() {
  return (
    <Suspense fallback={<Skeleton height={240} />}>
      <CompaniesPageInner />
    </Suspense>
  );
}

export function CompanyDetail({ slug }: { slug: string }) {
  const detail = useApi<{
    company: CompanyRow;
    roles: {
      id: string;
      title: string;
      country?: string | null;
      work_mode?: string | null;
      seniority?: string | null;
      salary_min?: number | null;
      salary_max?: number | null;
      currency?: string | null;
      apply_url?: string | null;
      posted_at?: string | null;
    }[];
    stats: {
      total: number;
      last_7_days: number;
      last_30_days: number;
      avg_salary: number | null;
      countries: number;
    };
  }>(`/companies/${slug}`);

  const company = detail.data?.company;
  const stats = detail.data?.stats;

  if (detail.loading) return <Skeleton height={320} />;
  if (!company) return <EmptyState title="Company not found" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Employer"
        title={company.name}
        description={[company.industry, company.country].filter(Boolean).join(" · ")}
        actions={
          company.careers_url ? (
            <a href={company.careers_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" icon={<ExternalLink size={13} />}>
                Careers site
              </Button>
            </a>
          ) : null
        }
      />

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Total roles" value={String(stats.total)} />
          <StatTile label="Last 7 days" value={String(stats.last_7_days)} />
          <StatTile label="Last 30 days" value={String(stats.last_30_days)} />
          <StatTile
            label="Avg salary"
            value={
              stats.avg_salary
                ? formatSalary(stats.avg_salary, stats.avg_salary, "USD")
                : "—"
            }
          />
        </div>
      ) : null}

      <Card className="p-4 sm:p-5">
        <h2 className="text-[1rem] font-semibold text-app-text">Open roles</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {(detail.data?.roles ?? []).map((role) => (
            <li key={role.id}>
              <Link
                href={`/opportunities/${role.id}`}
                className={cx(
                  "flex flex-wrap items-center gap-3 rounded-app-md border border-app-border px-3 py-2.5",
                  "transition-colors duration-150 hover:border-app-border-strong hover:bg-app-surface-2/50",
                )}
              >
                <div className="min-w-[200px] flex-1">
                  <p className="text-[0.89rem] font-semibold text-app-text">{role.title}</p>
                  <p className="text-[0.75rem] text-app-muted">
                    {role.country ?? "—"} · {titleCase(role.work_mode ?? "unknown")} ·{" "}
                    {titleCase(role.seniority ?? "unspecified")} ·{" "}
                    {formatSalary(role.salary_min ?? null, role.salary_max ?? null, role.currency ?? null)}
                  </p>
                </div>
                {role.apply_url ? <ExternalLink size={13} className="text-app-muted" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
