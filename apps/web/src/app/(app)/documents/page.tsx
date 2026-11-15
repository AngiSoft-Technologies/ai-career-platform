"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FilePlus2, FileText, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  SectionTitle,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
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
      toast.push(
        caught instanceof Error ? caught.message : "Generation failed",
        "danger",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Documents"
        title="Your application kit"
        description="Keep a source resume, create job-specific copies, and prepare matching cover letters. Review edits and gaps before exporting."
        actions={
          <Link href="/opportunities">
            <Button variant="outline" size="sm" icon={<FilePlus2 size={14} />}>
              Find a role
            </Button>
          </Link>
        }
      />

      <Card className="p-4 sm:p-5">
        <SectionTitle
          eyebrow="Generate"
          title="Create a new document"
          description="Generated from your real profile and the live job description. Nothing is invented."
        />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Opportunity" className="min-w-[240px] flex-1">
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
          <Field label="Type" className="w-[200px]">
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
          >
            Generate
          </Button>
        </div>
      </Card>

      {documents.error && items.length === 0 ? (
        <EmptyState
          icon={<FileText size={26} />}
          title="Could not load your documents"
          description={documents.error}
          action={
            <Button variant="outline" onClick={() => documents.refresh()}>
              Try again
            </Button>
          }
        />
      ) : documents.loading && items.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText size={26} />}
          title="No documents yet"
          description="Generate your first document from a role you are interested in."
          action={
            <Link href="/opportunities">
              <Button size="sm" icon={<FilePlus2 size={14} />}>
                Find a role
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((document) => (
            <li key={document.id}>
              <Link
                href={`/documents/${document.id}`}
                className="group flex h-full flex-col rounded-app-lg border border-app-border bg-app-surface p-4 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-app-border-strong hover:shadow-app-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-9 place-items-center rounded-app-md bg-app-surface-2 text-app-muted">
                    <FileText size={17} />
                  </span>
                  <Badge tone="accent">
                    {document.parentDocumentId ? "Job version" : titleCase(document.type)}
                  </Badge>
                </div>
                <h3 className="mt-3 text-[0.98rem] leading-snug font-semibold text-app-text">
                  {document.title}
                </h3>
                <p className="mt-auto pt-2 text-[0.74rem] text-app-muted">
                  Created {formatDateTime(document.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 ? (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      ) : null}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      }
    >
      <DocumentsPageInner />
    </Suspense>
  );
}
