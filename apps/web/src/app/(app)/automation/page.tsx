"use client";

import Link from "next/link";
import { useState } from "react";
import { Cpu, RefreshCw, Workflow } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Page,
  PageHeader,
  Panel,
  PanelHead,
  Rows,
  Row,
  Skeleton,
  StatStrip,
  Td,
  Th,
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
    <Page>
      <PageHeader
        eyebrow="Automation"
        title="The machine behind the search"
        description="Five pipelines run continuously. You can see what is configured and trigger a check."
        art={{
          src: "https://cdn.angisoft.co.ke/public/images/mboqara/careers/technology-professional.webp",
          alt: "A professional working at a laptop beside a chalkboard plan",
          caption: "Always running",
        }}
        actions={
          <Badge tone={ai.data?.configured ? "success" : "warning"}>
            <Cpu size={11} /> AI {ai.data?.configured ? "online" : "not configured"}
          </Badge>
        }
      />

      <StatStrip
        items={[
          {
            label: "AI tasks",
            value: (stats.data?.totals.aiTasks ?? 0).toLocaleString(),
            hint: "processed in total",
          },
          {
            label: "Sources",
            value: (stats.data?.totals.sources ?? 0).toLocaleString(),
            hint: "boards monitored",
          },
          {
            label: "Live opportunities",
            value: (stats.data?.totals.activeOpportunities ?? 0).toLocaleString(),
            hint: "published now",
          },
          {
            label: "Events / 24h",
            value: (stats.data?.totals.events24h ?? 0).toLocaleString(),
            hint: "in the last day",
          },
        ]}
      />

      <Panel>
        <PanelHead
          eyebrow="Pipelines"
          title="What runs automatically"
          action={<Workflow size={16} className="text-app-muted" />}
        />
        <Rows className="border-t border-app-border">
          {PIPELINES.map((pipeline, index) => (
            <Row key={pipeline.name} as="li" className="items-start gap-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-app-sm border border-app-border bg-app-surface-2 font-mono text-[0.68rem] font-semibold tabular-nums text-app-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-[220px] flex-1">
                <p className="text-[0.92rem] font-semibold text-app-text">{pipeline.name}</p>
                <p className="mt-1 max-w-[62ch] text-[0.82rem] leading-relaxed text-app-muted">
                  {pipeline.detail}
                </p>
              </div>
              <Badge tone="neutral">{pipeline.cadence}</Badge>
            </Row>
          ))}
        </Rows>
      </Panel>

      <Panel>
        <PanelHead
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
        <div className="border-t border-app-border">
          {sources.loading && !sources.data ? (
            <div className="p-5">
              <Skeleton height={160} />
            </div>
          ) : (sources.data?.items?.length ?? 0) === 0 ? (
            <div className="p-5">
              <EmptyState title="No connectors registered" />
            </div>
          ) : (
            <DataTable className="rounded-none border-0 shadow-none">
              <thead>
                <tr>
                  <Th>Connector</Th>
                  <Th>Status</Th>
                  <Th>Health</Th>
                  <Th>Last checked</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {sources.data?.items?.map((source) => (
                  <tr key={source.id} className="transition-colors hover:bg-app-surface-2/40">
                    <Td>
                      <p className="font-semibold text-app-text">{source.name}</p>
                      <p className="max-w-[360px] truncate text-[0.71rem] text-app-muted">
                        {source.url}
                      </p>
                    </Td>
                    <Td>
                      <Badge tone={source.status === "active" ? "success" : "warning"}>
                        {source.status.replace(/_/g, " ")}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={source.health === "healthy" ? "success" : "danger"}>
                        {source.health}
                      </Badge>
                    </Td>
                    <Td className="text-[0.75rem]">
                      {source.last_checked_at ? formatDateTime(source.last_checked_at) : "never"}
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === source.id}
                        onClick={() => void triggerVerify(source.id)}
                      >
                        Check
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHead eyebrow="AI gateway" title="Provider status" />
        <div className="border-t border-app-border px-5 py-5">
          <p className="max-w-3xl text-[0.85rem] leading-relaxed text-app-muted">
            The gateway tries NVIDIA first, then Neon, then OpenAI, then your custom endpoint. It
            degrades to deterministic fallbacks so no feature ever hard-fails because a key is
            missing.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge tone={ai.data?.configured ? "success" : "neutral"}>NVIDIA</Badge>
            <Badge tone={ai.data?.configured ? "success" : "neutral"}>Neon</Badge>
            <Badge tone={ai.data?.configured ? "success" : "neutral"}>OpenAI</Badge>
            <Badge tone="neutral">custom</Badge>
            <Badge tone="accent">mode: {ai.data?.mode ?? "auto"}</Badge>
          </div>
          <div className="mt-5">
            <Link href="/settings">
              <Button variant="outline" size="sm">
                Gateway settings
              </Button>
            </Link>
          </div>
        </div>
      </Panel>
    </Page>
  );
}
