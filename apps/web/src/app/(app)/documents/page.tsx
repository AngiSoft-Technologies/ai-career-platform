"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState , Suspense } from "react";
import { FilePlus2, FileText, Sparkles } from "lucide-react";
import { Badge, Button, Card, EmptyState, SectionTitle, Skeleton, useToast } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import type { JobDocument, Opportunity } from "@/lib/types";

interface DocumentsResponse {
  items: JobDocument[];
  documents: JobDocument[];
}

function DocumentsPageInner() {
  const params = useSearchParams();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [opportunityId, setOpportunityId] = useState(params.get("opportunityId") ?? "");
  const [type, setType] = useState("cv");

  const documents = useApi<DocumentsResponse>("/documents");
  const opportunities = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 30 });

  const items = documents.data?.items ?? documents.data?.documents ?? [];

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
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div>
        <div className="eyebrow">Documents</div>
        <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
          Your application kit
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
          Keep a source resume, create job-specific copies, and prepare matching cover letters. Review edits and gaps before exporting.
        </p>
      </div>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle
          eyebrow="Generate"
          title="Create a new document"
          description="Generated from your real profile and the live job description. Nothing is invented."
        />
        <div className="row row-wrap" style={{ gap: "0.6rem", marginTop: "0.9rem", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 240 }}>
            <span className="label">Opportunity</span>
            <select
              className="select"
              value={opportunityId}
              onChange={(event) => setOpportunityId(event.target.value)}
            >
              <option value="">Choose a role…</option>
              {(opportunities.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {item.companyName}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ width: 190 }}>
            <span className="label">Type</span>
            <select className="select" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="cv">Resume / CV</option>
              <option value="cover_letter">Cover letter</option>
              <option value="application_email">Application email</option>
              <option value="answer">Application answers</option>
            </select>
          </label>
          <Button icon={<Sparkles size={15} />} loading={generating} onClick={() => void generate()}>
            Generate
          </Button>
        </div>
      </Card>

      {documents.loading ? (
        <div className="stack">
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText size={28} />}
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
        <div className="grid-2">
          {items.map((document) => (
            <Link
              key={document.id}
              href={`/documents/${document.id}`}
              className="surface surface-hover"
              style={{ padding: "1rem 1.1rem" }}
            >
              <div className="row" style={{ justifyContent: "space-between", gap: "0.6rem" }}>
                <FileText size={18} style={{ color: "var(--text-muted)" }} />
                <Badge tone="accent">{document.parentDocumentId ? "Job version" : titleCase(document.type)}</Badge>
              </div>
              <h3 style={{ fontSize: "1rem", marginTop: "0.7rem" }}>{document.title}</h3>
              <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 4 }}>
                Created {formatDateTime(document.createdAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="stack" style={{ gap: "0.6rem" }}><div className="surface" style={{ padding: "1rem" }} /><div className="surface" style={{ padding: "1rem" }} /></div>}>
      <DocumentsPageInner />
    </Suspense>
  );
}
