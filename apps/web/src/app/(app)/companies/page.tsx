"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, ExternalLink, Search } from "lucide-react";
import {
  Badge,
  Card,
  EmptyState,
  Input,
  Skeleton,
  StatTile,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
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

export default function CompaniesPage() {
  const [search, setSearch] = useState("");
  const companies = useApi<CompaniesResponse>("/companies", { limit: 60 });
  const items = companies.data?.items ?? [];

  const filtered = items.filter((company) =>
    company.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Employers</div>
          <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
            Companies hiring now
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Every company we have verified a live role for.
          </p>
        </div>
        <div style={{ position: "relative", minWidth: 240 }}>
          <Search
            size={14}
            style={{ position: "absolute", left: 10, top: 11, color: "var(--text-muted)" }}
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by name"
            style={{ paddingLeft: 30 }}
          />
        </div>
      </div>

      {companies.loading && items.length === 0 ? (
        <div className="grid-3">
          <Skeleton height={130} />
          <Skeleton height={130} />
          <Skeleton height={130} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Building2 size={28} />} title="No companies found" />
      ) : (
        <div className="grid-3">
          {filtered.map((company) => (
            <Link
              key={company.id}
              href={`/companies/${company.slug}`}
              className="surface surface-hover"
              style={{ padding: "1.05rem", display: "block" }}
            >
              <div className="row row-wrap" style={{ justifyContent: "space-between", gap: "0.5rem" }}>
                <strong style={{ fontSize: "1rem" }}>{company.name}</strong>
                {company.new_this_week > 0 ? (
                  <Badge tone="success">+{company.new_this_week} this week</Badge>
                ) : null}
              </div>
              <div
                style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}
              >
                {[company.industry, company.country].filter(Boolean).join(" · ") || "—"}
              </div>
              <div style={{ marginTop: "0.8rem" }}>
                <StatTile label="Open roles" value={String(company.open_roles)} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
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
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">Employer</div>
          <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.3rem)", marginTop: 4 }}>
            {company.name}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 4 }}>
            {[company.industry, company.country].filter(Boolean).join(" · ")}
          </p>
        </div>
        {company.careers_url ? (
          <a
            href={company.careers_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm"
          >
            Careers site <ExternalLink size={13} />
          </a>
        ) : null}
      </div>

      {stats ? (
        <div className="grid-4">
          <StatTile label="Total roles" value={String(stats.total)} />
          <StatTile label="Last 7 days" value={String(stats.last_7_days)} />
          <StatTile label="Last 30 days" value={String(stats.last_30_days)} />
          <StatTile
            label="Avg salary"
            value={stats.avg_salary ? formatSalary(stats.avg_salary, stats.avg_salary, "USD") : "—"}
          />
        </div>
      ) : null}

      <Card style={{ padding: "1.1rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.8rem" }}>Open roles</h2>
        <div className="stack" style={{ gap: "0.45rem" }}>
          {detail.data?.roles?.map((role) => (
            <Link
              key={role.id}
              href={`/opportunities/${role.id}`}
              className="row row-wrap surface surface-hover"
              style={{ padding: "0.7rem 0.85rem", gap: "0.8rem" }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{role.title}</div>
                <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                  {role.country ?? "—"} · {titleCase(role.work_mode ?? "unknown")} ·{" "}
                  {titleCase(role.seniority ?? "unspecified")} ·{" "}
                  {formatSalary(role.salary_min ?? null, role.salary_max ?? null, role.currency ?? null)}
                </div>
              </div>
              {role.apply_url ? <ExternalLink size={13} style={{ color: "var(--text-muted)" }} /> : null}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
