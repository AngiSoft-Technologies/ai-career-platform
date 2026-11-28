"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ExternalLink } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Page,
  PageHeader,
  Pagination,
  Panel,
  PanelHead,
  Rows,
  Row,
  SearchInput,
  Skeleton,
  StatStrip,
  cx,
} from "@/components/ui";
import { CompanyMark } from "@/components/app-art";
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
  const hiring = items.filter((item) => item.open_roles > 0).length;
  const fresh = items.reduce((sum, item) => sum + item.new_this_week, 0);
  const roles = items.reduce((sum, item) => sum + item.open_roles, 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Employers"
        title="Companies hiring now"
        description="Every company we have verified a live role for, ordered by how much they are hiring."
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

      <StatStrip
        items={[
          {
            label: "Companies",
            value: total.toLocaleString(),
            hint: "in the register",
          },
          {
            label: "Hiring now",
            value: hiring.toLocaleString(),
            hint: "on this page",
          },
          {
            label: "Open roles",
            value: roles.toLocaleString(),
            hint: "on this page",
          },
          {
            label: "New this week",
            value: fresh.toLocaleString(),
            hint: "on this page",
          },
        ]}
      />

      {loading && items.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} height={150} />
          ))}
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
                  className="group flex h-full flex-col rounded-app-lg border border-app-border bg-app-surface p-4 shadow-app-card transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-lift"
                >
                  <div className="flex items-start gap-3">
                    <CompanyMark
                      name={company.name}
                      size={40}
                      className="rounded-app-md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <strong className="text-[0.98rem] leading-snug text-app-text group-hover:text-app-accent">
                          {company.name}
                        </strong>
                        {company.new_this_week > 0 ? (
                          <Badge tone="success">+{company.new_this_week} new</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[0.75rem] text-app-muted">
                        {[company.industry, company.country].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-app-border pt-3">
                    <span className="font-display text-[1.5rem] leading-none font-semibold tabular-nums text-app-text">
                      {company.open_roles}
                    </span>
                    <span className="font-mono text-[0.58rem] tracking-[0.16em] text-app-muted uppercase">
                      open roles
                    </span>
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
    </Page>
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
    <Page>
      <PageHeader
        eyebrow="Employer"
        title={company.name}
        description={[company.industry, company.country].filter(Boolean).join(" · ")}
        art={{
          src: "https://cdn1.angisoft.co.ke/mboqara/images/mboqara/careers/lagos-career-story.webp",
          alt: "A professional working on a laptop",
          caption: `${stats?.countries ?? 0} ${
            (stats?.countries ?? 0) === 1 ? "country" : "countries"
          } hiring`,
        }}
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
        <StatStrip
          items={[
            { label: "Total roles", value: stats.total.toLocaleString(), hint: "all time" },
            {
              label: "Last 7 days",
              value: stats.last_7_days.toLocaleString(),
              hint: "new openings",
            },
            {
              label: "Last 30 days",
              value: stats.last_30_days.toLocaleString(),
              hint: "new openings",
            },
            {
              label: "Avg salary",
              value: stats.avg_salary
                ? formatSalary(stats.avg_salary, stats.avg_salary, "USD")
                : "—",
              hint: `${stats.countries} ${stats.countries === 1 ? "country" : "countries"}`,
            },
          ]}
        />
      ) : null}

      <Panel>
        <PanelHead
          eyebrow="Open roles"
          title={`${detail.data?.roles?.length ?? 0} live openings`}
          description="Each one is verified against the employer's own careers page."
        />
        <Rows className="border-t border-app-border">
          {(detail.data?.roles ?? []).map((role) => (
            <Row key={role.id} as="li" className="items-center gap-3">
              <Link
                href={`/workspace/opportunities/${role.id}`}
                className="flex min-w-[200px] flex-1 flex-wrap items-center gap-3"
              >
                <div className="min-w-[180px] flex-1">
                  <p className="text-[0.9rem] font-semibold text-app-text hover:text-app-accent">
                    {role.title}
                  </p>
                  <p className="text-[0.75rem] text-app-muted">
                    {role.country ?? "—"} · {titleCase(role.work_mode ?? "unknown")} ·{" "}
                    {titleCase(role.seniority ?? "unspecified")} ·{" "}
                    {formatSalary(
                      role.salary_min ?? null,
                      role.salary_max ?? null,
                      role.currency ?? null,
                    )}
                  </p>
                </div>
                {role.apply_url ? (
                  <ExternalLink size={13} className="text-app-muted" />
                ) : null}
              </Link>
            </Row>
          ))}
          {(detail.data?.roles?.length ?? 0) === 0 ? (
            <Row as="li" className="text-[0.85rem] text-app-muted">
              No live openings right now.
            </Row>
          ) : null}
        </Rows>
      </Panel>
    </Page>
  );
}
