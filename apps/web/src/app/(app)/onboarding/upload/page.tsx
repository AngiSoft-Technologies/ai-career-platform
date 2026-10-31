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
import { Button, Card, Meter, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useOnboarding } from "@/lib/hooks";

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
  extracting: "Reading and building your resume",
  done: "Done",
  error: "",
};

export default function OnboardingUploadPage() {
  const router = useRouter();
  const toast = useToast();
  const { completeOnboarding } = useOnboarding();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [atsScore, setAtsScore] = useState<number | null>(null);
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

      // 2. Put the raw file in storage.
      await fetch(target.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

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

      setAtsScore(ats?.score ?? null);
      setStage("done");
      await completeOnboarding("upload");
      toast.push("Resume built and ATS-checked.", "success");
      router.push(`/onboarding/preferences?documentId=${document.id}`);
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
      <div
        className="stack"
        style={{
          gap: "1.25rem",
          maxWidth: 520,
          margin: "0 auto",
          textAlign: "center",
          paddingTop: "3rem",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "var(--success-soft)",
            color: "var(--success)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
          }}
        >
          <ShieldCheck size={30} />
        </div>
        <h1 className="display" style={{ fontSize: "1.8rem" }}>
          Your resume is ready
        </h1>
        {atsScore !== null ? (
          <Card style={{ padding: "1rem" }}>
            <div className="stack" style={{ gap: "0.6rem" }}>
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                }}
              >
                <span>ATS readiness</span>
                <span style={{ fontWeight: 600 }}>{atsScore}/100</span>
              </div>
              <Meter value={atsScore} />
            </div>
          </Card>
        ) : null}
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          We extracted your details, rebuilt the document and ran an ATS check.
          Next, tell us how you want to be matched to roles.
        </p>
        <Button
          size="lg"
          icon={<ArrowRight size={16} />}
          onClick={() => router.push("/onboarding/preferences")}
        >
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div
      className="stack"
      style={{ gap: "1.5rem", maxWidth: 620, margin: "0 auto" }}
    >
      <div style={{ textAlign: "center" }}>
        <Link
          href="/onboarding"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginBottom: "1rem",
          }}
        >
          <X size={14} /> Back to options
        </Link>
        <div className="eyebrow" style={{ justifyContent: "center" }}>
          <Upload size={16} /> Upload resume
        </div>
        <h1
          className="display"
          style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", marginTop: 8 }}
        >
          Upload your existing resume
        </h1>
        <p style={{ color: "var(--text-muted)", marginTop: 4 }}>
          PDF, DOCX, or an image. Maximum 10MB.
        </p>
      </div>

      <Card
        style={{ padding: "1.75rem" }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {file ? (
          <div className="stack" style={{ gap: "1rem" }}>
            <div
              className="row"
              style={{
                alignItems: "center",
                gap: "0.9rem",
                padding: "1rem",
                background: "var(--surface)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <FileText size={24} style={{ color: "var(--accent)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {file.name}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setError(null);
                }}
                disabled={busy}
              >
                <X size={14} />
              </Button>
            </div>
            <Button size="lg" loading={busy} onClick={runImport} style={{ width: "100%" }}>
              {busy ? <Loader2 size={16} /> : null}
              {busy ? "Working..." : "Extract & build resume"}
            </Button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{
                width: "100%",
                border: "2px dashed var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "2.75rem 1.5rem",
                cursor: "pointer",
                background: "transparent",
                color: "inherit",
              }}
            >
              <Upload
                size={40}
                style={{ color: "var(--text-muted)", marginBottom: "0.75rem" }}
              />
              <div style={{ fontSize: "1.05rem", fontWeight: 500 }}>
                Drag & drop or click to select
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                PDF, DOCX, PNG, JPG, WebP · Maximum 10MB
              </div>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              style={{ display: "none" }}
              onChange={(event) => accept(event.target.files?.[0] ?? null)}
            />
            <p
              style={{
                textAlign: "center",
                marginTop: "1rem",
                marginBottom: 0,
                fontSize: "0.8rem",
                color: "var(--text-muted)",
              }}
            >
              A scanned or photographed resume works too — we read images.
            </p>
          </div>
        )}
      </Card>

      {busy ? (
        <Card style={{ padding: "1.25rem" }}>
          <div className="stack" style={{ gap: "0.6rem" }}>
            <div
              className="row"
              style={{ justifyContent: "space-between", fontSize: "0.85rem" }}
            >
              <span>{STAGE_LABEL[stage]}</span>
              <span>{stage === "uploading" ? "40%" : "80%"}</span>
            </div>
            <Meter value={stage === "uploading" ? 40 : 80} />
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card
          style={{
            padding: "1rem",
            borderColor: "var(--danger)",
            background: "var(--danger-soft)",
          }}
        >
          <div className="row" style={{ gap: "0.5rem", color: "var(--danger)" }}>
            <AlertCircle size={16} />
            <span style={{ fontSize: "0.88rem" }}>{error}</span>
          </div>
        </Card>
      ) : null}

      <Link
        href="/onboarding/manual"
        style={{
          textAlign: "center",
          display: "block",
          color: "var(--accent)",
          fontSize: "0.9rem",
        }}
      >
        Rather type it yourself? Build it manually →
      </Link>
    </div>
  );
}
