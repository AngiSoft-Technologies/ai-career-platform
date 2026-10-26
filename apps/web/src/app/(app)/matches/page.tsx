"use client";

import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";
import { Badge, Button, Card, EmptyState, MatchRing, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { formatSalary, titleCase } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

interface MatchesResponse {
  items: Opportunity[];
  total: number;
}

export default function MatchesPage() {
  const { data, loading } = useApi<MatchesResponse>("/matches", { limit: 50, semantic: "true" });
  const items = data?.items ?? [];

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Ranking</div>
          <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
            Your best matches
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Skills, location, work mode and seniority shape each role’s fit score.
          </p>
        </div>
        <Badge tone="accent">
          <Zap size={11} /> Profile-ranked
        </Badge>
      </div>

      {loading && items.length === 0 ? (
        <div className="stack">
          <Skeleton height={82} />
          <Skeleton height={82} />
          <Skeleton height={82} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={28} />}
          title="No matches yet"
          description="Fill in your profile and we will rank every opportunity we monitor against it."
          action={
            <Link href="/profile">
              <Button size="sm">Complete profile</Button>
            </Link>
          }
        />
      ) : (
        <div className="stack" style={{ gap: "0.55rem" }}>
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/opportunities/${item.id}`}
              className="surface surface-hover"
              style={{
                padding: "0.9rem 1rem",
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <MatchRing score={item.match?.score ?? 0} size={54} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{item.title}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {item.companyName} · {item.country} · {titleCase(item.workMode)} ·{" "}
                  {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
                </div>
                {item.match?.explanation ? (
                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 4 }}>
                    {item.match.explanation}
                  </div>
                ) : null}
              </div>
              <div className="row row-wrap" style={{ gap: "0.3rem" }}>
                {(item.match?.gaps ?? []).slice(0, 2).map((gap) => (
                  <Badge key={gap} tone="warning">
                    {gap}
                  </Badge>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
