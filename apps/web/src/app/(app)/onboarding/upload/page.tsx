"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  Button,
  Meter,
  Page,
  Panel,
  PanelHead,
  Rows,
  Row,
  useToast,
  cx,
} from "@/components/ui";
import { SceneBackdrop } from "@/components/app-scene";
import { sceneForPath } from "@/lib/app-scenes";
import { api } from "@/lib/api";
import { rememberOnboardingPath } from "@/lib/onboarding";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
];

const MAX_BYTES = 10 * 1024 * 1024;

type Stage = "idle" | "uploading" | "extracting" | "done" | "error";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  uploading: "Uploading your file",
  extracting: "Extracting your experience and rebuilding the document",
  done: "Done",
  error: "",
};

export default function OnboardingUploadPage() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = stage === "uploading" || stage === "extracting";

  const accept = useCallback((selected: File | undefined | null) => {
    if (!selected) return;
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError("Upload a PDF, DOCX, or image file (PNG, JPG, WebP).");
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError("That file is larger than 10MB.");
      return;
    }
    setFile(selected);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      accept(event.dataTransfer.files?.[0] ?? null);
    },
    [accept],
  );

  const runImport = async () => {
    if (!file) return;
    setError(null);
    setAtsScore(null);

    try {
      // 1. Ask the API for a signed upload slot.
      const { target } = await api.post<{
        target: { url: string; key: string };
      }>("/documents/upload-url", {
        filename: file.name,
        contentType: file.type,
      });

      setStage("uploading");

      // 2. Put the raw file in storage. The response is checked: a
      // rejected PUT (an expired signed URL, a CORS refusal) used to fall
      // through to the import step and surface as a confusing "could not
      // read that file".
      const uploaded = await fetch(target.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploaded.ok) {
        throw new Error(
          `The upload was rejected (${uploaded.status}). Try the file again, or build the resume manually.`,
        );
      }

      setStage("extracting");

      // 3. The resume builder agent extracts, structures and stores it.
      const { document, ats } = await api.post<{
        document: { id: string };
        ats?: { score?: number };
      }>("/documents/import", {
        storageKey: target.key,
        filename: file.name,
        contentType: file.type,
      });

      setDocumentId(document.id);
      setAtsScore(ats?.score ?? null);
      setStage("done");
      rememberOnboardingPath("upload");
      toast.push("Resume built and ATS-checked.", "success");
      // The success screen is shown, not skipped: pushing in the same tick
      // as setStage left the panel (and its Continue button) unreachable.
    } catch (caught) {
      setStage("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not read that file. Try a text-based PDF or DOCX, or build the resume manually.",
      );
      toast.push("Resume import failed", "danger");
    }
  };

  if (stage === "done") {
    return (
      <Page className="mx-auto max-w-[620px]">
        <SceneBackdrop
          scene={sceneForPath("/onboarding")}
          priority
          minHeight="clamp(180px, 20vw, 230px)"
        >
          <p className="flex items-center gap-2.5 font-mono text-[0.62rem] font-semibold tracking-[0.18em] text-white/65 uppercase">
            <ShieldCheck size={13} aria-hidden />
            Import complete
          </p>
          <h1 className="mt-3 max-w-[24ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-[1] font-semibold tracking-[-0.03em] text-white text-balance">
            Your resume is ready
          </h1>
        </SceneBackdrop>
        <Panel className="relative overflow-hidden">
          <div className="relative flex flex-col items-center gap-5 px-6 py-14 text-center">
            <span className="grid size-[76px] place-items-center rounded-app-lg border border-app-success/30 bg-app-success/12 text-app-success">
              <ShieldCheck size={32} />
            </span>
            <h2 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.025em] text-app-text">
              What we extracted
            </h2>
            <p className="max-w-[46ch] text-[0.9rem] leading-relaxed text-app-muted">
              We extracted your details, rebuilt the document and ran an ATS
              check. Next, tell us how you want to be matched to roles.
            </p>

            {atsScore !== null ? (
              <div className="w-full max-w-[380px] rounded-app-lg border border-app-border bg-app-surface-2/50 p-4">
                <div className="flex items-baseline justify-between text-[0.85rem] text-app-soft">
                  <span>ATS readiness</span>
                  <span className="font-display text-[1.35rem] font-semibold tabular-nums text-app-text">
                    {atsScore}
                    <span className="font-mono text-[0.7rem] font-normal text-app-muted">
                      /100
                    </span>
                  </span>
                </div>
                <div className="mt-2.5">
                  <Meter value={atsScore} />
                </div>
              </div>
            ) : null}

            <Button
              size="lg"
              icon={<ArrowRight size={16} />}
              onClick={() =>
                router.push(
                  documentId
                    ? `/onboarding/preferences?documentId=${documentId}`
                    : "/onboarding/preferences",
                )
              }
            >
              Continue to preferences
            </Button>
          </div>
        </Panel>
      </Page>
    );
  }

  return (
    <Page className="mx-auto max-w-[760px]">
      <SceneBackdrop
        scene={sceneForPath("/onboarding")}
        priority
        minHeight="clamp(210px, 23vw, 280px)"
      >
        <Link
          href="/onboarding"
          className="mb-4 inline-flex items-center gap-1.5 text-[0.82rem] text-white/70 transition-colors hover:text-white"
        >
          <X size={14} /> Back to options
        </Link>
        <p className="flex items-center gap-2.5 font-mono text-[0.62rem] font-semibold tracking-[0.18em] text-white/65 uppercase">
          <span aria-hidden className="h-px w-7 bg-white/60" />
          Upload resume
        </p>
        <h1 className="mt-3 max-w-[26ch] text-[clamp(1.8rem,4vw,2.5rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance text-white">
          Upload your existing resume
        </h1>
        <p className="mt-3 max-w-[46ch] text-[0.9rem] leading-relaxed text-white/75">
          PDF, DOCX, or an image. Maximum 10MB. We read it, rebuild it and
          score it before you ever see it.
        </p>
      </SceneBackdrop>

      <Panel
        className="relative"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {file ? (
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-center gap-3.5 rounded-app-md border border-app-border bg-app-surface-2/60 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-app-md bg-app-accent-soft text-app-accent">
                <FileText size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.92rem] font-semibold text-app-text">
                  {file.name}
                </p>
                <p className="text-[0.8rem] text-app-muted">
                  {(file.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                  {file.type.split("/").pop()?.toUpperCase()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setError(null);
                  // The input keeps its value after a removal, so choosing
                  // the same file again would fire no change event.
                  if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={busy}
                aria-label="Remove file"
              >
                <X size={14} />
              </Button>
            </div>
            <Button
              size="lg"
              loading={busy}
              onClick={() => void runImport()}
              className="w-full justify-center"
            >
              {busy ? "Working…" : "Extract & build resume"}
            </Button>
          </div>
        ) : (
          <div className="p-6">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cx(
                "group w-full cursor-pointer rounded-app-lg border-2 border-dashed border-app-border px-6 py-14",
                "text-app-soft transition-colors duration-150 hover:border-app-accent hover:bg-app-accent-soft/30",
              )}
            >
              <span className="mx-auto mb-4 grid size-16 place-items-center rounded-app-lg border border-app-border bg-app-surface-2 text-app-muted transition-colors duration-200 group-hover:border-app-accent/40 group-hover:text-app-accent">
                <Upload size={26} />
              </span>
              <span className="block text-[1.05rem] font-medium text-app-text">
                Drag & drop or click to select
              </span>
              <span className="mt-1.5 block text-[0.85rem] text-app-muted">
                PDF, DOCX, PNG, JPG, WebP · Maximum 10MB
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(event) => accept(event.target.files?.[0] ?? null)}
            />
            <p className="mt-4 text-center text-[0.8rem] text-app-muted">
              A scanned or photographed resume works too — we read images.
            </p>
          </div>
        )}
      </Panel>

      {busy ? (
        <Panel className="p-5">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between text-[0.85rem] text-app-soft">
              <span className="font-medium">{STAGE_LABEL[stage]}</span>
              <span className="font-mono text-[0.72rem] text-app-muted">
                {stage === "uploading" ? "35%" : "80%"}
              </span>
            </div>
            <Meter value={stage === "uploading" ? 35 : 80} />
          </div>
        </Panel>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-app-lg border border-app-danger/40 bg-app-danger/10 px-4 py-3.5 text-app-danger"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="text-[0.88rem] leading-relaxed">{error}</span>
        </div>
      ) : null}

      <Panel>
        <PanelHead eyebrow="What the agent does" title="Four steps, no formatting work" />
        <Rows className="border-t border-app-border">
          {[
            {
              title: "Reads the file",
              description:
                "Text-based PDFs, DOCX and photographed pages are all parsed the same way.",
            },
            {
              title: "Structures the facts",
              description:
                "Basics, experience, education, skills and certifications become editable fields.",
            },
            {
              title: "Rebuilds the document",
              description:
                "A clean, ATS-readable CV replaces the layout you sent us.",
            },
            {
              title: "Scores it",
              description:
                "We check what an applicant tracking system will actually read, and suggest fixes.",
            },
          ].map((step, index) => (
            <Row key={step.title} as="li" className="items-start gap-4">
              <span className="font-mono text-[0.7rem] font-semibold tabular-nums text-app-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-[0.9rem] font-semibold text-app-text">{step.title}</p>
                <p className="mt-1 max-w-[62ch] text-[0.82rem] leading-relaxed text-app-muted">
                  {step.description}
                </p>
              </div>
            </Row>
          ))}
        </Rows>
      </Panel>

      <Link
        href="/onboarding/manual"
        className="text-center text-[0.9rem] text-app-accent transition-opacity hover:opacity-80"
      >
        Rather type it yourself? Build it manually →
      </Link>
    </Page>
  );
}
