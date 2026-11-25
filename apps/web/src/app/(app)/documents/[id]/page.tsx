"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  FileText,
  Plus,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Meter,
  Modal,
  Page,
  Panel,
  PanelHead,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  cx,
  useToast,
} from "@/components/ui";
import { PhotoBand } from "@/components/app-art";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import {
  buildPreviewHtml,
  parseDocument,
  serialiseDocument,
  type DocSection,
} from "@/lib/document";
import { formatDateTime, titleCase } from "@/lib/format";
import type { AtsReport, JobDocument, Opportunity } from "@/lib/types";
import {
  DEFAULT_COVER_LETTER_TEMPLATE_KEY,
  DEFAULT_RESUME_TEMPLATE_KEY,
} from "@angisoft/mboqara-contracts";
import { TemplateGallery } from "@/components/documents/TemplateGallery";
import { ATSSidebar } from "@/components/documents/ATSSidebar";

interface DocumentsResponse {
  documents: JobDocument[];
  total: number;
}

/**
 * The sheet the document prints on.
 *
 * A document preview is a page of paper, not an app surface: it keeps its
 * own print colours whatever theme is active, and each template sets its
 * own type. The rules that used to live in `.paper` in globals.css are
 * expressed here as Tailwind arbitrary variants (`[&_h2]:…`) so the preview
 * reads the same design system as the rest of the app.
 */
function paperSurface(template: string): string {
  return cx(
    "rounded-app-md bg-white p-9 text-[0.86rem] leading-relaxed text-[#16181d] shadow-app-lg",
    "[&_h1]:mb-1 [&_h1]:text-2xl [&_h1]:font-semibold",
    "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:pb-1 [&_h2]:text-[0.74rem]",
    "[&_h2]:tracking-[0.16em] [&_h2]:uppercase [&_h2]:text-[#5b6472]",
    "[&_ul]:my-2 [&_ul]:pl-5 [&_li]:mb-1",
    // The dark themes read the sheet with the app's own surface rather
    // than a white page: the selector is the html element that carries
    // data-theme, not this element.
    "[html[data-theme=terminal]_&]:bg-app-surface-solid [html[data-theme=terminal]_&]:text-app-text",
    "[html[data-theme=atlas]_&]:bg-app-surface-solid [html[data-theme=atlas]_&]:text-app-text",
    template === "ats-modern" &&
      "[&_h1]:border-l-4 [&_h1]:border-[#14b8a6] [&_h1]:pl-3 [&_h1]:text-[#0f766e] [&_h2]:text-[#115e59]",
    template === "ats-minimal" &&
      "p-11 font-serif [&_h1]:text-[1.8rem] [&_h1]:tracking-[-0.03em] [&_h2]:text-[0.8rem] [&_h2]:tracking-[0.04em] [&_h2]:text-[#374151] [&_h2]:border-0",
  );
}

interface TailoringProposal {
  sourceDocumentId: string;
  opportunityId: string;
  type: "cv" | "cover_letter";
  title: string;
  content: string;
  changes: string[];
  matchedRequirements: string[];
  uncoveredRequirements: string[];
}

function DocumentEditorInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [sections, setSections] = useState<DocSection[]>([]);
  const [title, setTitle] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [validating, setValidating] = useState(false);
  const [report, setReport] = useState<AtsReport | null>(null);
  const [tab, setTab] = useState("edit");
  const [dragging, setDragging] = useState<string | null>(null);
  // Definite value so the gallery can highlight a selection; overwritten by the
  // document's saved template once it loads (type-aware).
  const [template, setTemplate] = useState<string>(DEFAULT_RESUME_TEMPLATE_KEY);
  const [autoAtsCheck, setAutoAtsCheck] = useState(false);
  const [tailorOpen, setTailorOpen] = useState(false);
  const [tailorBusy, setTailorBusy] = useState(false);
  const [tailoringProposal, setTailoringProposal] = useState<TailoringProposal | null>(null);
  const [tailoringOpportunityId, setTailoringOpportunityId] = useState("");

  const { data, loading } = useApi<JobDocument>(`/documents/${params.id}`);
  // The library is asked for without its bodies: every paragraph of every
  // draft used to arrive whole to answer a question about titles and
  // versions. One page is enough to resolve a parent and list its versions.
  const list = useApi<DocumentsResponse>("/documents", {
    limit: 100,
    content: "false",
  });
  const opportunities = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 100 });
  const documentItems = list.data?.documents ?? [];
  const baseDocument = data?.parentDocumentId
    ? documentItems.find((document) => document.id === data.parentDocumentId)
    : data;
  const jobVersions = baseDocument
    ? documentItems.filter((document) => document.parentDocumentId === baseDocument.id)
    : [];

  useEffect(() => {
    if (!data) return;
    const parsed = parseDocument(data.content);
    setSections(parsed.sections);
    setTitle(data.title);
    setTailoringOpportunityId(data.opportunityId);
  }, [data]);

  // The server is the source of truth for the template. Adopt the saved key
  // once per document so switching documents does not inherit the previous
  // document's layout (the old localStorage key was global and never restored
  // a real catalogue key).
  const templateLoadFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || templateLoadFor.current === data.id) return;
    templateLoadFor.current = data.id;
    // Resume and cover-letter templates are separate catalogues, so the
    // default depends on the document type.
    setTemplate(
      data.template ??
        (data.type === "cover_letter"
          ? DEFAULT_COVER_LETTER_TEMPLATE_KEY
          : DEFAULT_RESUME_TEMPLATE_KEY),
    );
  }, [data]);

  const content = useMemo(() => serialiseDocument(title, sections), [title, sections]);
  const latestDraft = useRef({ title, content });
  latestDraft.current = { title, content };

  useEffect(() => {
    if (!dirty || !data) return;
    const snapshot = { title, content };
    // The id this draft belongs to. The App Router keeps the editor mounted
    // when the route moves to another document, and a timer that captured
    // the previous id would write the previous document's body onto the
    // next one — so the write carries its own id and refuses to move.
    const documentId = params.id;
    const timer = window.setTimeout(() => {
      setSaving(true);
      void api
        .patch(`/documents/${documentId}`, snapshot)
        .then(() => {
          if (
            latestDraft.current.title === snapshot.title &&
            latestDraft.current.content === snapshot.content
          ) {
            setDirty(false);
          }
        })
        .catch((caught) =>
          toast.push(caught instanceof Error ? caught.message : "Autosave failed", "danger"),
        )
        .finally(() => setSaving(false));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [content, data, dirty, params.id, title, toast]);

  const updateSection = (id: string, patch: Partial<DocSection>) => {
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    );
    setDirty(true);
  };

  const addSection = () => {
    setSections((current) => [
      ...current,
      {
        id: `sec-${Math.random().toString(36).slice(2, 10)}`,
        heading: "New section",
        body: "",
      },
    ]);
    setDirty(true);
  };

  const removeSection = (id: string) => {
    setSections((current) => current.filter((section) => section.id !== id));
    setDirty(true);
  };

  const moveSection = (id: string, direction: -1 | 1) => {
    setSections((current) => {
      const index = current.findIndex((section) => section.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(target, 0, moved);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/documents/${params.id}`, { title, content });
      setDirty(false);
      toast.push("Document saved", "success");
      if (autoAtsCheck) {
        // Trigger background ATS check
        validate().catch(() => {});
      }
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not save the document",
        "danger",
      );
    } finally {
      setSaving(false);
    }
  };

  const validate = async () => {
    setValidating(true);
    try {
      const response = await api.post<{ report: AtsReport }>("/documents/validate", {
        documentId: params.id,
        content,
      });
      setReport(response.report);
      setTab("ats");
      toast.push(
        `ATS score ${response.report.score} (${response.report.grade})`,
        response.report.passed ? "success" : "warning",
      );
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Validation failed",
        "danger",
      );
    } finally {
      setValidating(false);
    }
  };

  const createVersion = async () => {
    setCreatingVersion(true);
    try {
      await api.patch(`/documents/${params.id}`, { title, content });
      const response = await api.post<{ document: JobDocument }>(`/documents/${params.id}/versions`, {});
      toast.push("Independent copy created. Your original is unchanged.", "success");
      router.push(`/documents/${response.document.id}`);
    } catch (caught) {
      toast.push(caught instanceof Error ? caught.message : "Could not create a copy", "danger");
    } finally {
      setCreatingVersion(false);
    }
  };

  const prepareTailoredVersion = async () => {
    if (!tailoringOpportunityId) {
      toast.push("Choose the job you want to tailor this document for", "warning");
      return;
    }
    setTailorBusy(true);
    setTailoringProposal(null);
    try {
      await api.patch(`/documents/${params.id}`, { title, content });
      const response = await api.post<{ proposal: TailoringProposal }>(
        `/documents/${params.id}/tailor`,
        { opportunityId: tailoringOpportunityId },
      );
      setTailoringProposal(response.proposal);
      toast.push("Tailored draft is ready for your review", "success");
    } catch (caught) {
      toast.push(caught instanceof Error ? caught.message : "Could not tailor this document", "danger");
    } finally {
      setTailorBusy(false);
    }
  };

  const saveTailoredVersion = async () => {
    if (!tailoringProposal) return;
    setTailorBusy(true);
    try {
      const response = await api.post<{ document: JobDocument }>(
        `/documents/${params.id}/versions`,
        {
          title: tailoringProposal.title,
          content: tailoringProposal.content,
          opportunityId: tailoringProposal.opportunityId,
        },
      );
      toast.push("Job-specific copy saved. Your source document is unchanged.", "success");
      setTailorOpen(false);
      router.push(`/documents/${response.document.id}`);
    } catch (caught) {
      toast.push(caught instanceof Error ? caught.message : "Could not save the tailored copy", "danger");
    } finally {
      setTailorBusy(false);
    }
  };

  const exportDocument = async (format: "pdf" | "docx" | "pptx" | "png") => {
    try {
      await api.patch(`/documents/${params.id}`, { title, content, template });
      const blob = await api.postBlob(`/documents/${params.id}/export`, { format, template });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.push(`Exported ${format.toUpperCase()}`, "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Export failed",
        "danger",
      );
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton height={32} width={240} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton height={420} />
          <Skeleton height={420} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Document not found"
        description="It may have been deleted or belongs to another account."
        action={
          <Link href="/documents">
            <Button variant="outline">Back to documents</Button>
          </Link>
        }
      />
    );
  }

  return (
    <Page>
      <div>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => router.back()}>
          Back
        </Button>
      </div>

      <PhotoBand
        src="https://cdn1.angisoft.co.ke/mboqara/images/mboqara/careers/engineering-professional.webp"
        alt="A person working on a document"
        priority
        height="clamp(210px, 24vw, 280px)"
      >
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[0.64rem] font-semibold tracking-[0.22em] text-white/70 uppercase">
          <span aria-hidden className="h-px w-8 bg-white/60" />
          {titleCase(data.type)} editor
          <span aria-hidden className="text-white/30">
            /
          </span>
          Last saved {formatDateTime(data.createdAt)}
        </p>
        <h1 className="mt-3 max-w-[30ch] text-[clamp(1.7rem,3.6vw,2.6rem)] leading-[1.03] font-semibold tracking-[-0.03em] text-balance text-white">
          {title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-app-pill border px-2.5 py-1 text-[0.72rem] font-medium",
              dirty
                ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                : "border-emerald-300/40 bg-emerald-300/15 text-emerald-100",
            )}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="border-white/25 bg-white/10 text-white hover:bg-white/20"
            icon={<Wand2 size={14} />}
            loading={validating}
            onClick={() => void validate()}
          >
            ATS check
          </Button>
          {data.type === "cv" || data.type === "cover_letter" ? (
            <Button
              variant="ghost"
              size="sm"
              className="border-white/25 bg-white/10 text-white hover:bg-white/20"
              icon={<Wand2 size={14} />}
              onClick={() => {
                setTailoringProposal(null);
                setTailorOpen(true);
              }}
            >
              Tailor for a job
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="border-white/25 bg-white/10 text-white hover:bg-white/20"
            icon={<FileText size={14} />}
            loading={creatingVersion}
            onClick={() => void createVersion()}
          >
            Duplicate
          </Button>
          <Button size="sm" icon={<Save size={14} />} loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </PhotoBand>

      <div className="flex flex-wrap items-center gap-2">
        <TemplateGallery
          selectedTemplate={template}
          documentType={data.type === "cover_letter" ? "cover_letter" : "cv"}
          onSelect={(key) => {
            setTemplate(key);
            void api
              .patch(`/documents/${params.id}`, { template: key })
              .catch((caught) =>
                toast.push(
                  caught instanceof Error ? caught.message : "Could not save template",
                  "danger",
                ),
              );
          }}
          className="min-w-[280px] flex-1"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
            Export
          </span>
          {(["pdf", "docx", "pptx", "png"] as const).map((format) => (
            <Button
              key={format}
              variant="ghost"
              size="sm"
              icon={<Download size={13} />}
              onClick={() => void exportDocument(format)}
            >
              {format.toUpperCase()}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-[0.74rem] text-app-muted">
          Last saved {formatDateTime(data.createdAt)}
        </span>
      </div>

      {data.parentDocumentId && baseDocument ? (
        <Panel className="px-4 py-3">
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
            Job-specific version
          </p>
          <p className="mt-1 text-[0.84rem] text-app-soft">
            Based on{" "}
            <Link href={`/documents/${baseDocument.id}`} className="text-app-accent hover:underline">
              {baseDocument.title}
            </Link>
          </p>
          {jobVersions.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {jobVersions.map((version) => (
                <Link key={version.id} href={`/documents/${version.id}`}>
                  <Badge tone={version.id === data.id ? "accent" : "neutral"}>{version.title}</Badge>
                </Link>
              ))}
            </div>
          ) : null}
        </Panel>
      ) : null}
      {!data.parentDocumentId && jobVersions.length > 0 ? (
        <Panel className="px-4 py-3">
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
            Job-specific versions · {jobVersions.length}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {jobVersions.map((version) => (
              <Link key={version.id} href={`/documents/${version.id}`}>
                <Badge tone="accent">{version.title}</Badge>
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}

      <Tabs
        tabs={[
          { key: "edit", label: "Editor" },
          { key: "preview", label: "Preview" },
          { key: "ats", label: "ATS report", count: report?.issues.length },
          { key: "library", label: "All documents", count: list.data?.documents.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "edit" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2.5">
            <Panel className="p-3.5">
              <Field label="Document title">
                <Input
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
            </Panel>

            {sections.map((section, index) => (
              <div
                key={section.id}
                className={cx(
                  "overflow-hidden rounded-app-md border border-app-border bg-app-surface",
                  "transition-[border-color,box-shadow] duration-150 focus-within:border-app-accent focus-within:ring-2 focus-within:ring-app-accent/20",
                )}
              >
                <div className="flex items-center gap-2 border-b border-app-border bg-app-surface-2/60 px-3 py-2">
                  <span
                    className="cursor-grab text-[0.7rem] tracking-[-0.1em] text-app-muted select-none"
                    draggable
                    onDragStart={() => setDragging(section.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!dragging || dragging === section.id) return;
                      const from = sections.findIndex((item) => item.id === dragging);
                      const to = sections.findIndex((item) => item.id === section.id);
                      setSections((current) => {
                        const next = [...current];
                        const [moved] = next.splice(from, 1);
                        if (!moved) return current;
                        next.splice(to, 0, moved);
                        return next;
                      });
                      setDirty(true);
                      setDragging(null);
                    }}
                    aria-label="Drag to reorder section"
                  >
                    ⠿
                  </span>
                  <input
                    value={section.heading}
                    onChange={(event) => updateSection(section.id, { heading: event.target.value })}
                    aria-label="Section heading"
                    className="min-w-0 flex-1 border-none bg-transparent text-[0.86rem] font-bold text-app-text outline-none"
                  />
                  <span className="font-mono text-[0.7rem] text-app-muted">{index + 1}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Move section up"
                    onClick={() => moveSection(section.id, -1)}
                  >
                    <ArrowUp size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Move section down"
                    onClick={() => moveSection(section.id, 1)}
                  >
                    <ArrowDown size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove section"
                    onClick={() => removeSection(section.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
                <div className="p-3">
                  <textarea
                    value={section.body}
                    onChange={(event) => updateSection(section.id, { body: event.target.value })}
                    placeholder="Write with action verbs and measurable results."
                    className="min-h-[120px] w-full resize-y border-none bg-transparent text-[0.88rem] leading-relaxed text-app-text outline-none placeholder:text-app-muted"
                  />
                </div>
              </div>
            ))}

            <div>
              <Button variant="outline" icon={<Plus size={15} />} onClick={addSection}>
                Add section
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:sticky lg:top-20">
            <ATSSidebar
              documentId={params.id}
              content={content}
              opportunityId={tailoringOpportunityId || data.opportunityId}
            />
            <Panel className="overflow-hidden">
              <PanelHead
                eyebrow="Live preview"
                title="How it prints"
                className="border-b border-app-border"
              />
              <div className="bg-app-surface-2/50 p-4">
                <div className={paperSurface(template)}>
                  <h1>{title}</h1>
                  <div
                    className="mb-1 border-b border-[#e3e6eb] pb-2.5 text-[0.8rem] text-[#5b6472]"
                    dangerouslySetInnerHTML={{
                      __html: buildPreviewHtml(title, sections.slice(0, 1)),
                    }}
                  />
                  <div
                    dangerouslySetInnerHTML={{
                      __html: buildPreviewHtml(title, sections.slice(1)),
                    }}
                  />
                </div>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "preview" ? (
        <Panel className="p-6">
          <div className={cx("mx-auto max-w-[780px]", paperSurface(template))}>
            <h1>{title}</h1>
            <div dangerouslySetInnerHTML={{ __html: buildPreviewHtml(title, sections) }} />
          </div>
        </Panel>
      ) : null}

      {tab === "ats" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <Panel className="p-4 sm:p-5">
            <PanelHead eyebrow="ATS readiness" title="Parser simulation" className="px-0 py-0" />
            {report ? (
              <div className="mt-4">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-[0.86rem] text-app-soft">Overall score</span>
                  <span className="text-[1.6rem] leading-none font-bold tabular-nums text-app-text">
                    {report.score}
                  </span>
                </div>
                <Meter value={report.score} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={report.passed ? "success" : "danger"}>{report.grade}</Badge>
                  <Badge tone="neutral">{report.issues.length} issues</Badge>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <Metric label="Words" value={report.metrics.wordCount} />
                  <Metric label="Bullets" value={report.metrics.bulletCount} />
                  <Metric
                    label="Keyword coverage"
                    value={`${Math.round(report.metrics.keywordCoverage * 100)}%`}
                  />
                  <Metric label="Avg bullet" value={`${report.metrics.averageBulletLength}w`} />
                </div>

                <div className="mt-4 flex flex-col gap-0.5">
                  {(
                    [
                      ["Contact", report.metrics.hasContactSection],
                      ["Experience", report.metrics.hasExperienceSection],
                      ["Education", report.metrics.hasEducationSection],
                      ["Skills", report.metrics.hasSkillsSection],
                    ] as const
                  ).map(([label, present]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between border-b border-app-border/60 py-1.5 last:border-b-0"
                    >
                      <span className="text-[0.84rem] text-app-soft">{label}</span>
                      <Badge tone={present ? "success" : "warning"}>
                        {present ? "found" : "missing"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={<FileText size={26} />}
                  title="Not checked yet"
                  description="Run an ATS check to simulate how a recruiter's parser and keyword filters will read this document."
                  action={
                    <Button size="sm" loading={validating} onClick={() => void validate()}>
                      Run ATS check
                    </Button>
                  }
                />
              </div>
            )}
          </Panel>

          <Panel className="p-4 sm:p-5">
            <PanelHead eyebrow="Findings" title="What to fix" className="px-0 py-0" />
            <div className="mt-4 flex flex-col gap-2">
              {!report ? (
                <p className="text-[0.86rem] text-app-muted">No findings yet.</p>
              ) : report.issues.length === 0 ? (
                <div className="rounded-app-md bg-app-success/10 px-3.5 py-3 text-[0.86rem] leading-relaxed text-app-soft">
                  Nothing to fix. This document should pass a standard applicant tracking system.
                </div>
              ) : (
                report.issues.map((issue, index) => (
                  <div
                    key={`${issue.code}-${index}`}
                    className={cx(
                      "rounded-app-sm border border-app-border px-3 py-2.5",
                      issue.severity === "error"
                        ? "border-l-[3px] border-l-app-danger"
                        : issue.severity === "warning"
                          ? "border-l-[3px] border-l-app-warning"
                          : "border-l-[3px] border-l-app-info",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-[0.86rem] text-app-text">{issue.message}</strong>
                      <Badge
                        tone={
                          issue.severity === "error"
                            ? "danger"
                            : issue.severity === "warning"
                              ? "warning"
                              : "info"
                        }
                      >
                        {issue.severity}
                      </Badge>
                    </div>
                    {issue.hint ? (
                      <p className="mt-1 text-[0.8rem] leading-relaxed text-app-muted">{issue.hint}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {report && report.metrics.missingKeywords.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1.5 text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                  Missing keywords
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {report.metrics.missingKeywords.slice(0, 20).map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-[6px] bg-app-warning/15 px-2 py-0.5 text-[0.74rem] text-app-warning"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>
        </div>
      ) : null}

      {tab === "library" ? (
        <div className="flex flex-col gap-2">
          {documentItems.map((document) => (
            <Link
              key={document.id}
              href={`/documents/${document.id}`}
              className={cx(
                "flex items-center gap-3 rounded-app-md border border-app-border bg-app-surface px-3.5 py-3",
                "transition-colors duration-150 hover:border-app-border-strong hover:bg-app-surface-2/50",
              )}
            >
              <FileText size={16} className="shrink-0 text-app-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9rem] font-semibold text-app-text">{document.title}</p>
                <p className="text-[0.74rem] text-app-muted">
                  {titleCase(document.type)} · {formatDateTime(document.createdAt)}
                </p>
              </div>
              {document.id === params.id ? <Badge tone="accent">open</Badge> : null}
            </Link>
          ))}
        </div>
      ) : null}

      <Modal
        open={tailorOpen}
        onClose={() => setTailorOpen(false)}
        title="Tailor this document for a job"
        width={820}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTailorOpen(false)}>
              Cancel
            </Button>
            {tailoringProposal ? (
              <>
                <Button
                  variant="outline"
                  loading={tailorBusy}
                  onClick={() => void prepareTailoredVersion()}
                >
                  Regenerate proposal
                </Button>
                <Button loading={tailorBusy} onClick={() => void saveTailoredVersion()}>
                  Save as job version
                </Button>
              </>
            ) : (
              <Button loading={tailorBusy} onClick={() => void prepareTailoredVersion()}>
                Prepare tailored draft
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-[0.86rem] leading-relaxed text-app-muted">
            MboQara analyses this document against the role title, posting, requirements and
            responsibilities. It creates a separate draft, keeps the original intact, and leaves the
            final review to you.
          </p>
          <Field label="Target job">
            <Select
              value={tailoringOpportunityId}
              onChange={(event) => setTailoringOpportunityId(event.target.value)}
            >
              <option value="">Choose a job…</option>
              {(opportunities.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {item.companyName}
                </option>
              ))}
            </Select>
          </Field>
          {tailorBusy && !tailoringProposal ? (
            <div className="rounded-app-md border border-app-border bg-app-surface-2/50 p-4 text-[0.84rem] text-app-soft">
              The document agents are comparing your evidence with the role and preparing a
              reviewable draft…
            </div>
          ) : null}
          {tailoringProposal ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Panel className="p-3.5">
                  <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                    What changed
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.82rem] text-app-soft">
                    {tailoringProposal.changes.map((change, index) => (
                      <li key={`${index}-${change}`}>{change}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                    Supported requirements
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.82rem] text-app-soft">
                    {tailoringProposal.matchedRequirements.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </Panel>
                <Panel className="p-3.5">
                  <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                    Gaps to review honestly
                  </p>
                  {tailoringProposal.uncoveredRequirements.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.82rem] text-app-soft">
                      {tailoringProposal.uncoveredRequirements.map((item, index) => (
                        <li key={`${index}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[0.82rem] text-app-soft">
                      No uncovered requirements were identified from the provided job posting.
                    </p>
                  )}
                  <p className="mt-2.5 text-[0.76rem] text-app-muted">
                    A gap is not a suggestion to add a skill or experience you do not have.
                  </p>
                </Panel>
              </div>
              <Field label="Version name">
                <Input
                  value={tailoringProposal.title}
                  onChange={(event) =>
                    setTailoringProposal((current) =>
                      current ? { ...current, title: event.target.value } : current,
                    )
                  }
                />
              </Field>
              <Field label="Review and edit the proposed document">
                <Textarea
                  className="min-h-[320px]"
                  value={tailoringProposal.content}
                  onChange={(event) =>
                    setTailoringProposal((current) =>
                      current ? { ...current, content: event.target.value } : current,
                    )
                  }
                />
              </Field>
            </>
          ) : null}
        </div>
      </Modal>
    </Page>
  );
}

export default function DocumentEditorPage() {
  const params = useParams<{ id: string }>();
  // Keyed by id: the editor holds the draft in its own state and autosaves
  // it, so keeping one instance mounted across a route change would show
  // the previous document's body under the next document's title.
  return <DocumentEditorInner key={params.id} />;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-app-sm border border-app-border px-3 py-2.5">
      <p className="text-[0.64rem] font-semibold tracking-[0.12em] text-app-muted uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-[1.05rem] leading-none font-bold tabular-nums text-app-text">
        {value}
      </p>
    </div>
  );
}
