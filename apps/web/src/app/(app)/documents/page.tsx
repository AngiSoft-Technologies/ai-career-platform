"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowUpRight, FilePlus2, FileText, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Page,
  Pagination,
  Panel,
  PanelHead,
  Select,
  Skeleton,
  cx,
  useToast,
} from "@/components/ui";
import { EmptyDocumentArt, HeroSplit } from "@/components/app-art";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import type { JobDocument, Opportunity } from "@/lib/types";

interface DocumentsResponse {
  items: JobDocument[];
  documents: JobDocument[];
  total: number;
}

const PAGE_SIZE = 24;

const DOCUMENT_LABELS: Record<string, string> = {
  cv: "CV",
  resume: "Resume",
  cover_letter: "Cover letter",
  application_email: "Application email",
  answer: "Application answers",
};

function documentLabel(type: string) {
  return DOCUMENT_LABELS[type] ?? titleCase(type);
}

/** A paper-coloured thumbnail of a document, drawn from its type. */
function PaperPreview({ type }: { type: string }) {
  const cover = type === "cover_letter";
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-app-sm border border-app-border bg-[#f6f1e7] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="h-2 w-14 rounded-full bg-[#1a1712]/70" />
        <div className="h-2 w-6 rounded-full bg-[#b3200f]/50" />
      </div>
      <div className="mt-2 h-1.5 w-24 rounded-full bg-[#1a1712]/25" />
      <div className="mt-4 flex flex-col gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((line) => (
          <div
            key={line}
            className="h-1 rounded-full bg-[#1a1712]/15"
            style={{ width: `${cover ? [92, 84, 88, 70, 90, 54][line] : [68, 92, 88, 94, 60, 80][line]}%` }}
          />
        ))}
      </div>
      <div className="mt-4 flex gap-1">
        {["#1f4e79", "#b3200f", "#1a1712"].map((tone) => (
          <span
            key={tone}
            className="h-1.5 w-6 rounded-full"
            style={{ background: `${tone}33` }}
          />
        ))}
      </div>
    </div>
  );
}

function DocumentsPageInner() {
  const params = useSearchParams();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [opportunityId, setOpportunityId] = useState(params.get("opportunityId") ?? "");
  const [type, setType] = useState("cv");
  const [page, setPage] = useState(1);

  const documents = useApi<DocumentsResponse>("/documents", {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const opportunities = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 100 });

  const items = documents.data?.items ?? documents.data?.documents ?? [];
  const total = documents.data?.total ?? 0;
  const tailored = items.filter((item) => item.parentDocumentId).length;
  const covers = items.filter((item) => item.type === "cover_letter").length;

  const generate = async () => {
    if (!opportunityId) {
      toast.push("Pick an opportunity first", "warning");
      return;
    }
    setGenerating(true);
    try {
      const response = await api.post<{ document: JobDocument }>("/documents/generate", {
        opportunityId,
        type,
      });
      toast.push("Document generated", "success");
      window.location.href = `/documents/${response.document.id}`;
    } catch (caught) {
      toast.push(caught instanceof Error ? caught.message : "Generation failed", "danger");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Page>
      <HeroSplit
        src="https://cdn.angisoft.co.ke/public/images/mboqara/handshake.webp"
        alt="A handshake after an interview"
        eyebrow="Documents"
        priority
        title="Your application kit"
        description="A source resume, job-specific editions and the cover letters that go with them. Generated from your real profile and the live description — nothing is invented."
        actions={
          <Link href="/opportunities">
            <Button variant="outline" size="sm" icon={<FilePlus2 size={14} />}>
              Find a role
            </Button>
          </Link>
        }
        stats={[
          { label: "Documents", value: total.toLocaleString(), hint: "in the library" },
          { label: "Tailored", value: tailored.toLocaleString(), hint: "on this page" },
          { label: "Cover letters", value: covers.toLocaleString(), hint: "on this page" },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="font-mono text-[0.56rem] tracking-[0.18em] text-app-muted uppercase">
              {stat.label}
            </dt>
            <dd className="mt-1.5 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums text-app-text">
              {stat.value}
            </dd>
            <dd className="mt-1 text-[0.7rem] text-app-muted">{stat.hint}</dd>
          </div>
        ))}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex items-baseline justify-between gap-3 border-b border-app-border pb-2">
            <h2 className="text-[0.95rem] font-medium text-app-text">Library</h2>
            <span className="font-mono text-[0.66rem] tracking-[0.1em] text-app-muted uppercase">
              {total.toLocaleString()} document{total === 1 ? "" : "s"}
            </span>
          </div>

          {documents.error && items.length === 0 ? (
            <EmptyState
              icon={<FileText size={22} />}
              title="Could not load your documents"
              description={documents.error}
              action={
                <Button variant="outline" onClick={() => documents.refresh()}>
                  Try again
                </Button>
              }
            />
          ) : documents.loading && items.length === 0 ? (
            <div className="flex flex-col gap-2">
              <Skeleton height={118} />
              <Skeleton height={118} />
              <Skeleton height={118} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<EmptyDocumentArt />}
              title="No documents yet"
              description="Pick a role on the right and we will draft the first version from your profile."
              action={
                <Link href="/opportunities">
                  <Button size="sm" icon={<FilePlus2 size={14} />}>
                    Find a role
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-app-border border-y border-app-border">
              {items.map((document) => (
                <li key={document.id}>
                  <Link
                    href={`/documents/${document.id}`}
                    className="group flex items-center gap-5 py-4 transition-colors duration-150"
                  >
                    <div className="w-[104px] shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5">
                      <PaperPreview type={document.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[0.98rem] leading-snug font-medium text-app-text group-hover:text-app-accent">
                        {document.title}
                      </h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-app-muted">
                        <span>{document.parentDocumentId ? "Tailored edition" : "Source document"}</span>
                        <span aria-hidden>·</span>
                        <span className="font-mono">{formatDateTime(document.createdAt)}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={document.parentDocumentId ? "accent" : "neutral"}>
                          {documentLabel(document.type)}
                        </Badge>
                        {document.template ? (
                          <span className="rounded-app-sm border border-app-border px-1.5 py-0.5 font-mono text-[0.66rem] text-app-muted">
                            {document.template}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ArrowUpRight
                      size={16}
                      className="shrink-0 text-app-muted transition-colors duration-150 group-hover:text-app-accent"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 ? (
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-[92px]">
          <Panel>
            <PanelHead
              eyebrow="Generate"
              title="New document"
              description="Start from a live role so the language matches the posting."
            />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <Field label="Opportunity">
                <Select
                  value={opportunityId}
                  onChange={(event) => setOpportunityId(event.target.value)}
                >
                  <option value="">Choose a role…</option>
                  {(opportunities.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.companyName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type">
                <Select value={type} onChange={(event) => setType(event.target.value)}>
                  <option value="cv">Resume / CV</option>
                  <option value="cover_letter">Cover letter</option>
                  <option value="application_email">Application email</option>
                  <option value="answer">Application answers</option>
                </Select>
              </Field>
              <Button
                icon={<Sparkles size={15} />}
                loading={generating}
                onClick={() => void generate()}
                className="w-full"
              >
                Generate draft
              </Button>
              <p className="text-[0.72rem] leading-relaxed text-app-muted">
                Every draft is editable. Nothing is sent, submitted or shared until you export it.
              </p>
            </div>
          </Panel>
        </aside>
      </div>
    </Page>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton height={260} />
          <Skeleton height={260} />
        </div>
      }
    >
      <DocumentsPageInner />
    </Suspense>
  );
}
