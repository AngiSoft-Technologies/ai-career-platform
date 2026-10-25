"use client";

import { useState } from "react";
import Link from "next/link";
import { Fingerprint, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
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
  const [tab, setTab] = useState("corpus");
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
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Trust and safety</div>
          <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
            Keep the floor clean
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Every posting is fingerprinted. This is where the corpus and the review queue live.
          </p>
        </div>
        <Badge tone={flagged.length > 0 ? "warning" : "success"}>
          {flagged.length > 0 ? (
            <TriangleAlert size={11} />
          ) : (
            <ShieldCheck size={11} />
          )}
          {flagged.length > 0 ? `${flagged.length} need attention` : "nothing flagged"}
        </Badge>
      </div>

      <div className="grid-4">
        <StatTile label="Sources monitored" value={String(stats.data?.totals.sources ?? 0)} />
        <StatTile label="Live opportunities" value={String(stats.data?.totals.activeOpportunities ?? 0)} />
        <StatTile label="Fingerprints" value={String(scam.data?.total ?? 0)} icon={<Fingerprint size={15} />} />
        <StatTile label="Awaiting review" value={String(queue.data?.total ?? 0)} />
      </div>

      <div className="grid-2">
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle
            eyebrow="Distribution"
            title="How postings are scored"
            action={<ShieldAlert size={16} style={{ color: "var(--text-muted)" }} />}
          />
          <div className="stack" style={{ marginTop: "0.8rem", gap: "0.4rem" }}>
            {risk.map((row) => (
              <div key={row.risk_action} className="row" style={{ justifyContent: "space-between" }}>
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
                <span className="mono" style={{ fontSize: "0.8rem" }}>
                  {row.count}
                </span>
              </div>
            ))}
            {risk.length === 0 ? (
              <p style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                No scored postings yet.
              </p>
            ) : null}
          </div>
        </Card>

        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="Queue" title="Sources awaiting classification" />
          <div className="stack" style={{ marginTop: "0.8rem", gap: "0.4rem" }}>
            {(queue.data?.items ?? []).map((source) => (
              <div
                key={source.id}
                className="row row-wrap"
                style={{
                  justifyContent: "space-between",
                  gap: "0.6rem",
                  padding: "0.55rem 0.7rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontSize: "0.86rem", fontWeight: 600 }}>{source.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {source.url}
                  </div>
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
              <p style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                The queue is clear.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle
          eyebrow="Corpus"
          title={`${scam.data?.total ?? 0} scam fingerprints`}
          description="SimHash fingerprints of known fraudulent templates."
        />
        {scam.loading ? (
          <Skeleton height={180} />
        ) : (scam.data?.items?.length ?? 0) === 0 ? (
          <EmptyState title="Corpus is empty" />
        ) : (
          <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Fingerprint</th>
                  <th>Sample</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {scam.data?.items?.map((signature) => (
                  <tr key={signature.id}>
                    <td>
                      <Badge tone="danger">{signature.label}</Badge>
                    </td>
                    <td className="mono" style={{ fontSize: "0.7rem" }}>
                      {signature.simhash}
                    </td>
                    <td style={{ fontSize: "0.75rem" }}>
                      {signature.sample_url ? (
                        <a href={signature.sample_url} target="_blank" rel="noopener noreferrer">
                          open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ fontSize: "0.75rem" }}>
                      {formatDateTime(signature.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle eyebrow="Policy" title="What we remove" />
        <ul style={{ paddingLeft: "1.1rem", marginTop: "0.8rem", lineHeight: 1.9, fontSize: "0.88rem" }}>
          <li>Postings that fingerprint against a known scam template.</li>
          <li>Companies with no verifiable history and a payment or bank-detail request.</li>
          <li>Salary ranges that fall far below the local median for that profession.</li>
          <li>Duplicate postings replayed across dozens of boards to farm applications.</li>
        </ul>
        <div style={{ marginTop: "0.9rem" }}>
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
