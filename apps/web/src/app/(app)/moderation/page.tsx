"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
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

interface ScamResponse {
  items: { id: string; simhash: string; label: string; sample_url?: string | null; created_at: string }[];
  total: number;
}

interface SourceRow {
  id: string;
  name: string;
  url: string;
  status: string;
  health: string;
}

interface StatsResponse {
  totals: { sources: number; activeOpportunities: number; users: number };
  riskDistribution: { risk_action: string; count: number }[];
}

export default function ModerationPage() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const scam = useApi<ScamResponse>("/admin/scam-corpus");
  const queue = useApi<{ items: SourceRow[]; total: number }>("/sources/queue");
  const stats = useApi<StatsResponse>("/admin/stats");

  const risk = stats.data?.riskDistribution ?? [];
  const flagged = risk.filter((row) => row.risk_action !== "allow");

  const verify = async (id: string) => {
    setBusy(id);
    try {
      await api.post(`/sources/${id}/verify`);
      toast.push("Source classified", "success");
      queue.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Verification failed",
        "danger",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Trust and safety"
        title="Keep the floor clean"
        description="Every posting is fingerprinted. This is where the corpus and the review queue live."
        art={{
          src: "https://cdn.angisoft.co.ke/public/images/mboqara/careers/women-in-tech.webp",
          alt: "An engineer working in a server room",
          caption: "Every posting fingerprinted",
        }}
        actions={
          <Badge tone={flagged.length > 0 ? "warning" : "success"}>
            {flagged.length > 0 ? (
              <TriangleAlert size={11} />
            ) : (
              <ShieldCheck size={11} />
            )}
            {flagged.length > 0 ? `${flagged.length} need attention` : "nothing flagged"}
          </Badge>
        }
      />

      <StatStrip
        items={[
          {
            label: "Sources monitored",
            value: (stats.data?.totals.sources ?? 0).toLocaleString(),
            hint: "boards we scrape",
          },
          {
            label: "Live opportunities",
            value: (stats.data?.totals.activeOpportunities ?? 0).toLocaleString(),
            hint: "published now",
          },
          {
            label: "Fingerprints",
            value: (scam.data?.total ?? 0).toLocaleString(),
            hint: "known scam templates",
          },
          {
            label: "Awaiting review",
            value: (queue.data?.total ?? 0).toLocaleString(),
            hint: "sources to classify",
          },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHead
            eyebrow="Distribution"
            title="How postings are scored"
            action={<ShieldAlert size={16} className="text-app-muted" />}
          />
          <Rows className="border-t border-app-border">
            {risk.map((row) => (
              <Row key={row.risk_action} as="li" className="items-center justify-between gap-3">
                <Badge
                  tone={
                    row.risk_action === "block"
                      ? "danger"
                      : row.risk_action === "review"
                        ? "warning"
                        : "success"
                  }
                >
                  {row.risk_action}
                </Badge>
                <span className="font-display text-[1.35rem] leading-none font-semibold tabular-nums text-app-text">
                  {row.count.toLocaleString()}
                </span>
              </Row>
            ))}
            {risk.length === 0 ? (
              <Row as="li" className="text-[0.83rem] text-app-muted">
                No scored postings yet.
              </Row>
            ) : null}
          </Rows>
        </Panel>

        <Panel>
          <PanelHead
            eyebrow="Queue"
            title="Sources awaiting classification"
            description="Each one is verified against the scam corpus before it is allowed to publish."
          />
          <Rows className="border-t border-app-border">
            {(queue.data?.items ?? []).map((source) => (
              <Row key={source.id} as="li" className="items-center gap-3">
                <div className="min-w-[160px] flex-1">
                  <p className="truncate text-[0.88rem] font-medium text-app-text">
                    {source.name}
                  </p>
                  <p className="truncate text-[0.72rem] text-app-muted">{source.url}</p>
                </div>
                <Badge tone={source.health === "ok" ? "success" : "warning"}>
                  {source.health}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === source.id}
                  onClick={() => void verify(source.id)}
                >
                  Verify
                </Button>
              </Row>
            ))}
            {(queue.data?.items?.length ?? 0) === 0 ? (
              <Row as="li" className="text-[0.83rem] text-app-muted">
                The queue is clear.
              </Row>
            ) : null}
          </Rows>
        </Panel>
      </div>

      <Panel>
        <PanelHead
          eyebrow="Corpus"
          title={`${scam.data?.total ?? 0} scam fingerprints`}
          description="SimHash fingerprints of known fraudulent templates."
        />
        {scam.loading && !scam.data ? (
          <div className="border-t border-app-border p-5">
            <Skeleton height={180} />
          </div>
        ) : (scam.data?.items?.length ?? 0) === 0 ? (
          <div className="border-t border-app-border p-5">
            <EmptyState title="Corpus is empty" />
          </div>
        ) : (
          <div className="border-t border-app-border">
            <DataTable className="rounded-none border-0 shadow-none">
              <thead>
                <tr>
                  <Th>Label</Th>
                  <Th>Fingerprint</Th>
                  <Th>Sample</Th>
                  <Th>Added</Th>
                </tr>
              </thead>
              <tbody>
                {scam.data?.items?.map((signature) => (
                  <tr key={signature.id} className="transition-colors hover:bg-app-surface-2/40">
                    <Td>
                      <Badge tone="danger">{signature.label}</Badge>
                    </Td>
                    <Td className="font-mono text-[0.7rem]">{signature.simhash}</Td>
                    <Td className="text-[0.75rem]">
                      {signature.sample_url ? (
                        <a
                          href={signature.sample_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-app-accent hover:underline"
                        >
                          open <ArrowUpRight size={11} />
                        </a>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-[0.75rem]">{formatDateTime(signature.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHead eyebrow="Policy" title="What we remove" />
        <ul className="mt-1 list-disc space-y-2 border-t border-app-border px-5 py-5 pl-9 text-[0.86rem] leading-relaxed text-app-soft">
          <li>Postings that fingerprint against a known scam template.</li>
          <li>Companies with no verifiable history and a payment or bank-detail request.</li>
          <li>Salary ranges that fall far below the local median for that profession.</li>
          <li>Duplicate postings replayed across dozens of boards to farm applications.</li>
        </ul>
        <div className="border-t border-app-border px-5 py-4">
          <Link href="/admin">
            <Button variant="outline" size="sm">
              Open the full control room
            </Button>
          </Link>
        </div>
      </Panel>
    </Page>
  );
}
