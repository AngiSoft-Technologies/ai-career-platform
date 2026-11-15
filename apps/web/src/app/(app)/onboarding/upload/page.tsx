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
import { Button, Card, Meter, useToast, cx } from "@/components/ui";
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
      <div className="mx-auto flex max-w-[520px] flex-col items-center gap-5 pt-12 text-center">
        <div className="grid size-[72px] place-items-center rounded-full bg-app-success/15 text-app-success">
          <ShieldCheck size={30} />
        </div>
        <h1 className="text-[1.8rem] font-semibold text-app-text">Your resume is ready</h1>
        {atsScore !== null ? (
          <Card className="w-full p-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between text-[0.85rem] text-app-soft">
                <span>ATS readiness</span>
                <span className="font-semibold tabular-nums text-app-text">{atsScore}/100</span>
              </div>
              <Meter value={atsScore} />
            </div>
          </Card>
        ) : null}
        <p className="text-[0.9rem] leading-relaxed text-app-muted">
          We extracted your details, rebuilt the document and ran an ATS check. Next, tell us how
          you want to be matched to roles.
        </p>
        <Button
          size="lg"
          icon={<ArrowRight size={16} />}
          onClick={() =>
            router.push(
              documentId ? `/onboarding/preferences?documentId=${documentId}` : "/onboarding/preferences",
            )
          }
        >
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-6">
      <header className="text-center">
        <Link
          href="/onboarding"
          className="mb-4 inline-flex items-center gap-1.5 text-[0.9rem] text-app-muted transition-colors hover:text-app-text"
        >
          <X size={14} /> Back to options
        </Link>
        <p className="flex items-center justify-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.14em] text-app-accent uppercase">
          <Upload size={16} /> Upload resume
        </p>
        <h1 className="mt-2 text-[clamp(1.6rem,4vw,2.2rem)] leading-tight font-semibold text-app-text">
          Upload your existing resume
        </h1>
        <p className="mt-1 text-[0.92rem] text-app-muted">PDF, DOCX, or an image. Maximum 10MB.</p>
      </header>

      <Card className="p-7" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        {file ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3.5 rounded-app-md bg-app-surface-2/60 p-4">
              <FileText size={24} className="shrink-0 text-app-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.92rem] font-semibold text-app-text">{file.name}</p>
                <p className="text-[0.8rem] text-app-muted">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
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
            <Button size="lg" loading={busy} onClick={() => void runImport()} className="w-full justify-center">
              {busy ? <Loader2 size={16} /> : null}
              {busy ? "Working…" : "Extract & build resume"}
            </Button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cx(
                "w-full cursor-pointer rounded-app-lg border-2 border-dashed border-app-border px-6 py-11",
                "text-app-soft transition-colors duration-150 hover:border-app-accent hover:bg-app-accent-soft/30",
              )}
            >
              <Upload size={40} className="mx-auto mb-3 text-app-muted" />
              <div className="text-[1.05rem] font-medium text-app-text">
                Drag &amp; drop or click to select
              </div>
              <div className="mt-1 text-[0.85rem] text-app-muted">
                PDF, DOCX, PNG, JPG, WebP · Maximum 10MB
              </div>
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
      </Card>

      {busy ? (
        <Card className="p-5">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between text-[0.85rem] text-app-soft">
              <span>{STAGE_LABEL[stage]}</span>
              <span className="text-[0.78rem] text-app-muted">{STAGE_LABEL[stage]}</span>
            </div>
            <Meter value={stage === "uploading" ? 45 : 90} />
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-app-danger/40 bg-app-danger/10 p-4">
          <div className="flex items-start gap-2 text-app-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="text-[0.88rem] leading-relaxed">{error}</span>
          </div>
        </Card>
      ) : null}

      <Link
        href="/onboarding/manual"
        className="text-center text-[0.9rem] text-app-accent transition-opacity hover:opacity-80"
      >
        Rather type it yourself? Build it manually →
      </Link>
    </div>
  );
}
