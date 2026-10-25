"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Cpu, RefreshCw, Workflow } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Skeleton,
  StatTile,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

interface AiStatus {
  configured: boolean;
  mode: string;
}

interface StatsResponse {
  totals: { aiTasks: number; sources: number; activeOpportunities: number; events24h: number };
  sourcesByType: { type: string; count: number }[];
}

interface SourceRow {
  id: string;
  name: string;
  url: string;
  status: string;
  health: string;
  last_checked_at?: string | null;
}

const PIPELINES = [
  {
    name: "Ingestion",
    detail: "Fetch every registered board, normalise, deduplicate and score the posting.",
    cadence: "Every 30 minutes",
  },
  {
    name: "Fraud re-scan",
    detail: "Re-fingerprint postings and re-run salary and company checks against live data.",
    cadence: "Every 2 hours",
  },
  {
    name: "Match refresh",
    detail: "Recompute semantic and rule-based matches for active candidates.",
    cadence: "On profile change",
  },
  {
    name: "Follow-up reminders",
    detail: "Notify the candidate when a follow-up falls due. Never contacts employers.",
    cadence: "Every hour",
  },
  {
    name: "Document generation",
    detail: "Render ATS-ready CV, cover letter and portfolio artefacts on demand.",
    cadence: "On request",
  },
];

export default function AutomationPage() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const ai = useApi<AiStatus>("/ai/status");
  const stats = useApi<StatsResponse>("/admin/stats");
  const sources = useApi<{ items: SourceRow[]; total: number }>("/sources");

  const triggerVerify = async (id: string) => {
    setBusy(id);
    try {
      await api.post(`/sources/${id}/verify`);
      toast.push("Source re-checked", "success");
      sources.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Check failed",
        "danger",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Automation</div>
          <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
            The machine behind the search
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Five pipelines run continuously. You can see what is configured and trigger a check.
          </p>
        </div>
        <Badge tone={ai.data?.configured ? "success" : "warning"}>
          <Cpu size={11} /> AI {ai.data?.configured ? "online" : "not configured"}
        </Badge>
      </div>

      <div className="grid-4">
        <StatTile label="AI tasks" value={String(stats.data?.totals.aiTasks ?? 0)} icon={<Bot size={15} />} />
        <StatTile label="Sources" value={String(stats.data?.totals.sources ?? 0)} />
        <StatTile label="Live opportunities" value={String(stats.data?.totals.activeOpportunities ?? 0)} />
        <StatTile label="Events / 24h" value={String(stats.data?.totals.events24h ?? 0)} />
      </div>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle
          eyebrow="Pipelines"
          title="What runs automatically"
          action={<Workflow size={16} style={{ color: "var(--text-muted)" }} />}
        />
        <div className="stack" style={{ marginTop: "0.9rem", gap: "0.5rem" }}>
          {PIPELINES.map((pipeline) => (
            <div
              key={pipeline.name}
              className="row row-wrap"
              style={{
                justifyContent: "space-between",
                gap: "0.8rem",
                padding: "0.7rem 0.85rem",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ flex: 1, minWidth: 240 }}>
                <strong style={{ fontSize: "0.9rem" }}>{pipeline.name}</strong>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{pipeline.detail}</p>
              </div>
              <Badge tone="neutral">{pipeline.cadence}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle
          eyebrow="Connectors"
          title="Registered sources"
          description="Trigger a health check on any connector without waiting for the scheduler."
          action={
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw size={13} />}
              onClick={() => {
                sources.refresh();
                stats.refresh();
                toast.push("Refreshed", "accent");
              }}
            >
              Refresh
            </Button>
          }
        />
        {sources.loading && !sources.data ? (
          <Skeleton height={160} />
        ) : (sources.data?.items?.length ?? 0) === 0 ? (
          <EmptyState title="No connectors registered" />
        ) : (
          <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Connector</th>
                  <th>Status</th>
                  <th>Health</th>
                  <th>Last checked</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sources.data?.items?.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{source.name}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {source.url}
                      </div>
                    </td>
                    <td>
                      <Badge tone={source.status === "active" ? "success" : "warning"}>
                        {source.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={source.health === "healthy" ? "success" : "danger"}>
                        {source.health}
                      </Badge>
                    </td>
                    <td style={{ fontSize: "0.76rem" }}>
                      {source.last_checked_at ? formatDateTime(source.last_checked_at) : "never"}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === source.id}
                        onClick={() => void triggerVerify(source.id)}
                      >
                        Check
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle eyebrow="AI gateway" title="Provider status" />
        <div style={{ marginTop: "0.8rem" }}>
          <p style={{ fontSize: "0.86rem", color: "var(--text-muted)" }}>
            The gateway tries NVIDIA first, then Neon, then OpenAI, then your custom endpoint. It
            degrades to deterministic fallbacks so no feature ever hard-fails because a key is
            missing.
          </p>
          <div className="row row-wrap" style={{ gap: "0.4rem", marginTop: "0.8rem" }}>
            <Badge tone={ai.data?.configured ? "success" : "neutral"}>NVIDIA</Badge>
            <Badge tone={ai.data?.configured ? "success" : "neutral"}>Neon</Badge>
            <Badge tone={ai.data?.configured ? "success" : "neutral"}>OpenAI</Badge>
            <Badge tone="neutral">custom</Badge>
            <Badge tone="accent">mode: {ai.data?.mode ?? "auto"}</Badge>
          </div>
          <div style={{ marginTop: "0.9rem" }}>
            <Link href="/settings">
              <Button variant="outline" size="sm">
                Gateway settings
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
