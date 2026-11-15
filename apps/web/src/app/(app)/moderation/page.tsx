"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Fingerprint, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatTile,
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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Trust and safety"
        title="Keep the floor clean"
        description="Every posting is fingerprinted. This is where the corpus and the review queue live."
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Sources monitored" value={String(stats.data?.totals.sources ?? 0)} />
        <StatTile
          label="Live opportunities"
          value={String(stats.data?.totals.activeOpportunities ?? 0)}
        />
        <StatTile
          label="Fingerprints"
          value={String(scam.data?.total ?? 0)}
          icon={<Fingerprint size={15} />}
        />
        <StatTile label="Awaiting review" value={String(queue.data?.total ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <SectionTitle
            eyebrow="Distribution"
            title="How postings are scored"
            action={<ShieldAlert size={16} className="text-app-muted" />}
          />
          <div className="mt-3 flex flex-col gap-2">
            {risk.map((row) => (
              <div key={row.risk_action} className="flex items-center justify-between gap-3">
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
                <span className="font-mono text-[0.78rem] tabular-nums text-app-muted">
                  {row.count}
                </span>
              </div>
            ))}
            {risk.length === 0 ? (
              <p className="text-[0.83rem] text-app-muted">No scored postings yet.</p>
            ) : null}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle eyebrow="Queue" title="Sources awaiting classification" />
          <div className="mt-3 flex flex-col gap-2">
            {(queue.data?.items ?? []).map((source) => (
              <div
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-app-sm border border-app-border px-2.5 py-2"
              >
                <div className="min-w-[180px]">
                  <p className="text-[0.85rem] font-semibold text-app-text">{source.name}</p>
                  <p className="max-w-[240px] truncate text-[0.71rem] text-app-muted">
                    {source.url}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === source.id}
                  onClick={() => void verify(source.id)}
                >
                  Verify
                </Button>
              </div>
            ))}
            {(queue.data?.items?.length ?? 0) === 0 ? (
              <p className="text-[0.83rem] text-app-muted">The queue is clear.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="p-4 sm:p-5">
        <SectionTitle
          eyebrow="Corpus"
          title={`${scam.data?.total ?? 0} scam fingerprints`}
          description="SimHash fingerprints of known fraudulent templates."
        />
        {scam.loading && !scam.data ? (
          <div className="mt-4">
            <Skeleton height={180} />
          </div>
        ) : (scam.data?.items?.length ?? 0) === 0 ? (
          <div className="mt-4">
            <EmptyState title="Corpus is empty" />
          </div>
        ) : (
          <div className="mt-4">
            <DataTable>
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
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle eyebrow="Policy" title="What we remove" />
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[0.86rem] leading-relaxed text-app-soft">
          <li>Postings that fingerprint against a known scam template.</li>
          <li>Companies with no verifiable history and a payment or bank-detail request.</li>
          <li>Salary ranges that fall far below the local median for that profession.</li>
          <li>Duplicate postings replayed across dozens of boards to farm applications.</li>
        </ul>
        <div className="mt-4">
          <Link href="/admin">
            <Button variant="outline" size="sm">
              Open the full control room
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
