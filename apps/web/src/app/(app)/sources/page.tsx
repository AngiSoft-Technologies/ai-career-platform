"use client";

import { useState } from "react";
import { Globe, Link2, ScanSearch, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  Page,
  PageHeader,
  Pagination,
  Panel,
  PanelHead,
  Rows,
  Row,
  Skeleton,
  StatStrip,
  Tabs,
  Td,
  Textarea,
  Th,
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

  // Both lists are pages of a register, with the register's size as the
  // total: the tab counts are the whole estate, not the page in front of
  // the reader.
  const [sourcePage, setSourcePage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);
  const SOURCE_PAGE_SIZE = 25;

  const sources = useApi<SourcesResponse>("/sources", {
    limit: SOURCE_PAGE_SIZE,
    offset: (sourcePage - 1) * SOURCE_PAGE_SIZE,
  });
  const queue = useApi<SourcesResponse>("/sources/queue", {
    limit: SOURCE_PAGE_SIZE,
    offset: (queuePage - 1) * SOURCE_PAGE_SIZE,
  });
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
  const healthy = items.filter((item) => item.health === "healthy").length;
  const roles = items.reduce((sum, item) => sum + (item.job_count ?? 0), 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Coverage"
        title="Where jobs come from"
        description="We monitor hundreds of boards. If one is missing, tell us and our curators verify it."
        art={{
          src: "https://cdn.angisoft.co.ke/public/images/mboqara/careers/engineering-professional.webp",
          alt: "A professional at a desk with a laptop",
          caption: "Curated, deduplicated, scored",
        }}
      />

      <StatStrip
        items={[
          {
            label: "Registered",
            value: (sources.data?.total ?? 0).toLocaleString(),
            hint: "boards in the rotation",
          },
          {
            label: "Healthy",
            value: healthy.toLocaleString(),
            hint: "on this page",
          },
          {
            label: "Roles found",
            value: roles.toLocaleString(),
            hint: "on this page",
          },
          {
            label: "In review",
            value: (queue.data?.total ?? 0).toLocaleString(),
            hint: "waiting for a curator",
          },
        ]}
      />

      <Tabs
        tabs={[
          { key: "registered", label: "Registered", count: sources.data?.total ?? 0 },
          { key: "queue", label: "Review queue", count: queue.data?.total ?? 0 },
          { key: "catalog", label: "Adapter catalog", count: catalog.data?.total },
          { key: "submit", label: "Submit source" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "registered" ? (
        sources.error ? (
          <EmptyState
            icon={<Globe size={26} />}
            title="Could not load the register"
            description={sources.error}
            action={
              <Button variant="outline" onClick={() => sources.refresh()}>
                Try again
              </Button>
            }
          />
        ) : sources.loading && items.length === 0 ? (
          <Skeleton height={280} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Globe size={26} />} title="No sources yet" />
        ) : (
          <>
          <DataTable className="rounded-none border-0 shadow-none">
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Health</Th>
                <Th>Last checked</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((source) => (
                <tr key={source.id} className="transition-colors hover:bg-app-surface-2/40">
                  <Td>
                    <p className="font-semibold text-app-text">{source.name}</p>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-[380px] truncate text-[0.74rem] text-app-muted hover:text-app-accent"
                    >
                      {source.url}
                    </a>
                  </Td>
                  <Td>
                    <Badge tone="neutral">{source.kind ?? source.type}</Badge>
                  </Td>
                  <Td>
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
                  </Td>
                  <Td>
                    <Badge tone={source.health === "healthy" ? "success" : "danger"}>
                      {source.health ?? "unknown"}
                    </Badge>
                  </Td>
                  <Td className="text-[0.76rem]">
                    {source.last_checked_at ? formatDateTime(source.last_checked_at) : "never"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination
            page={sourcePage}
            pageSize={SOURCE_PAGE_SIZE}
            total={sources.data?.total ?? 0}
            onPageChange={setSourcePage}
          />
          </>
        )
      ) : null}

      {tab === "queue" ? (
        queue.error ? (
          <EmptyState
            icon={<ShieldCheck size={26} />}
            title="The review queue is not available to this account"
            description={
              /403|permission/i.test(queue.error)
                ? "Reviewing sources is a curator permission. Ask an administrator for the source curator role."
                : queue.error
            }
            action={
              <Button variant="outline" onClick={() => queue.refresh()}>
                Try again
              </Button>
            }
          />
        ) : queue.loading && !queue.data ? (
          <Skeleton height={200} />
        ) : (queue.data?.items?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={26} />}
            title="Queue is clear"
            description="No sources awaiting review."
          />
        ) : (
          <>
          <Rows className="rounded-app-lg border border-app-border bg-app-surface shadow-app-card">
            {queue.data?.items?.map((source) => (
              <Row key={source.id} as="li" className="items-center gap-4">
                <div className="min-w-[220px] flex-1">
                  <p className="text-[0.9rem] font-semibold text-app-text">{source.name}</p>
                  <p className="truncate text-[0.76rem] text-app-muted">{source.url}</p>
                </div>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<ScanSearch size={13} />}
                    loading={verifying === source.id}
                    onClick={() => void verify(source.id)}
                  >
                    Verify &amp; classify
                  </Button>
              </Row>
            ))}
          </Rows>
          <Pagination
            page={queuePage}
            pageSize={SOURCE_PAGE_SIZE}
            total={queue.data?.total ?? 0}
            onPageChange={setQueuePage}
          />
          </>
        )
      ) : null}

      {tab === "catalog" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[0.85rem] leading-relaxed text-app-muted">{catalog.data?.note}</p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.data?.adapters?.map((adapter) => (
              <li key={adapter.name}>
                <div className="h-full rounded-app-lg border border-app-border bg-app-surface p-4 shadow-app-card transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-lift">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Link2 size={15} className="text-app-accent" />
                    <strong className="text-[0.92rem] text-app-text">{adapter.name}</strong>
                  </div>
                  <p className="truncate text-[0.77rem] text-app-muted">{adapter.exampleUrl}</p>
                  <div className="mt-2.5">
                    <Badge tone="accent">{adapter.kind}</Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "submit" ? (
        <Panel>
          <PanelHead
            eyebrow="Contribution"
            title="Submit a job board"
            description="We fetch it safely from our own servers, classify the layout and add it to the rotation."
          />
          <div className="flex max-w-2xl flex-col gap-3 border-t border-app-border px-5 py-5">
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
        </Panel>
      ) : null}
    </Page>
  );
}
