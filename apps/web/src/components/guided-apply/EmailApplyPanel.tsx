"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Panel,
  PanelHead,
  Rows,
  Row,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import type {
  ApplicationGuidanceSession,
  ApplicationWorkspacePayload,
} from "./types";

interface AnalysisWithEmail {
  emailRecipient?: string;
  emailSubject?: string;
  emailBody?: string;
}

interface ExportedPdf {
  id: string;
  label: string;
  url: string;
}

const MAX_BODY_CHARS = 8_000;

function asAnalysis(value: Record<string, unknown> | undefined): AnalysisWithEmail {
  return (value ?? {}) as AnalysisWithEmail;
}

function gmailComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to,
    su: subject,
    body: body.slice(0, MAX_BODY_CHARS),
  });
  return `https://mail.google.com/mail/u/0/?${params.toString()}`;
}

/**
 * Employers that want an email cannot use the remote browser: it has none of
 * the candidate's Gmail login. This panel prepares the message in Gmail's own
 * compose URL, hands over the approved PDFs, and only records APPLIED after the
 * candidate says they sent it.
 */
export function EmailApplyPanel({
  applicationId,
  workspace,
  onComplete,
}: {
  applicationId: string;
  workspace: ApplicationWorkspacePayload;
  onComplete?: () => void;
}) {
  const toast = useToast();
  const analysis = asAnalysis(workspace.preparation?.analysis);
  const recipient =
    workspace.preparation?.userInputs?.application_recipient ??
    analysis.emailRecipient ??
    "";
  const [subject, setSubject] = useState(analysis.emailSubject ?? "");
  const [body, setBody] = useState(analysis.emailBody ?? "");
  const [pdfs, setPdfs] = useState<ExportedPdf[]>([]);
  const [marking, setMarking] = useState(false);
  const [done, setDone] = useState(workspace.status === "APPLIED");
  const [error, setError] = useState<string | null>(null);

  const documentIds = workspace.preparation?.documentIds ?? {};
  const emailDocumentId = documentIds.email;
  const approvedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of Object.values(documentIds)) if (id) ids.add(id);
    for (const id of workspace.preparation?.preparedDocumentIds ?? []) if (id) ids.add(id);
    return [...ids].filter((id) => id !== emailDocumentId).slice(0, 4);
  }, [documentIds, emailDocumentId, workspace.preparation?.preparedDocumentIds]);

  useEffect(() => {
    let cancelled = false;
    async function loadApprovedEmail() {
      if (!emailDocumentId) return;
      try {
        const document = await api.get<{ content: string }>(`/documents/${emailDocumentId}`);
        if (cancelled || !document.content) return;
        const subjectLine = document.content.match(/^Subject:\s*(.*)$/im);
        if (subjectLine?.[1]) setSubject(subjectLine[1].trim());
        setBody(document.content.replace(/^Subject:\s*.*$/im, "").trim());
      } catch {
        // The draft stays as prepared rather than inventing a message.
      }
    }
    void loadApprovedEmail();
    return () => {
      cancelled = true;
    };
  }, [emailDocumentId]);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    async function loadPdfs() {
      const exports: ExportedPdf[] = [];
      await Promise.all(
        approvedIds.map(async (id) => {
          try {
            const blob = await api.postBlob(`/documents/${id}/export`, { format: "pdf" });
            const url = URL.createObjectURL(blob);
            created.push(url);
            const label =
              workspace.documents.find((item) => item.id === id)?.title ??
              (id === documentIds.cv ? "Tailored resume" : "Cover letter");
            exports.push({ id, label, url });
          } catch {
            // A failed export is shown as absent, never as an attached file.
          }
        }),
      );
      if (!cancelled) setPdfs(exports);
    }
    if (approvedIds.length) void loadPdfs();
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [approvedIds.join("|"), documentIds.cv, workspace.documents]);

  const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());
  const gmailUrl = useMemo(
    () => gmailComposeUrl(recipient.trim(), subject, body),
    [recipient, subject, body],
  );

  const markApplied = useCallback(async () => {
    if (!validRecipient) return;
    setMarking(true);
    setError(null);
    try {
      const current = await api.get<{ session: ApplicationGuidanceSession | null }>(
        `/applications/${applicationId}/guidance/sessions/current`,
      );
      let session = current.session;
      if (!session) {
        const created = await api.post<{ session: ApplicationGuidanceSession }>(
          `/applications/${applicationId}/guidance/sessions`,
          { mode: "email_compose", targetUrl: gmailUrl, consent: true },
        );
        session = created.session;
      }
      const created = await api.post<{ run: { id: string } }>(
        `/applications/${applicationId}/submission`,
        { consent: true, guidedSession: true },
      );
      await api.post(
        `/applications/${applicationId}/guidance/sessions/${session.id}/complete`,
        { url: gmailUrl, runId: created.run.id },
      );
      await api.post(`/applications/${applicationId}/guidance/sessions/${session.id}/end`);
      setDone(true);
      onComplete?.();
      toast.push("Marked as applied", "success");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The application could not be marked sent",
      );
    } finally {
      setMarking(false);
    }
  }, [applicationId, gmailUrl, onComplete, toast, validRecipient]);

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHead
          eyebrow="Stage 2 · Email application"
          title="Send it from your own Gmail"
          description="This employer wants an email. Gmail cannot be pre-filled with attachments from another browser, so the message opens ready to send and the approved PDFs are ready to attach."
          action={
            done ? (
              <Badge tone="success">
                <CheckCircle2 size={12} className="mr-1 inline" aria-hidden />
                Marked as applied
              </Badge>
            ) : (
              <Badge tone="accent" dot>
                Email submission
              </Badge>
            )
          }
        />
        <div className="flex flex-col gap-4 border-t border-app-border px-5 py-5">
          <Field
            label="Hiring recipient"
            hint={
              analysis.emailRecipient
                ? "Found in the employer's posting or application instructions."
                : "You added this address during preparation."
            }
          >
            <Input
              value={recipient}
              readOnly
              aria-invalid={!validRecipient}
              placeholder="careers@company.com"
            />
          </Field>
          {!validRecipient ? (
            <div
              role="alert"
              className="rounded-app-md border border-app-warning/40 bg-app-warning/10 px-4 py-3 text-[0.82rem] text-app-warning"
            >
              Add the employer&rsquo;s email address in stage 1 and approve the package again before continuing.
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={validRecipient ? gmailUrl : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!validRecipient}
              className={`inline-flex h-9 items-center gap-2 rounded-app-md border px-3 text-[0.8rem] font-semibold transition-colors ${
                validRecipient
                  ? "border-app-accent/50 bg-app-accent/12 text-app-accent hover:bg-app-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                  : "pointer-events-none border-app-border text-app-muted opacity-50"
              }`}
            >
              <Mail size={14} aria-hidden />
              Open Gmail with the message
              <ExternalLink size={13} aria-hidden />
            </a>
            <Link href={`/applications/${applicationId}`}>
              <Button type="button" variant="ghost" size="sm" icon={<ArrowLeft size={14} />}>
                Amend in stage 1
              </Button>
            </Link>
          </div>
          {body.length > MAX_BODY_CHARS ? (
            <p className="text-[0.78rem] text-app-muted">
              The approved message is long. Gmail&rsquo;s compose link carries the first{" "}
              {MAX_BODY_CHARS.toLocaleString()} characters; copy the rest from the document editor if needed.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <PanelHead
          eyebrow="Approved attachments"
          title="Attach these PDFs in Gmail"
          description="They are exported from the exact documents you approved in stage 1. Nothing here is sent for you."
        />
        <Rows className="border-t border-app-border">
          {pdfs.length ? (
            pdfs.map((pdf) => (
              <Row key={pdf.id} as="li" className="items-center gap-3">
                <Download size={15} className="shrink-0 text-app-accent" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[0.86rem] text-app-soft">{pdf.label}</span>
                <a
                  href={pdf.url}
                  download={`${pdf.label.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`}
                  className="inline-flex h-8 items-center rounded-app-sm px-2 text-[0.78rem] font-semibold text-app-accent hover:bg-app-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                >
                  Download
                </a>
              </Row>
            ))
          ) : (
            <Row as="li" className="text-[0.84rem] text-app-muted">
              No approved attachments were exported. Check the package in stage 1.
            </Row>
          )}
        </Rows>
      </Panel>

      {error ? (
        <div
          role="alert"
          className="rounded-app-md border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-[0.84rem] text-app-danger"
        >
          {error}
        </div>
      ) : null}

      <Panel>
        <PanelHead
          eyebrow="When Gmail shows it sent"
          title="Tell us so your tracker stays honest"
          description="We only mark the application as applied after you confirm it. No email is sent by this app."
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-app-border px-5 py-5">
          <Button
            type="button"
            icon={<CheckCircle2 size={15} />}
            loading={marking}
            disabled={done || !validRecipient}
            onClick={() => void markApplied()}
          >
            {done ? "Already marked applied" : "I sent it — mark applied"}
          </Button>
          <Link href={`/applications/${applicationId}`}>
            <Button type="button" variant="ghost" icon={<ArrowLeft size={14} />}>
              Back to preparation
            </Button>
          </Link>
        </div>
      </Panel>

      <div className="flex items-start gap-2.5 rounded-app-lg border border-app-success/25 bg-app-success/8 px-4 py-3 text-[0.84rem] leading-relaxed text-app-soft">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-app-success" aria-hidden />
        Your Gmail password, two-factor codes and contacts stay in Gmail. We save only the recipient
        address you approved in stage 1 and the fact that you said the message was sent.
      </div>
    </div>
  );
}
