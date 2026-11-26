"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileText,
  Mail,
  Save,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Meta,
  Page,
  Panel,
  PanelHead,
  Rows,
  Row,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { CompanyMark } from "@/components/app-art";
import { SceneBackdrop } from "@/components/app-scene";
import { sceneForPath } from "@/lib/app-scenes";
import { PreparationPanel } from "@/components/application/preparation-panel";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import type {
  ApplicationPreparation,
  ApplicationSubmissionRun,
} from "@/lib/types";
import type { Opportunity } from "@/lib/types";

interface ApplicationItem {
  id: string;
  opportunityId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  appliedAt?: string;
}

interface ApplicationsResponse {
  items: ApplicationItem[];
}

interface DocumentRecord {
  id: string;
  title: string;
  content: string;
  type: string;
}

const DOCUMENT_LABELS: Record<string, string> = {
  cv: "Tailored CV",
  cover_letter: "Cover letter",
  application_email: "Application email",
  answer: "Screening answer",
};

/**
 * Stage 1 of applying. The old workspace called the compatibility
 * `/analyze` endpoint and kept the email draft in localStorage, so a person
 * could "approve" a package that was never saved and could not be submitted.
 * This page uses the durable preparation record instead: preparation, inputs,
 * review and approval all live on the server.
 */
function ApplicationWorkspaceInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const applications = useApi<ApplicationsResponse>("/applications");
  const application =
    applications.data?.items?.find((item) => item.id === params.id) ?? null;

  const opportunity = useApi<Opportunity>(
    application ? `/opportunities/${application.opportunityId}` : null,
  ).data;

  const preparationQuery = useApi<{ preparation: ApplicationPreparation }>(
    application ? `/applications/${application.id}/preparation` : null,
  );
  const submissionQuery = useApi<{ run: ApplicationSubmissionRun | null }>(
    application ? `/applications/${application.id}/submission` : null,
  );

  const [preparation, setPreparation] = useState<ApplicationPreparation | null>(null);
  const [documents, setDocuments] = useState<Record<string, DocumentRecord>>({});
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);

  const setPreparationFromResponse = useCallback(
    (next: ApplicationPreparation | null) => {
      setPreparation(next);
      if (next) {
        setInputDrafts((current) => ({ ...next.userInputs, ...current }));
      }
    },
    [],
  );

  useEffect(() => {
    if (preparationQuery.data?.preparation) {
      setPreparationFromResponse(preparationQuery.data.preparation);
    }
  }, [preparationQuery.data?.preparation, setPreparationFromResponse]);

  const pending =
    preparation?.status === "QUEUED" || preparation?.status === "RUNNING";

  useEffect(() => {
    if (!application || !pending) return;
    const timer = window.setInterval(() => {
      void preparationQuery.refresh();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [application, pending, preparationQuery]);

  const documentIds = useMemo(() => {
    if (!preparation) return [] as string[];
    const ids = Object.values(preparation.documentIds).filter(
      (value): value is string => typeof value === "string",
    );
    return [...new Set(ids)];
  }, [preparation]);

  useEffect(() => {
    let cancelled = false;
    async function loadDocuments() {
      const loaded: Record<string, DocumentRecord> = {};
      await Promise.all(
        documentIds.map(async (id) => {
          try {
            const document = await api.get<DocumentRecord>(`/documents/${id}`);
            loaded[id] = document;
          } catch {
            // A missing document must show as missing, not as an empty editor.
          }
        }),
      );
      if (!cancelled) setDocuments(loaded);
    }
    if (documentIds.length > 0) void loadDocuments();
    else setDocuments({});
    return () => {
      cancelled = true;
    };
  }, [documentIds.join("|")]);

  const startPreparation = async () => {
    if (!application || !opportunity) return;
    setWorking("start");
    try {
      const response = await api.post<{ preparation: ApplicationPreparation }>(
        `/applications/prepare/${opportunity.id}`,
      );
      setPreparationFromResponse(response.preparation);
      toast.push("Application package queued for preparation", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not start preparation",
        "danger",
      );
    } finally {
      setWorking(null);
    }
  };

  const refreshPreparation = async () => {
    if (!application || !opportunity) return;
    setWorking("refresh");
    try {
      const response = await api.post<{ preparation: ApplicationPreparation }>(
        `/applications/prepare/${opportunity.id}/refresh`,
      );
      setPreparationFromResponse(response.preparation);
      toast.push("Preparing a fresh package", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not refresh the package",
        "danger",
      );
    } finally {
      setWorking(null);
    }
  };

  const saveInputs = async () => {
    if (!application || !preparation) return;
    setWorking("inputs");
    try {
      const response = await api.put<{ preparation: ApplicationPreparation }>(
        `/applications/${application.id}/preparation/inputs`,
        {
          inputs: preparation.missingInputs
            .filter((item) => !item.requiresManualAction)
            .map((item) => ({ key: item.key, value: inputDrafts[item.key] ?? "" })),
        },
      );
      setPreparationFromResponse(response.preparation);
      applications.refresh();
      toast.push("Your answers were saved", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not save your answers",
        "danger",
      );
    } finally {
      setWorking(null);
    }
  };

  const saveDocument = async (id: string) => {
    const draft = documents[id];
    if (!draft || !application) return;
    setWorking(id);
    try {
      // GET and PATCH both return the document record directly, not an
      // envelope. The preparation is re-read because editing a document
      // invalidates the approval fingerprint on the server.
      const saved = await api.patch<DocumentRecord>(`/documents/${id}`, {
        content: draft.content,
        title: draft.title,
      });
      setDocuments((current) => ({ ...current, [id]: saved }));
      const fresh = await api.get<{ preparation: ApplicationPreparation }>(
        `/applications/${application.id}/preparation`,
      );
      setPreparation(fresh.preparation);
      toast.push("Saved. Re-approve the package before submitting.", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not save this document",
        "danger",
      );
    } finally {
      setWorking(null);
    }
  };

  const approve = async () => {
    if (!application) return;
    setWorking("approve");
    try {
      const response = await api.post<{ preparation: ApplicationPreparation }>(
        `/applications/${application.id}/preparation/approve`,
      );
      setPreparation(response.preparation);
      applications.refresh();
      toast.push("Package approved. You can now open the application workspace.", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not approve the package",
        "danger",
      );
    } finally {
      setWorking(null);
    }
  };

  const approved =
    preparation?.status === "READY" &&
    Boolean(preparation.approvedFingerprint);
  const missingInputs = (preparation?.missingInputs ?? []).filter(
    (item) => !item.requiresManualAction,
  );
  const manualActions = (preparation?.missingInputs ?? []).filter(
    (item) => item.requiresManualAction,
  );

  if (applications.error && !application) {
    return (
      <EmptyState
        icon={<ShieldCheck size={26} />}
        title="Could not load this application"
        description={applications.error}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => applications.refresh()}>
              Try again
            </Button>
            <Link href="/applications">
              <Button variant="ghost">Back to applications</Button>
            </Link>
          </div>
        }
      />
    );
  }

  if (applications.loading && !application) return <Skeleton height={320} />;

  if (!application) {
    return (
      <EmptyState
        title="Application not found"
        description="It may have been removed."
        action={
          <Link href="/applications">
            <Button variant="outline">Back to applications</Button>
          </Link>
        }
      />
    );
  }

  const stages = [
    { label: "Prepare & approve", done: Boolean(approved), active: !approved },
    { label: "Submit", done: application.status === "APPLIED", active: Boolean(approved) },
    { label: "Track", done: ["ACKNOWLEDGED", "NO_RESPONSE", "SCREENING", "ASSESSMENT", "INTERVIEW", "OFFER"].includes(application.status), active: false },
  ];

  return (
    <Page>
      <SceneBackdrop
        scene={sceneForPath("/applications")}
        priority
        minHeight="clamp(240px, 26vw, 320px)"
      >
        <Link
          href="/applications"
          className="inline-flex items-center gap-1.5 font-mono text-[0.66rem] tracking-[0.14em] text-app-muted uppercase transition-colors hover:text-white"
        >
          <ArrowLeft size={13} />
          All applications
        </Link>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <CompanyMark
              name={opportunity?.companyName}
              size={52}
              className="mt-1 hidden border-white/20 sm:grid"
            />
            <div className="min-w-0">
              <p className="font-mono text-[0.64rem] tracking-[0.18em] text-white/60 uppercase">
                Stage 1 · Preparing your application
              </p>
              <h1 className="mt-2 max-w-[34ch] text-[clamp(1.7rem,3.6vw,2.6rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-white text-balance">
                {opportunity?.title ?? "Application"}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.82rem] text-white/65">
                <span className="text-white/85">
                  {opportunity?.companyName ?? "—"}
                </span>
                <span aria-hidden>·</span>
                <span>{titleCase(application.status)}</span>
                {application.appliedAt ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>Submitted {formatDateTime(application.appliedAt)}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <Link href={`/opportunities/${application.opportunityId}`}>
            <Button variant="ghost" size="sm">
              View the role
            </Button>
          </Link>
        </div>
      </SceneBackdrop>

      <nav aria-label="Application progress" className="flex flex-wrap gap-2">
        {stages.map((stage, index) => (
          <div
            key={stage.label}
            aria-current={stage.active ? "step" : undefined}
            className={`flex items-center gap-2 rounded-app-md border px-3 py-2 text-[0.78rem] ${
              stage.active
                ? "border-app-accent/40 bg-app-surface-2 text-app-text"
                : "border-app-border bg-app-surface text-app-muted"
            }`}
          >
            <span className="font-mono text-[0.68rem] tabular-nums">
              {stage.done ? "✓" : String(index + 1).padStart(2, "0")}
            </span>
            {stage.label}
          </div>
        ))}
      </nav>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <PreparationPanel
            preparation={preparation}
            loading={preparationQuery.loading && !preparation}
            onRefresh={() => void refreshPreparation()}
            action={
              !preparation ? (
                <Button
                  icon={<Sparkles size={15} />}
                  loading={working === "start"}
                  onClick={() => void startPreparation()}
                >
                  Prepare this application
                </Button>
              ) : undefined
            }
          />

          {missingInputs.length > 0 ? (
            <Panel>
              <PanelHead
                eyebrow="A few details"
                title="Only you can answer these"
                description="The agent left these blank rather than guessing. Save them to continue."
              />
              <form
                className="flex flex-col gap-4 border-t border-app-border px-5 py-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveInputs();
                }}
              >
                {missingInputs.map((item) => (
                  <Field key={item.key} label={item.label}>
                    {item.type === "textarea" ? (
                      <Textarea
                        rows={3}
                        name={item.key}
                        value={inputDrafts[item.key] ?? item.suggestedValue ?? ""}
                        onChange={(event) =>
                          setInputDrafts((current) => ({
                            ...current,
                            [item.key]: event.target.value,
                          }))
                        }
                        aria-describedby={`${item.key}-reason`}
                      />
                    ) : (
                      <Input
                        name={item.key}
                        type={
                          item.type === "email" || item.type === "tel"
                            ? item.type
                            : "text"
                        }
                        value={inputDrafts[item.key] ?? item.suggestedValue ?? ""}
                        onChange={(event) =>
                          setInputDrafts((current) => ({
                            ...current,
                            [item.key]: event.target.value,
                          }))
                        }
                        aria-describedby={`${item.key}-reason`}
                      />
                    )}
                    <p id={`${item.key}-reason`} className="text-[0.78rem] text-app-muted">
                      {item.reason}
                    </p>
                  </Field>
                ))}
                <div>
                  <Button
                    type="submit"
                    icon={<Save size={15} />}
                    loading={working === "inputs"}
                  >
                    Save answers
                  </Button>
                </div>
              </form>
            </Panel>
          ) : null}

          {manualActions.length > 0 ? (
            <Panel>
              <PanelHead
                eyebrow="On the employer’s site"
                title="Steps the agent will leave to you"
                description="These need your judgement or identity. They will appear as prompts during submission."
              />
              <Rows className="border-t border-app-border">
                {manualActions.map((item) => (
                  <Row key={item.key} as="li" className="items-start gap-3">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0 text-app-accent" />
                    <span className="text-[0.86rem] leading-relaxed text-app-soft">
                      {item.label} — {item.reason}
                    </span>
                  </Row>
                ))}
              </Rows>
            </Panel>
          ) : null}

          {documentIds.length > 0 ? (
            <Panel>
              <PanelHead
                eyebrow="Your package"
                title="Review, amend, save"
                description="This is the exact material that will be attached or entered. Editing it revokes approval."
              />
              <div className="flex flex-col divide-y divide-app-border border-t border-app-border">
                {documentIds.map((id) => {
                  const document = documents[id];
                  return (
                    <form
                      key={id}
                      className="flex flex-col gap-3 px-5 py-5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveDocument(id);
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-[0.94rem] font-semibold text-app-text">
                            {document
                              ? DOCUMENT_LABELS[document.type] ?? document.title
                              : "Document unavailable"}
                          </h3>
                          <p className="mt-0.5 font-mono text-[0.7rem] text-app-muted">
                            {document?.title ?? id}
                          </p>
                        </div>
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          icon={<Save size={14} />}
                          loading={working === id}
                          disabled={!document}
                        >
                          Save changes
                        </Button>
                      </div>
                      {document ? (
                        <Textarea
                          rows={opportunity?.applicationMethod === "email" && document.type === "application_email" ? 10 : 8}
                          value={document.content}
                          onChange={(event) =>
                            setDocuments((current) => ({
                              ...current,
                              [id]: {
                                ...current[id],
                                content: event.target.value,
                              },
                            }))
                          }
                          aria-label={`${DOCUMENT_LABELS[document.type] ?? document.title} content`}
                        />
                      ) : (
                        <p className="text-[0.82rem] text-app-muted">
                          This document could not be opened. Refresh the package to generate it again.
                        </p>
                      )}
                    </form>
                  );
                })}
              </div>
            </Panel>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
          <Panel>
            <PanelHead
              eyebrow="Stage 2"
              title={approved ? "Ready to apply" : "Waiting for approval"}
              description={
                approved
                  ? "The approved package is frozen. Open the workspace to submit."
                  : "Approve the package above after reviewing every document."
              }
            />
            <div className="flex flex-col gap-3 border-t border-app-border px-5 py-5">
              {approved ? (
                <>
                  <p className="flex items-start gap-2 text-[0.83rem] leading-relaxed text-app-soft">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-app-success" />
                    Approved {formatDateTime(preparation!.approvedAt!)}. Any edit to a document revokes this.
                  </p>
                  <Button
                    className="w-full justify-center"
                    icon={<ArrowRight size={15} />}
                    onClick={() => router.push(`/applications/${application.id}/apply`)}
                  >
                    Open application workspace
                  </Button>
                  {submissionQuery.data?.run ? (
                    <p className="text-[0.78rem] text-app-muted">
                      Submission status: {titleCase(submissionQuery.data.run.status)}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <Button
                    className="w-full justify-center"
                    loading={working === "approve"}
                    disabled={!preparation || preparation.status !== "AWAITING_REVIEW" || missingInputs.length > 0}
                    icon={<FileCheck2 size={15} />}
                    onClick={() => void approve()}
                  >
                    Approve this package
                  </Button>
                  <p className="text-[0.78rem] leading-relaxed text-app-muted">
                    {preparation?.status === "AWAITING_REVIEW"
                      ? "Approving records the exact document versions that may be submitted."
                      : "The package must finish preparing before you can approve it."}
                  </p>
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHead eyebrow="Submission method" title="How this employer hires" />
            <Rows className="border-t border-app-border">
              <Row as="li" className="items-center gap-3">
                {opportunity?.applicationMethod === "email" ? (
                  <Mail size={16} className="shrink-0 text-app-accent" />
                ) : (
                  <ScanSearch size={16} className="shrink-0 text-app-accent" />
                )}
                <Meta
                  label="Method"
                  value={
                    opportunity?.applicationMethod === "email"
                      ? "Email application"
                      : "Employer website"
                  }
                />
              </Row>
              <Row as="li" className="items-center gap-3">
                <FileText size={16} className="shrink-0 text-app-accent" />
                <Meta label="Documents" value={String(documentIds.length)} />
              </Row>
              <Row as="li" className="items-center gap-3">
                <Meta label="Status" value={titleCase(application.status)} />
              </Row>
            </Rows>
          </Panel>

          <div className="flex items-start gap-2.5 rounded-app-lg border border-app-success/25 bg-app-success/8 px-4 py-3 text-[0.84rem] leading-relaxed text-app-soft">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-app-success" />
            Nothing is sent until you approve the package and then complete the submission yourself.
          </div>
        </aside>
      </div>
    </Page>
  );
}

export default function ApplicationWorkspacePage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Skeleton height={320} />}>
      <ApplicationWorkspaceInner key={params.id} />
    </Suspense>
  );
}
