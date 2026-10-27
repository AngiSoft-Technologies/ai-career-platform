"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileText,
  GripVertical,
  Plus,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Meter,
  Modal,
  SectionTitle,
  Skeleton,
  Tabs,
  useToast,
} from "@/components/ui";
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

interface DocumentsResponse {
  documents: JobDocument[];
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

export default function DocumentEditorPage() {
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
  const [template, setTemplate] = useState<"classic" | "modern" | "minimal">("classic");
  const [tailorOpen, setTailorOpen] = useState(false);
  const [tailorBusy, setTailorBusy] = useState(false);
  const [tailoringProposal, setTailoringProposal] = useState<TailoringProposal | null>(null);
  const [tailoringOpportunityId, setTailoringOpportunityId] = useState("");

  const { data, loading } = useApi<JobDocument>(`/documents/${params.id}`);
  const list = useApi<DocumentsResponse>("/documents");
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

  useEffect(() => {
    const saved = window.localStorage.getItem("job-radar-document-template");
    if (saved === "classic" || saved === "modern" || saved === "minimal") setTemplate(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("job-radar-document-template", template);
  }, [template]);

  const content = useMemo(() => serialiseDocument(title, sections), [title, sections]);
  const latestDraft = useRef({ title, content });
  latestDraft.current = { title, content };

  useEffect(() => {
    if (!dirty || !data) return;
    const snapshot = { title, content };
    const timer = window.setTimeout(() => {
      setSaving(true);
      void api.patch(`/documents/${params.id}`, snapshot)
        .then(() => {
          if (latestDraft.current.title === snapshot.title && latestDraft.current.content === snapshot.content) {
            setDirty(false);
          }
        })
        .catch((caught) => toast.push(caught instanceof Error ? caught.message : "Autosave failed", "danger"))
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
      await api.patch(`/documents/${params.id}`, { title, content });
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
      <div className="stack">
        <Skeleton height={32} width={240} />
        <div className="editor-pane">
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
    <div className="stack" style={{ gap: "1.1rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: "0.6rem" }}>
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => router.back()}>
            Back
          </Button>
          <div>
            <div className="eyebrow">{titleCase(data.type)} editor</div>
            <h1 className="display" style={{ fontSize: "clamp(1.3rem, 3vw, 1.9rem)" }}>
              {title}
            </h1>
          </div>
        </div>
        <div className="row row-wrap" style={{ gap: "0.4rem" }}>
          <Badge tone={dirty ? "warning" : "success"}>{saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</Badge>
          <Button variant="outline" size="sm" icon={<Wand2 size={14} />} loading={validating} onClick={() => void validate()}>
            ATS check
          </Button>
          {data.type === "cv" || data.type === "cover_letter" ? (
            <Button variant="outline" size="sm" icon={<Wand2 size={14} />} onClick={() => { setTailoringProposal(null); setTailorOpen(true); }}>
              Tailor for a job
            </Button>
          ) : null}
          <Button variant="outline" size="sm" icon={<FileText size={14} />} loading={creatingVersion} onClick={() => void createVersion()}>
            Duplicate document
          </Button>
          <Button size="sm" icon={<Save size={14} />} loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>

      <div className="row row-wrap" style={{ gap: "0.4rem" }}>
        <label className="row" style={{ gap: "0.4rem", marginRight: "0.5rem" }}>
          <span className="eyebrow">Template</span>
          <select className="select" value={template} onChange={(event) => setTemplate(event.target.value as typeof template)} style={{ width: 130, padding: "0.35rem 0.5rem" }}>
            <option value="classic">Classic</option>
            <option value="modern">Modern</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>
        <span className="eyebrow">Export</span>
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
        <span className="spacer" />
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
          Last saved {formatDateTime(data.createdAt)}
        </span>
      </div>

      {data.parentDocumentId && baseDocument ? (
        <Card style={{ padding: "0.8rem 1rem" }}>
          <span className="eyebrow">Job-specific version</span>
          <span style={{ marginLeft: "0.5rem", fontSize: "0.84rem" }}>Based on <Link href={`/documents/${baseDocument.id}`} style={{ color: "var(--accent)" }}>{baseDocument.title}</Link></span>
          {jobVersions.length > 0 ? (
            <div className="row row-wrap" style={{ gap: "0.45rem", marginTop: "0.6rem" }}>
              {jobVersions.map((version) => <Link key={version.id} href={`/documents/${version.id}`}><Badge tone={version.id === data.id ? "accent" : "neutral"}>{version.title}</Badge></Link>)}
            </div>
          ) : null}
        </Card>
      ) : null}
      {!data.parentDocumentId && jobVersions.length > 0 ? (
        <Card style={{ padding: "0.8rem 1rem" }}>
          <div className="eyebrow">Job-specific versions · {jobVersions.length}</div>
          <div className="row row-wrap" style={{ gap: "0.45rem", marginTop: "0.6rem" }}>
            {jobVersions.map((version) => <Link key={version.id} href={`/documents/${version.id}`}><Badge tone="accent">{version.title}</Badge></Link>)}
          </div>
        </Card>
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
        <div className="editor-pane">
          <div className="stack" style={{ gap: "0.6rem" }}>
            <Card style={{ padding: "0.85rem" }}>
              <div className="field">
                <span className="label">Document title</span>
                <input
                  className="input"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setDirty(true);
                  }}
                />
              </div>
            </Card>

            {sections.map((section, index) => (
              <div key={section.id} className="editor-block">
                <div className="editor-block-head">
                  <span
                    className="drag-handle"
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
                  >
                    ⠿
                  </span>
                  <input
                    value={section.heading}
                    onChange={(event) => updateSection(section.id, { heading: event.target.value })}
                    aria-label="Section heading"
                    style={{
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--text)",
                      fontWeight: 700,
                      fontSize: "0.86rem",
                      flex: 1,
                      fontFamily: "var(--font-body)",
                    }}
                  />
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {index + 1}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => moveSection(section.id, -1)}>
                    ↑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => moveSection(section.id, 1)}>
                    ↓
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeSection(section.id)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
                <div className="editor-block-body">
                  <textarea
                    className="textarea"
                    value={section.body}
                    onChange={(event) => updateSection(section.id, { body: event.target.value })}
                    placeholder="Write with action verbs and measurable results."
                    style={{ minHeight: 120, background: "transparent" }}
                  />
                </div>
              </div>
            ))}

            <Button variant="outline" icon={<Plus size={15} />} onClick={addSection}>
              Add section
            </Button>
          </div>

          <div style={{ position: "sticky", top: "5.5rem" }}>
            <Card style={{ padding: "0" }}>
              <div style={{ padding: "0.8rem 1rem", borderBottom: "1px solid var(--border)" }}>
                <SectionTitle eyebrow="Live preview" title="How it prints" />
              </div>
              <div style={{ padding: "1rem", background: "var(--surface)" }}>
                <div className={`paper paper-${template}`}>
                  <h1>{title}</h1>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#5b6472",
                      borderBottom: "1px solid #e3e6eb",
                      paddingBottom: "0.6rem",
                      marginBottom: "0.4rem",
                    }}
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
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "preview" ? (
        <Card style={{ padding: "1.5rem" }}>
          <div className={`paper paper-${template}`} style={{ maxWidth: 780, margin: "0 auto" }}>
            <h1>{title}</h1>
            <div dangerouslySetInnerHTML={{ __html: buildPreviewHtml(title, sections) }} />
          </div>
        </Card>
      ) : null}

      {tab === "ats" ? (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)" }}>
          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle eyebrow="ATS readiness" title="Parser simulation" />
            {report ? (
              <div style={{ marginTop: "1rem" }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: "0.86rem" }}>Overall score</span>
                  <span className="display" style={{ fontSize: "1.6rem" }}>
                    {report.score}
                  </span>
                </div>
                <Meter value={report.score} />
                <div className="row" style={{ gap: "0.4rem", marginTop: "0.8rem" }}>
                  <Badge tone={report.passed ? "success" : "danger"}>
                    {report.grade}
                  </Badge>
                  <Badge tone="neutral">{report.issues.length} issues</Badge>
                </div>

                <div className="grid-2" style={{ marginTop: "1.2rem", gap: "0.7rem" }}>
                  <Metric label="Words" value={report.metrics.wordCount} />
                  <Metric label="Bullets" value={report.metrics.bulletCount} />
                  <Metric
                    label="Keyword coverage"
                    value={`${Math.round(report.metrics.keywordCoverage * 100)}%`}
                  />
                  <Metric label="Avg bullet" value={`${report.metrics.averageBulletLength}w`} />
                </div>

                <div className="stack" style={{ marginTop: "1.1rem", gap: "0.3rem" }}>
                  {(
                    [
                      ["Contact", report.metrics.hasContactSection],
                      ["Experience", report.metrics.hasExperienceSection],
                      ["Education", report.metrics.hasEducationSection],
                      ["Skills", report.metrics.hasSkillsSection],
                    ] as const
                  ).map(([label, present]) => (
                    <div key={label} className="row" style={{ justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.84rem" }}>{label}</span>
                      <Badge tone={present ? "success" : "warning"}>
                        {present ? "found" : "missing"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
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
            )}
          </Card>

          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle eyebrow="Findings" title="What to fix" />
            <div className="stack" style={{ marginTop: "0.9rem", gap: "0.5rem" }}>
              {!report ? (
                <p style={{ fontSize: "0.86rem", color: "var(--text-muted)" }}>
                  No findings yet.
                </p>
              ) : report.issues.length === 0 ? (
                <div
                  style={{
                    padding: "0.9rem",
                    borderRadius: "var(--radius-md)",
                    background: "var(--success-soft)",
                    fontSize: "0.86rem",
                  }}
                >
                  Nothing to fix. This document should pass a standard applicant tracking system.
                </div>
              ) : (
                report.issues.map((issue, index) => (
                  <div
                    key={`${issue.code}-${index}`}
                    style={{
                      padding: "0.7rem 0.8rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      borderLeft: `3px solid ${
                        issue.severity === "error"
                          ? "var(--danger)"
                          : issue.severity === "warning"
                            ? "var(--warning)"
                            : "var(--info)"
                      }`,
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", gap: "0.5rem" }}>
                      <strong style={{ fontSize: "0.86rem" }}>{issue.message}</strong>
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
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>
                        {issue.hint}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {report && report.metrics.missingKeywords.length > 0 ? (
              <div style={{ marginTop: "1.1rem" }}>
                <div className="eyebrow" style={{ marginBottom: "0.4rem" }}>
                  Missing keywords
                </div>
                <div className="row row-wrap" style={{ gap: "0.3rem" }}>
                  {report.metrics.missingKeywords.slice(0, 20).map((keyword) => (
                    <span
                      key={keyword}
                      style={{
                        fontSize: "0.74rem",
                        padding: "0.16rem 0.5rem",
                        borderRadius: 6,
                        background: "var(--warning-soft)",
                        color: "var(--warning)",
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "library" ? (
        <div className="stack" style={{ gap: "0.5rem" }}>
          {(list.data?.documents ?? []).map((document) => (
            <Link
              key={document.id}
              href={`/documents/${document.id}`}
              className="surface surface-hover"
              style={{ padding: "0.75rem 0.9rem", display: "flex", gap: "0.8rem", alignItems: "center" }}
            >
              <FileText size={16} style={{ color: "var(--text-muted)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{document.title}</div>
                <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                  {titleCase(document.type)} · {formatDateTime(document.createdAt)}
                </div>
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
            <Button variant="ghost" onClick={() => setTailorOpen(false)}>Cancel</Button>
            {tailoringProposal ? (
              <>
                <Button variant="outline" loading={tailorBusy} onClick={() => void prepareTailoredVersion()}>
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
        <div className="stack" style={{ gap: "0.9rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>
            Job Radar analyses this document against the role title, posting, requirements and responsibilities. It creates a separate draft, keeps the original intact, and leaves the final review to you.
          </p>
          <label className="field">
            <span className="label">Target job</span>
            <select className="select" value={tailoringOpportunityId} onChange={(event) => setTailoringOpportunityId(event.target.value)}>
              <option value="">Choose a job…</option>
              {(opportunities.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.title} — {item.companyName}</option>
              ))}
            </select>
          </label>
          {tailorBusy && !tailoringProposal ? (
            <div className="surface" style={{ padding: "1rem" }}>The document agents are comparing your evidence with the role and preparing a reviewable draft…</div>
          ) : null}
          {tailoringProposal ? (
            <>
              <div className="grid-2" style={{ gap: "0.8rem" }}>
                <Card style={{ padding: "0.9rem" }}>
                  <div className="eyebrow">What changed</div>
                  <ul style={{ paddingLeft: "1.1rem", marginTop: "0.5rem", fontSize: "0.82rem" }}>
                    {tailoringProposal.changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
                  </ul>
                  <div className="eyebrow" style={{ marginTop: "0.8rem" }}>Supported requirements</div>
                  <ul style={{ paddingLeft: "1.1rem", marginTop: "0.5rem", fontSize: "0.82rem" }}>
                    {tailoringProposal.matchedRequirements.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                  </ul>
                </Card>
                <Card style={{ padding: "0.9rem" }}>
                  <div className="eyebrow">Gaps to review honestly</div>
                  {tailoringProposal.uncoveredRequirements.length ? (
                    <ul style={{ paddingLeft: "1.1rem", marginTop: "0.5rem", fontSize: "0.82rem" }}>
                      {tailoringProposal.uncoveredRequirements.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                    </ul>
                  ) : <p style={{ fontSize: "0.82rem", marginTop: "0.5rem" }}>No uncovered requirements were identified from the provided job posting.</p>}
                  <p style={{ color: "var(--text-muted)", fontSize: "0.76rem", marginTop: "0.7rem" }}>A gap is not a suggestion to add a skill or experience you do not have.</p>
                </Card>
              </div>
              <label className="field">
                <span className="label">Version name</span>
                <input className="input" value={tailoringProposal.title} onChange={(event) => setTailoringProposal((current) => current ? { ...current, title: event.target.value } : current)} />
              </label>
              <label className="field">
                <span className="label">Review and edit the proposed document</span>
                <textarea className="textarea" style={{ minHeight: 320 }} value={tailoringProposal.content} onChange={(event) => setTailoringProposal((current) => current ? { ...current, content: event.target.value } : current)} />
              </label>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: "0.6rem 0.7rem",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div className="eyebrow">{label}</div>
      <div className="tabular" style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
