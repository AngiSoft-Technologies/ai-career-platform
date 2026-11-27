"use client";

import "./builder.css";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileText,
  Palette,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import {
  DEFAULT_COVER_LETTER_TEMPLATE_KEY,
  DEFAULT_RESUME_TEMPLATE_KEY,
  emptyResumeDocument,
  emptyResumeEntry,
  markdownToResumeDocument,
  normaliseResumeDocument,
  resumeDocumentToMarkdown,
  sectionDefinition,
  type ResumeDocument,
  type ResumeDocumentKind,
  type ResumeCoverLetter,
  type ResumeSection,
  type ResumeSectionType,
} from "@angisoft/mboqara-contracts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { formatDateTime, titleCase } from "@/lib/format";
import type { JobDocument, Opportunity } from "@/lib/types";
import { ATSSidebar } from "@/components/documents/ATSSidebar";
import { Button, EmptyState, Field, Input, Modal, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { ContactEditor } from "./ContactEditor";
import { CoverLetterEditor } from "./CoverLetterEditor";
import { DesignPanel } from "./DesignPanel";
import { SectionEditor } from "./SectionEditor";
import { SectionRail } from "./SectionRail";
import { SheetPreview } from "./SheetPreview";

interface DocumentsResponse {
  documents: JobDocument[];
  total: number;
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

interface ImprovementJob {
  id: string;
  status: "granted" | "pending" | "processing" | "success" | "failed";
  rewrite_type: "full";
  result?: { resume: ResumeDocument };
  error?: string;
}

type Snapshot = {
  doc: ResumeDocument;
  title: string;
  template: string;
};

type HistoryState = {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
};

type Mode = "edit" | "preview";
type MiddleTab = "content" | "design";

/** A blank cover letter, so the editor never writes to `undefined`. */
function blankCoverLetter(): ResumeCoverLetter {
  return {
    recipientName: "",
    recipientCompany: "",
    recipientAddress: "",
    subject: "",
    greeting: "",
    body: "",
    signoff: "",
  };
}

/** Starter sections: a resume starts with work, then evidence, then skills. */
function starterSections(): ResumeSection[] {
  const make = (type: ResumeSectionType): ResumeSection => ({
    id: `section-${type}`,
    type,
    title: sectionDefinition(type).defaultTitle,
    entries: sectionDefinition(type).singleBlock ? [emptyResumeEntry()] : [],
    pinned: type === "summary" || type === "skills",
  });
  return [
    make("summary"),
    make("experience"),
    make("education"),
    make("skills"),
    make("projects"),
  ];
}

/**
 * The MboQara document builder.
 *
 * This is a full editor rather than a thin form: it owns the draft, its undo
 * history, autosave, section ordering, design controls, template selection,
 * the printable preview and the job-version export workflow.
 */
export function DocumentBuilder() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: {
      doc: emptyResumeDocument(),
      title: "",
      template: DEFAULT_RESUME_TEMPLATE_KEY,
    },
    future: [],
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [middleTab, setMiddleTab] = useState<MiddleTab>("content");
  const [mode, setMode] = useState<Mode>("edit");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [atsOpen, setAtsOpen] = useState(false);
  const [tailorOpen, setTailorOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  const [improvementStatus, setImprovementStatus] = useState<
    "idle" | "granted" | "pending" | "processing" | "success" | "failed"
  >("idle");
  const [improvementError, setImprovementError] = useState("");
  const [tailorBusy, setTailorBusy] = useState(false);
  const [tailoringProposal, setTailoringProposal] = useState<TailoringProposal | null>(null);
  const [tailoringOpportunityId, setTailoringOpportunityId] = useState("");
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const { data, loading } = useApi<JobDocument>(`/documents/${params.id}`);
  const list = useApi<DocumentsResponse>("/documents", {
    limit: 100,
    content: "false",
  });
  const opportunities = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 100 });

  const { doc, title, template } = history.present;
  const isLetter = doc.kind === "cover_letter";
  const activeSection = doc.sections.find((section) => section.id === activeId) ?? null;
  const blankLetter = doc.coverLetter ?? blankCoverLetter();
  const deleteTarget = deleteSectionId
    ? doc.sections.find((section) => section.id === deleteSectionId) ?? null
    : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const view = new URLSearchParams(window.location.search).get("view");
    setMode(view === "preview" ? "preview" : "edit");
  }, []);

  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || loadedFor.current === data.id) return;
    loadedFor.current = data.id;
    const kind: ResumeDocumentKind = data.type === "cover_letter" ? "cover_letter" : "resume";
    const imported = normaliseResumeDocument(
      data.resumeData ?? markdownToResumeDocument(data.content ?? "", kind),
    );
    const seeded: ResumeDocument = {
      ...imported,
      kind,
      sections:
        kind === "cover_letter"
          ? []
          : imported.sections.length
            ? imported.sections
            : starterSections(),
      coverLetter:
        kind === "cover_letter"
          ? imported.coverLetter ?? blankCoverLetter()
          : imported.coverLetter,
    };
    setHistory({
      past: [],
      present: {
        doc: seeded,
        title: data.title,
        template:
          data.template ??
          (kind === "cover_letter"
            ? DEFAULT_COVER_LETTER_TEMPLATE_KEY
            : DEFAULT_RESUME_TEMPLATE_KEY),
      },
      future: [],
    });
    setActiveId(null);
    setTailoringOpportunityId(data.opportunityId ?? "");
    setDirty(false);
  }, [data]);

  const lastEdit = useRef<{ scope: string; at: number }>({ scope: "", at: 0 });

  const commit = useCallback((next: Snapshot, scope: string) => {
    const now = Date.now();
    setHistory((current) => {
      const last = lastEdit.current;
      // Typing in one field is one undo step, not one per keystroke.
      const coalesce = last.scope === scope && now - last.at < 700;
      lastEdit.current = { scope, at: now };
      return {
        past: coalesce ? current.past : [...current.past.slice(-49), current.present],
        present: next,
        future: [],
      };
    });
    setDirty(true);
  }, []);

  const updateDoc = useCallback(
    (next: ResumeDocument, scope: string) => commit({ ...history.present, doc: next }, scope),
    [commit, history.present],
  );

  const updateTitle = useCallback(
    (value: string) => commit({ ...history.present, title: value }, "title"),
    [commit, history.present],
  );

  const selectTemplate = useCallback(
    (key: string) => commit({ ...history.present, template: key }, `template:${key}`),
    [commit, history.present],
  );

  const undo = useCallback(() => {
    setHistory((current) => {
      if (!current.past.length) return current;
      const previous = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
    setDirty(true);
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (!current.future.length) return current;
      const next = current.future[0];
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
    setDirty(true);
  }, []);

  const payload = useMemo(
    () => JSON.stringify({ title, template, resumeData: doc }),
    [title, template, doc],
  );

  const persist = useCallback(
    async (body: string) => {
      setSaving(true);
      try {
        await api.patch(`/documents/${params.id}`, JSON.parse(body));
        setDirty(false);
        setSavedAt(new Date().toISOString());
      } catch (caught) {
        toast.push(
          caught instanceof Error ? caught.message : "Could not save the document",
          "danger",
        );
      } finally {
        setSaving(false);
      }
    },
    [params.id, toast],
  );

  useEffect(() => {
    if (!dirty || !data) return;
    const timer = window.setTimeout(() => void persist(payload), 1100);
    return () => window.clearTimeout(timer);
  }, [dirty, payload, data, persist]);

  const saveNow = useCallback(async () => {
    await persist(payload);
    toast.push("Document saved", "success");
  }, [payload, persist, toast]);

  const improveInPlace = useCallback(async () => {
    if (improving) return;
    setImproving(true);
    setImprovementStatus("granted");
    setImprovementError("");

    try {
      // Save first: the improvement job should rewrite the document the editor
      // actually holds, not whatever the server had before this draft.
      await persist(payload);

      const created = await api.postWithHeaders<ImprovementJob>(
        `/documents/${params.id}/improvements`,
        { rewrite_type: "full" },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      setImprovementStatus(created.status);

      await api.post(`/documents/${params.id}/improvements/${created.id}/enqueue`, {
        resumeData: doc,
      });
      setImprovementStatus("pending");

      let improved: ResumeDocument | null = null;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const job = await api.get<ImprovementJob>(
          `/documents/${params.id}/improvements/${created.id}`,
        );
        setImprovementStatus(job.status);
        if (job.status === "success") {
          improved = job.result?.resume ?? null;
          break;
        }
        if (job.status === "failed") {
          throw new Error(job.error ?? "AI improvement failed");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }

      if (!improved) throw new Error("AI improvement timed out");

      // The result lands in the document with a normal undo step: the user can
      // keep editing, save, or undo the whole rewrite.
      commit(
        { doc: improved, title, template },
        "ai-improve",
      );
      setDirty(true);
      toast.push("Document improved in place. Undo is available.", "success");
    } catch (caught) {
      setImprovementStatus("failed");
      setImprovementError(caught instanceof Error ? caught.message : "AI improvement failed");
      toast.push(
        caught instanceof Error ? caught.message : "AI improvement failed",
        "danger",
      );
    } finally {
      setImproving(false);
    }
  }, [commit, doc, improving, params.id, payload, persist, template, title, toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveNow]);

  const updateSection = useCallback(
    (section: ResumeSection) => {
      updateDoc(
        {
          ...doc,
          sections: doc.sections.map((item) => (item.id === section.id ? section : item)),
        },
        `section:${section.id}`,
      );
    },
    [doc, updateDoc],
  );

  const removeSection = useCallback(
    (sectionId: string) => {
      const remaining = doc.sections.filter((section) => section.id !== sectionId);
      updateDoc({ ...doc, sections: remaining }, `remove:${sectionId}`);
      setDeleteSectionId(null);
      if (activeId === sectionId) setActiveId(null);
    },
    [activeId, doc, updateDoc],
  );

  const addSection = useCallback(
    (type: ResumeSectionType) => {
      const definition = sectionDefinition(type);
      const section: ResumeSection = {
        id: `section-${type}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title: definition.defaultTitle,
        entries: definition.singleBlock ? [emptyResumeEntry()] : [],
        pinned: false,
      };
      updateDoc({ ...doc, sections: [...doc.sections, section] }, `add:${type}`);
      setActiveId(section.id);
      setMiddleTab("content");
    },
    [doc, updateDoc],
  );

  const reorderSection = useCallback(
    (fromId: string, toIndex: number) => {
      const from = doc.sections.findIndex((section) => section.id === fromId);
      if (from < 0) return;
      const next = [...doc.sections];
      const [moved] = next.splice(from, 1);
      if (!moved) return;
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
      updateDoc({ ...doc, sections: next }, `reorder:${fromId}`);
    },
    [doc, updateDoc],
  );

  const updateCoverLetter = useCallback(
    (coverLetter: ResumeDocument["coverLetter"]) => {
      updateDoc({ ...doc, kind: "cover_letter", coverLetter }, "cover-letter");
    },
    [doc, updateDoc],
  );

  const exportDocument = useCallback(
    async (format: "pdf" | "docx" | "pptx" | "png") => {
      try {
        await persist(payload);
        const blob = await api.postBlob(`/documents/${params.id}/export`, { format, template });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "document"}.${format}`;
        anchor.click();
        URL.revokeObjectURL(url);
        setDownloadOpen(false);
        toast.push(`Exported ${format.toUpperCase()}`, "success");
      } catch (caught) {
        toast.push(caught instanceof Error ? caught.message : "Export failed", "danger");
      }
    },
    [params.id, payload, persist, template, title, toast],
  );

  const createVersion = useCallback(async () => {
    setCreatingVersion(true);
    try {
      await persist(payload);
      const response = await api.post<{ document: JobDocument }>(`/documents/${params.id}/versions`, {});
      toast.push("Independent copy created. Your original is unchanged.", "success");
      router.push(`/documents/${response.document.id}`);
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not create a copy",
        "danger",
      );
    } finally {
      setCreatingVersion(false);
    }
  }, [params.id, payload, persist, router, toast]);

  const prepareTailoredVersion = useCallback(async () => {
    if (!tailoringOpportunityId) {
      toast.push("Choose the job you want to tailor this document for", "warning");
      return;
    }
    setTailorBusy(true);
    setTailoringProposal(null);
    try {
      await persist(payload);
      const response = await api.post<{ proposal: TailoringProposal }>(
        `/documents/${params.id}/tailor`,
        { opportunityId: tailoringOpportunityId },
      );
      setTailoringProposal(response.proposal);
      toast.push("Tailored draft is ready for your review", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not tailor this document",
        "danger",
      );
    } finally {
      setTailorBusy(false);
    }
  }, [params.id, payload, persist, tailoringOpportunityId, toast]);

  const saveTailoredVersion = useCallback(async () => {
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
      toast.push(
        caught instanceof Error ? caught.message : "Could not save the tailored copy",
        "danger",
      );
    } finally {
      setTailorBusy(false);
    }
  }, [params.id, router, tailoringProposal, toast]);

  const markdown = useMemo(() => resumeDocumentToMarkdown(doc), [doc]);

  if (loading && !data) {
    return (
      <div className="rk-builder">
        <div className="rk-workspace">
          <Skeleton height={44} width={320} />
          <Skeleton height={420} />
          <Skeleton height={560} />
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

  const jobVersions = data.parentDocumentId
    ? (list.data?.documents ?? []).filter((item) => item.parentDocumentId === data.parentDocumentId)
    : (list.data?.documents ?? []).filter((item) => item.parentDocumentId === data.id);

  const designControls = (
    <DesignPanel
      template={template}
      design={doc.design}
      onTemplateChange={selectTemplate}
      onDesignChange={(design) => updateDoc({ ...doc, design }, "design")}
    />
  );

  return (
    <div className="rk-builder">
      <header className="rk-toolbar">
        <div className="rk-toolbar-row">
          <Link href="/documents" className="rk-btn rk-btn--quiet">
            <ArrowLeft size={14} />
            Documents
          </Link>
          <label className="rk-sr-only" htmlFor="document-title">
            Resume title
          </label>
          <input
            id="document-title"
            className="rk-title-input"
            value={title}
            onChange={(event) => updateTitle(event.target.value)}
          />
          <span className="rk-status" data-state={dirty || saving ? "pending" : "saved"}>
            {saving ? (
              <>
                <span className="rk-status-dot" aria-hidden />
                Saving…
              </>
            ) : dirty ? (
              <>
                <span className="rk-status-dot" aria-hidden />
                Unsaved changes
              </>
            ) : (
              <>
                <span className="rk-status-dot" aria-hidden />
                Saved
              </>
            )}
          </span>
          {savedAt && !dirty && !saving ? (
            <span className="rk-panel-note">at {new Date(savedAt).toLocaleTimeString()}</span>
          ) : null}
          <span className="rk-panel-note">Ctrl+S saves now</span>

          <div className="rk-toolbar-actions">
            <button
              type="button"
              className="rk-btn rk-btn--quiet"
              onClick={undo}
              disabled={!history.past.length}
            >
              <Undo2 size={14} />
              Undo
            </button>
            <button
              type="button"
              className="rk-btn rk-btn--quiet"
              onClick={redo}
              disabled={!history.future.length}
            >
              <Redo2 size={14} />
              Redo
            </button>
            <button
              type="button"
              className="rk-btn rk-btn--quiet"
              disabled={improving}
              onClick={() => void improveInPlace()}
            >
              <Sparkles size={14} />
              {improving ? "Improving…" : "Improve with AI"}
            </button>
            <button
              type="button"
              className="rk-btn rk-btn--quiet"
              onClick={() => setTailorOpen(true)}
            >
              <FileText size={14} />
              Rewrite for a job
            </button>
            <button
              type="button"
              className="rk-btn rk-btn--quiet"
              onClick={() => setAtsOpen(true)}
            >
              <Wand2 size={14} />
              ATS check
            </button>
            <button
              type="button"
              className="rk-btn rk-btn--quiet"
              disabled={creatingVersion}
              onClick={() => void createVersion()}
            >
              <FileText size={14} />
              Duplicate
            </button>
            <div className="rk-export">
              <button
                type="button"
                className="rk-btn rk-btn--primary"
                aria-expanded={downloadOpen}
                onClick={() => setDownloadOpen((value) => !value)}
              >
                <Download size={14} />
                Download
                <ChevronDown size={13} />
              </button>
              {downloadOpen ? (
                <div className="rk-export-menu" role="menu">
                  {(["pdf", "docx", "pptx", "png"] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      className="rk-export-option"
                      role="menuitem"
                      onClick={() => void exportDocument(format)}
                    >
                      {format.toUpperCase()}
                      {format === "pdf" ? <Check size={13} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" className="rk-btn rk-btn--primary" onClick={() => void saveNow()}>
              <Save size={14} />
              Save
            </button>
          </div>
        </div>

        <div className="rk-toolbar-row">
          <div className="rk-tabs" role="tablist" aria-label="Editor mode">
            <button
              type="button"
              className="rk-tab"
              aria-pressed={mode === "edit"}
              onClick={() => setMode("edit")}
            >
              <FileText size={13} />
              Edit
            </button>
            <button
              type="button"
              className="rk-tab"
              aria-pressed={mode === "preview"}
              onClick={() => setMode("preview")}
            >
              <Palette size={13} />
              Preview & Download
            </button>
          </div>
          <span className="rk-panel-note">
            {titleCase(data.type)} · {doc.sections.length} sections · {template}
          </span>
        </div>
      </header>

      <div className={mode === "edit" ? "rk-workspace" : "rk-workspace rk-workspace--preview"}>
        {mode === "edit" && !isLetter ? (
          <SectionRail
            sections={doc.sections}
            activeId={activeId}
            onSelect={setActiveId}
            onReorder={reorderSection}
            onAdd={addSection}
          />
        ) : null}

        <main className={mode === "edit" ? "rk-desk" : "rk-desk rk-desk--preview"}>
          {improvementStatus === "pending" || improvementStatus === "processing" ? (
            <p className="rk-notice">
              Improving your resume, reading what&rsquo;s there… It lands right here, with
              every change visible and undoable.
            </p>
          ) : null}

          {improvementError ? (
            <p className="rk-error" role="alert">
              {improvementError}
            </p>
          ) : null}

          {mode === "preview" ? (
            designControls
          ) : (
            <>
              {isLetter ? (
                <>
                  <div className="rk-tabs" role="tablist" aria-label="Letter mode">
                    <button
                      type="button"
                      className="rk-tab"
                      aria-pressed={middleTab === "content"}
                      onClick={() => setMiddleTab("content")}
                    >
                      Letter
                    </button>
                    <button
                      type="button"
                      className="rk-tab"
                      aria-pressed={middleTab === "design"}
                      onClick={() => setMiddleTab("design")}
                    >
                      Design
                    </button>
                  </div>

                  {middleTab === "design" ? (
                    designControls
                  ) : (
                    <CoverLetterEditor letter={blankLetter} onChange={updateCoverLetter} />
                  )}
                </>
              ) : (
                <>
                  <div className="rk-tabs" role="tablist" aria-label="Editing pane">
                    <button
                      type="button"
                      className="rk-tab"
                      aria-pressed={middleTab === "content"}
                      onClick={() => setMiddleTab("content")}
                    >
                      Content
                    </button>
                    <button
                      type="button"
                      className="rk-tab"
                      aria-pressed={middleTab === "design"}
                      onClick={() => setMiddleTab("design")}
                    >
                      Design
                    </button>
                  </div>

                  {middleTab === "design" ? (
                    designControls
                  ) : activeSection ? (
                    <SectionEditor
                      section={activeSection}
                      onChange={updateSection}
                      onRemove={setDeleteSectionId}
                    />
                  ) : (
                    <ContactEditor
                      contact={doc.contact}
                      photoUrl={doc.design.photoUrl}
                      onChange={(contact) => updateDoc({ ...doc, contact }, "contact")}
                      onPhotoChange={(photoUrl) =>
                        updateDoc(
                          { ...doc, design: { ...doc.design, photoUrl } },
                          "photo",
                        )
                      }
                    />
                  )}
                </>
              )}
            </>
          )}

          {jobVersions.length ? (
            <div className="rk-version">
              <strong>Job-specific versions:</strong>
              {jobVersions.map((version) => (
                <Link key={version.id} href={`/documents/${version.id}`}>
                  {version.title}
                </Link>
              ))}
            </div>
          ) : null}
        </main>

        <aside className="rk-mat">
          <div className="rk-mat-head">
            <h2>{isLetter ? "Your letter" : "Your page"}</h2>
            <span>
              {doc.design.pageSize === "a4" ? "A4" : "Letter"} · {template}
            </span>
          </div>
          <SheetPreview document={doc} template={template} />
          <p className="rk-panel-note">
            Margins: {doc.design.margins.top}/{doc.design.margins.right}/
            {doc.design.margins.bottom}/{doc.design.margins.left} mm
          </p>
        </aside>
      </div>

      <Modal
        open={atsOpen}
        onClose={() => setAtsOpen(false)}
        title="ATS readiness"
        width={620}
        footer={<Button variant="ghost" onClick={() => setAtsOpen(false)}>Close</Button>}
      >
        <ATSSidebar
          documentId={params.id}
          content={markdown}
          opportunityId={tailoringOpportunityId || data.opportunityId}
        />
      </Modal>

      <Modal
        open={tailorOpen}
        onClose={() => setTailorOpen(false)}
        title="Tailor this document for a job"
        width={820}
        footer={
          tailoringProposal ? (
            <>
              <Button variant="ghost" onClick={() => setTailorOpen(false)}>Cancel</Button>
              <Button loading={tailorBusy} onClick={() => void prepareTailoredVersion()}>
                Regenerate proposal
              </Button>
              <Button loading={tailorBusy} onClick={() => void saveTailoredVersion()}>
                Save as job version
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setTailorOpen(false)}>Cancel</Button>
              <Button loading={tailorBusy} onClick={() => void prepareTailoredVersion()}>
                Prepare tailored draft
              </Button>
            </>
          )
        }
      >
        <p className="rk-notice">
          Saved {formatDateTime(data.createdAt)}. Your source document stays unchanged; the
          tailored copy is saved as a new version for review.
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
          <div className="rk-notice">
            The document agents are comparing your evidence with the role and preparing a
            reviewable draft…
          </div>
        ) : null}
        {tailoringProposal ? (
          <>
            <div className="rk-fields">
              <div className="rk-field rk-field--wide">
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
              </div>
              <div className="rk-field rk-field--wide">
                <Field label="Review and edit the proposed document">
                  <Textarea
                    className="rk-textarea"
                    value={tailoringProposal.content}
                    onChange={(event) =>
                      setTailoringProposal((current) =>
                        current ? { ...current, content: event.target.value } : current,
                      )
                    }
                  />
                </Field>
              </div>
            </div>
            <div className="rk-fields">
              <div className="rk-field">
                <h3>What changed</h3>
                <ul>
                  {tailoringProposal.changes.map((change, index) => (
                    <li key={`${index}-${change}`}>{change}</li>
                  ))}
                </ul>
              </div>
              <div className="rk-field">
                <h3>Gaps to review honestly</h3>
                {tailoringProposal.uncoveredRequirements.length ? (
                  <ul>
                    {tailoringProposal.uncoveredRequirements.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No uncovered requirements were identified from the job posting.</p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteSectionId)}
        onClose={() => setDeleteSectionId(null)}
        title="Delete section"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteSectionId(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => deleteSectionId && removeSection(deleteSectionId)}
            >
              Delete section
            </Button>
          </>
        }
      >
        <p>
          {activeSection
            ? `${sectionDefinition(
              deleteTarget?.type ?? "custom",
            ).label} has ${deleteTarget?.entries.length ?? 0} entries. Its entries go with it.`
            : "Delete this section and its entries?"}
        </p>
      </Modal>
    </div>
  );
}