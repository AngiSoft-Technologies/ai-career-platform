"use client";

import Link from "next/link";
import { useState } from "react";
import { Briefcase, CheckCircle2, Radar, TrendingUp } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Skeleton,
  Tabs,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import type { Application, Opportunity } from "@/lib/types";
import { APPLICATION_STATUS_TRANSITIONS } from "@angisoft/job-radar-contracts";
import type { ApplicationStatus } from "@angisoft/job-radar-contracts";

interface ApplicationsResponse {
  items: Application[];
}

const STAGES = ["SHORTLISTED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];

export default function ApplicationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("all");
  const applications = useApi<ApplicationsResponse>("/applications");
  const opportunities = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 100 });

  const byId = toMap(opportunities.data?.items ?? []);
  const items = applications.data?.items ?? [];

  const visible = tab === "all" ? items : items.filter((item) => item.status === tab);

  const updateStatus = async (application: Application, status: ApplicationStatus) => {
    try {
      await api.patch(`/applications/${application.id}/status`, {
        status,
        version: application.version,
      });
      toast.push(`Moved to ${titleCase(status)}`, "success");
      applications.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not update the application",
        "danger",
      );
    }
  };

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
            Applications
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            {items.length} tracked · every move you made, in one timeline.
          </p>
        </div>
        <Link href="/followups">
          <Button variant="outline" size="sm" icon={<CheckCircle2 size={14} />}>
            Schedule follow-ups
          </Button>
        </Link>
      </div>

      <Tabs
        tabs={[
          { key: "all", label: "All", count: items.length },
          ...STAGES.map((stage) => ({
            key: stage,
            label: titleCase(stage),
            count: items.filter((item) => item.status === stage).length,
          })),
        ]}
        active={tab}
        onChange={setTab}
      />

      {applications.loading ? (
        <div className="stack">
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={28} />}
          title="Nothing here yet"
          description="Start an application from any opportunity and it will show up here."
          action={
            <Link href="/opportunities">
              <Button size="sm">Browse opportunities</Button>
            </Link>
          }
        />
      ) : (
        <div className="stack" style={{ gap: "0.6rem" }}>
          {visible.map((application) => {
            const opportunity = byId.get(application.opportunityId);
            return (
              <Card key={application.id} style={{ padding: "0.95rem 1.05rem" }}>
                <div className="row row-wrap" style={{ gap: "1rem" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div className="row row-wrap" style={{ gap: "0.4rem", marginBottom: 4 }}>
                      <Badge tone={stageTone(application.status)}>{titleCase(application.status)}</Badge>
                      <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        updated {formatDateTime(application.updatedAt)}
                      </span>
                    </div>
                    <h3 style={{ fontSize: "0.98rem" }}>
                      {opportunity?.title ?? "Opportunity"}
                    </h3>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 3 }}>
                      {opportunity?.companyName ?? "—"}
                    </p>
                  </div>

                  <div className="row row-wrap" style={{ gap: "0.4rem" }}>
                    <select
                      className="select"
                      value={application.status}
                      onChange={(event) => void updateStatus(application, event.target.value as ApplicationStatus)}
                      aria-label="Application status"
                      style={{ width: 165 }}
                    >
                      {[application.status, ...(APPLICATION_STATUS_TRANSITIONS[application.status] ?? [])].map((stage) => (
                        <option key={stage} value={stage}>
                          {titleCase(stage)}
                        </option>
                      ))}
                    </select>
                    <Link href={`/applications/${application.id}?guided=1`}>
                      <Button variant="outline" size="sm" icon={<Radar size={13} />}>
                        Continue application
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function stageTone(status: string) {
  if (status === "OFFER") return "success" as const;
  if (status === "INTERVIEW") return "accent" as const;
  if (status === "APPLIED") return "info" as const;
  if (status === "REJECTED" || status === "WITHDRAWN") return "danger" as const;
  return "neutral" as const;
}

function toMap<T extends { id: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.id, item);
  return map;
}
