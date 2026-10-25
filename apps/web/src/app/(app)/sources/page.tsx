"use client";

import { useState } from "react";
import { Globe, Link2, Radar, ShieldCheck, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

interface SourceRow {
  id: string;
  name: string;
  url: string;
  type: string;
  kind: string;
  status: string;
  health: string;
  last_checked_at?: string | null;
  job_count?: number;
}

interface SourcesResponse {
  items: SourceRow[];
  total: number;
}

interface CatalogResponse {
  total: number;
  adapters: { name: string; kind: string; exampleUrl: string }[];
  connectors: { name: string; kind: string }[];
  note: string;
}

export default function SourcesPage() {
  const toast = useToast();
  const [tab, setTab] = useState("registered");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  const sources = useApi<SourcesResponse>("/sources");
  const queue = useApi<SourcesResponse>("/sources/queue");
  const catalog = useApi<CatalogResponse>("/sources/catalog");

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await api.post<{ message?: string }>("/sources", {
        url,
        name: name || undefined,
        notes: notes || undefined,
      });
      toast.push(result.message ?? "Source submitted for review", "success");
      setUrl("");
      setName("");
      setNotes("");
      sources.refresh();
      queue.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not submit the source",
        "danger",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (id: string) => {
    setVerifying(id);
    try {
      await api.post(`/sources/${id}/verify`);
      toast.push("Source checked and classified", "success");
      queue.refresh();
      sources.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Verification failed",
        "danger",
      );
    } finally {
      setVerifying(null);
    }
  };

  const items = sources.data?.items ?? [];

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div>
        <div className="eyebrow">Coverage</div>
        <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
          Where jobs come from
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
          We monitor hundreds of boards. If one is missing, tell us and our curators verify it.
        </p>
      </div>

      <Tabs
        tabs={[
          { key: "registered", label: "Registered", count: items.length },
          { key: "queue", label: "Review queue", count: queue.data?.items?.length },
          { key: "catalog", label: "Adapter catalog", count: catalog.data?.total },
          { key: "submit", label: "Submit source" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "registered" ? (
        sources.loading ? (
          <Skeleton height={260} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Globe size={28} />} title="No sources yet" />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Health</th>
                  <th>Last checked</th>
                </tr>
              </thead>
              <tbody>
                {items.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{source.name}</div>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {source.url}
                      </a>
                    </td>
                    <td>
                      <Badge tone="neutral">{source.kind ?? source.type}</Badge>
                    </td>
                    <td>
                      <Badge
                        tone={
                          source.status === "active"
                            ? "success"
                            : source.status === "pending_review"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {source.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={source.health === "healthy" ? "success" : "danger"}>
                        {source.health ?? "unknown"}
                      </Badge>
                    </td>
                    <td style={{ fontSize: "0.78rem" }}>
                      {source.last_checked_at ? formatDateTime(source.last_checked_at) : "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "queue" ? (
        queue.loading ? (
          <Skeleton height={200} />
        ) : (queue.data?.items?.length ?? 0) === 0 ? (
          <EmptyState icon={<ShieldCheck size={28} />} title="Queue is clear" description="No sources awaiting review." />
        ) : (
          <div className="stack" style={{ gap: "0.5rem" }}>
            {queue.data?.items?.map((source) => (
              <Card key={source.id} style={{ padding: "0.85rem 1rem" }}>
                <div className="row row-wrap" style={{ gap: "1rem" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 600 }}>{source.name}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {source.url}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Radar size={13} />}
                    loading={verifying === source.id}
                    onClick={() => void verify(source.id)}
                  >
                    Verify & classify
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {tab === "catalog" ? (
        <div className="stack" style={{ gap: "0.7rem" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {catalog.data?.note}
          </p>
          <div className="grid-3">
            {catalog.data?.adapters?.map((adapter) => (
              <Card key={adapter.name} style={{ padding: "1rem" }}>
                <div className="row" style={{ gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <Link2 size={15} style={{ color: "var(--accent)" }} />
                  <strong style={{ fontSize: "0.92rem" }}>{adapter.name}</strong>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  {adapter.exampleUrl}
                </p>
                <div className="row row-wrap" style={{ gap: "0.3rem", marginTop: "0.6rem" }}>
                  <Badge tone="accent">{adapter.kind}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "submit" ? (
        <Card style={{ padding: "1.2rem" }}>
          <SectionTitle
            eyebrow="Contribution"
            title="Submit a job board"
            description="We fetch it safely from our own servers, classify the layout and add it to the rotation."
          />
          <div className="stack" style={{ marginTop: "1rem", gap: "0.8rem" }}>
            <Field label="Board URL">
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://jobs.example.com"
              />
            </Field>
            <Field label="Name" hint="Optional, we will infer it">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Notes" hint="Anything that helps our curators">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <div>
              <Button
                icon={<Globe size={15} />}
                loading={submitting}
                disabled={!url.trim()}
                onClick={() => void submit()}
              >
                Submit for review
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
