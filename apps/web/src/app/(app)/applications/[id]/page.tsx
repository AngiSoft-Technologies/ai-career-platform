"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Mail,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
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
  Tabs,
  Td,
  Textarea,
  Th,
  useToast,
} from "@/components/ui";
import { CompanyMark } from "@/components/app-art";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import type { ApplicationAnalysis, Opportunity } from "@/lib/types";

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

function safeEmployerUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname) return null;
    if (typeof window !== "undefined" && url.origin === window.location.origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function ApplicationWorkspaceInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const toast = useToast();
  const startedFromOpportunity = useRef(false);
  const [tab, setTab] = useState("overview");
  const [analysis, setAnalysis] = useState<ApplicationAnalysis | null>(null);
  const [applicationOverride, setApplicationOverride] = useState<ApplicationItem | null>(null);
  const [startingGuide, setStartingGuide] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [employerPageOpen, setEmployerPageOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [guideChecks, setGuideChecks] = useState<Record<string, boolean>>({});
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [confirmingSubmission, setConfirmingSubmission] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [followupDate, setFollowupDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 5);
    return date.toISOString().slice(0, 10);
  });

  const applications = useApi<ApplicationsResponse>("/applications");
  const application =
    applicationOverride ?? applications.data?.items?.find((item) => item.id === params.id);
  // The posting is fetched by id. The workspace used to scan the first page of
  // the feed for it, so an application to a role outside that page rendered
  // without its title or employer.
  const opportunityQuery = useApi<Opportunity>(
    application ? `/opportunities/${application.opportunityId}` : null,
    undefined,
  );
  const opportunity = opportunityQuery.data;
  const employerUrl = analysis ? safeEmployerUrl(analysis.analysisUrl) : null;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`mboqara.application-guide:${params.id}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        if ("checks" in parsed && parsed.checks && typeof parsed.checks === "object") {
          setGuideChecks(parsed.checks as Record<string, boolean>);
          setQuestionAnswers(
            parsed.questionAnswers && typeof parsed.questionAnswers === "object"
              ? (parsed.questionAnswers as Record<string, string>)
              : {},
          );
          setEmailSubject(typeof parsed.emailSubject === "string" ? parsed.emailSubject : "");
          setEmailBody(typeof parsed.emailBody === "string" ? parsed.emailBody : "");
        } else {
          setGuideChecks(
            Object.fromEntries(
              Object.entries(parsed).filter(
                (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
              ),
            ),
          );
        }
      }
    } catch {
      setGuideChecks({});
    }
    setProgressLoaded(true);
  }, [params.id]);

  useEffect(() => {
    if (progressLoaded) {
      window.localStorage.setItem(
        `mboqara.application-guide:${params.id}`,
        JSON.stringify({ checks: guideChecks, questionAnswers, emailSubject, emailBody }),
      );
    }
  }, [emailBody, emailSubject, guideChecks, params.id, progressLoaded, questionAnswers]);

  const analyse = async (): Promise<ApplicationAnalysis | null> => {
    if (!application) return null;
    setAnalysing(true);
    try {
      const response = await api.post<{ analysis: ApplicationAnalysis }>(
        `/applications/${application.id}/analyze`,
      );
      setAnalysis(response.analysis);
      setQuestionAnswers((current) =>
        Object.keys(current).length
          ? current
          : Object.fromEntries(
              response.analysis.questions.map((item) => [item.question, item.answer ?? ""]),
            ),
      );
      setEmailSubject(
        (current) =>
          current ||
          response.analysis.emailSubject ||
          `Application for ${opportunity?.title ?? "this role"}`,
      );
      setEmailBody(
        (current) =>
          current ||
          response.analysis.emailBody ||
          `Hello,\n\nI am applying for the ${opportunity?.title ?? "role"} position${
            opportunity?.companyName ? ` at ${opportunity.companyName}` : ""
          }. I have attached my application documents for your review.\n\nKind regards`,
      );
      toast.push(`Application instructions ready for ${response.analysis.platform}`, "success");
      return response.analysis;
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Analysis failed",
        "danger",
      );
      return null;
    } finally {
      setAnalysing(false);
    }
  };

  const changeStatus = async (current: ApplicationItem, status: string) => {
    setUpdatingStatus(true);
    try {
      const response = await api.patch<{ application: ApplicationItem }>(
        `/applications/${current.id}/status`,
        { status, version: current.version },
      );
      setApplicationOverride(response.application);
      applications.refresh();
      return response.application;
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not update application progress",
        "danger",
      );
      return null;
    } finally {
      setUpdatingStatus(false);
    }
  };

  const startGuidedApplication = async () => {
    if (!application) return;
    setStartingGuide(true);
    try {
      const result = analysis ?? (await analyse());
      if (!result) return;
      let current = applicationOverride ?? application;
      if (current.status === "SHORTLISTED") {
        const analyzed = await changeStatus(current, "ANALYZED");
        if (!analyzed) return;
        current = analyzed;
      }
      if (current.status === "ANALYZED") {
        const preparing = await changeStatus(current, "APPLICATION_PREPARATION");
        if (!preparing) return;
      }
      setTab("apply");
    } finally {
      setStartingGuide(false);
    }
  };

  const setGuideCheck = (key: string, checked: boolean) => {
    setGuideChecks((current) => ({ ...current, [key]: checked }));
  };

  const copyEmail = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.push(`${label} copied`, "success");
    } catch {
      toast.push("Clipboard access is unavailable in this browser", "warning");
    }
  };

  const markReadyToApply = async () => {
    if (!application || application.status !== "APPLICATION_PREPARATION") return;
    const ready = await changeStatus(application, "READY_TO_APPLY");
    if (ready) toast.push("You are ready to continue on the employer’s application", "success");
  };

  const confirmSubmitted = async () => {
    if (!application || application.status !== "READY_TO_APPLY") return;
    const applied = await changeStatus(application, "APPLIED");
    if (applied) {
      setConfirmingSubmission(false);
      toast.push("Application marked as submitted", "success");
    }
  };

  useEffect(() => {
    if (searchParams.get("guided") !== "1" || !application || startedFromOpportunity.current) return;
    startedFromOpportunity.current = true;
    setTab("apply");
    void startGuidedApplication();
  }, [application?.id, searchParams]);

  const scheduleFollowup = async () => {
    if (!application) return;
    setSavingFollowup(true);
    try {
      await api.post(`/applications/${application.id}/followups`, {
        dueAt: new Date(`${followupDate}T09:00:00Z`).toISOString(),
        channel: "email",
        note: "Check in on the application.",
      });
      toast.push("Follow-up scheduled", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not schedule the follow-up",
        "danger",
      );
    } finally {
      setSavingFollowup(false);
    }
  };

  // A failed request is not an empty one. The page used to answer both
  // with "Application not found", so a 500 or an expired session looked
  // like a deleted application.
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

  if (applications.loading && !application) {
    return <Skeleton height={320} />;
  }

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

  const checklist = [
    ["details", "I checked the role and employer details"],
    [
      "documents",
      `I prepared ${
        analysis?.requiredDocuments.map(titleCase).join(" and ") || "the requested documents"
      }`,
    ],
    ["answers", "I reviewed my answers and corrected anything that was wrong"],
    [
      "final",
      analysis?.method === "email"
        ? "I checked the recipient and attachments before sending"
        : "I reviewed the completed form on the employer’s page",
    ],
  ] as const;

  const allChecked = checklist.every(([key]) => guideChecks[key]);

  return (
    <Page>
      <div className="flex flex-col gap-5 border-b border-app-border pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/applications"
            className="inline-flex items-center gap-1.5 font-mono text-[0.66rem] tracking-[0.14em] text-app-muted uppercase transition-colors hover:text-app-soft"
          >
            <ArrowLeft size={13} />
            All applications
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={application.status === "OFFER" ? "success" : "accent"} dot>
              {titleCase(application.status)}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              icon={<ScanSearch size={14} />}
              loading={analysing || startingGuide}
              onClick={() => void startGuidedApplication()}
            >
              {analysis ? "Continue application" : "Start guided application"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <CompanyMark name={opportunity?.companyName} size={52} className="mt-1 hidden sm:grid" />
            <div className="min-w-0">
              <p className="font-mono text-[0.64rem] tracking-[0.18em] text-app-muted uppercase">
                Application workspace
              </p>
              <h1 className="mt-2 max-w-[34ch] text-[clamp(1.7rem,3.6vw,2.6rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-app-text text-balance">
                {opportunity?.title ?? "Application"}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.82rem] text-app-muted">
                <span className="text-app-soft">{opportunity?.companyName ?? "—"}</span>
                <span aria-hidden>·</span>
                <span>Started {formatDateTime(application.createdAt)}</span>
                {application.appliedAt ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>Submitted {formatDateTime(application.appliedAt)}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <Link href={`/opportunities/${application.opportunityId}`} className="shrink-0">
            <Button variant="ghost" size="sm" icon={<ExternalLink size={13} />}>
              View the role
            </Button>
          </Link>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "apply", label: "Application", count: analysis?.fields.length },
          { key: "followup", label: "Follow-up" },
          { key: "documents", label: "Documents" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <Panel>
            <PanelHead
              eyebrow="How it works"
              title="Four steps, and you control each one"
              description="MboQara does the drafting. Nothing leaves until you approve it."
            />
            <Rows className="border-t border-app-border">
              {[
                "MboQara prepares the documents and the field answers.",
                "You review every suggestion and correct anything.",
                "You approve, then submit on the employer’s own page.",
                "We track the outcome and remind you to follow up.",
              ].map((line, index) => (
                <Row key={line} as="li" className="items-start gap-4">
                  <span className="font-mono text-[0.7rem] font-semibold tabular-nums text-app-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="max-w-[54ch] text-[0.9rem] leading-relaxed text-app-soft">
                    {line}
                  </span>
                </Row>
              ))}
            </Rows>
          </Panel>

          <div className="flex flex-col gap-6">
            <Panel>
              <PanelHead eyebrow="Record" title="Where this application is" />
              <Rows className="border-t border-app-border">
                <Row as="li" className="items-center justify-between gap-3">
                  <Meta label="Status" value={titleCase(application.status)} />
                </Row>
                <Row as="li" className="items-center justify-between gap-3">
                  <Meta label="Created" value={formatDateTime(application.createdAt)} />
                </Row>
                <Row as="li" className="items-center justify-between gap-3">
                  <Meta label="Last updated" value={formatDateTime(application.updatedAt)} />
                </Row>
                <Row as="li" className="items-center justify-between gap-3">
                  <Meta label="Revision" value={String(application.version)} />
                </Row>
                <Row as="li" className="items-center justify-between gap-3">
                  <Meta label="Employer" value={opportunity?.companyName ?? "—"} />
                </Row>
              </Rows>
            </Panel>

            <div className="flex items-start gap-2.5 rounded-app-lg border border-app-success/25 bg-app-success/8 px-4 py-3 text-[0.84rem] leading-relaxed text-app-soft">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-app-success" />
              No application is ever sent without your explicit action.
            </div>
          </div>
        </div>
      ) : null}

      {tab === "apply" ? (
        <div className="flex flex-col gap-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-app-border pb-5">
            <div className="min-w-[240px] flex-1">
              <p className="font-mono text-[0.62rem] tracking-[0.18em] text-app-muted uppercase">
                Your application, step by step
              </p>
              <h2 className="mt-2 max-w-[30ch] text-[clamp(1.35rem,2.6vw,1.85rem)] leading-tight font-semibold tracking-[-0.02em] text-app-text">
                {application.status === "APPLIED"
                  ? "Submission recorded"
                  : opportunity?.applicationMethod === "email"
                    ? "Prepare and send your email"
                    : "Complete the employer’s application"}
              </h2>
              <p className="mt-2 max-w-[62ch] text-[0.88rem] leading-relaxed text-app-muted">
                {application.status === "APPLIED"
                  ? `You marked this application as submitted${
                      application.appliedAt ? ` on ${formatDateTime(application.appliedAt)}` : ""
                    }.`
                  : opportunity?.applicationMethod === "email"
                    ? "We'll prepare the details and documents. You review everything, then send it from your email app."
                    : "Keep these instructions beside the employer's form. MboQara will never submit the form for you."}
              </p>
            </div>
            <Badge tone="success" dot>
              {titleCase(application.status)}
            </Badge>
          </div>

          {analysis ? (
            <Panel>
              <PanelHead
                eyebrow="Employer instructions"
                title={
                  analysis.method === "email"
                    ? "Email application"
                    : `${titleCase(analysis.platform)} application`
                }
                description={
                  analysis.rawTitle
                    ? `Instructions prepared from ${analysis.rawTitle}.`
                    : "Review the requirements, prepare your materials, and follow the employer’s steps."
                }
                className="border-b border-app-border"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    loading={analysing}
                    onClick={() => void analyse()}
                  >
                    Re-analyse
                  </Button>
                }
              />

              <div className="grid items-start gap-8 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,290px)]">
                <div className="flex min-w-0 flex-col gap-5">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="accent">{titleCase(analysis.platform)}</Badge>
                    <Badge tone="neutral">{titleCase(analysis.method)}</Badge>
                    {analysis.emailRecipient ? (
                      <Badge tone="info">
                        <Mail size={11} /> {analysis.emailRecipient}
                      </Badge>
                    ) : null}
                  </div>

                  {analysis.method === "email" ? (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-[0.98rem] font-semibold text-app-text">Review your email</h3>
                      <Field label="To">
                        <div className="flex gap-2">
                          {/* No aria-label here: the visible label already
                              names the field, and the two together read as
                              two different questions. */}
                          <Input
                            readOnly
                            value={
                              analysis.emailRecipient ??
                              "Recipient not found — check the employer instructions"
                            }
                          />
                          {analysis.emailRecipient ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              icon={<Clipboard size={14} />}
                              onClick={() => void copyEmail(analysis.emailRecipient!, "Recipient")}
                            >
                              Copy
                            </Button>
                          ) : null}
                        </div>
                      </Field>
                      <Field label="Subject">
                        <Input
                          value={emailSubject}
                          onChange={(event) => setEmailSubject(event.target.value)}
                        />
                      </Field>
                      <Field label="Message">
                        <Textarea
                          rows={8}
                          value={emailBody}
                          onChange={(event) => setEmailBody(event.target.value)}
                        />
                      </Field>

                      <div className="rounded-app-md border border-app-border bg-app-surface-2/40 p-3.5">
                        <strong className="text-[0.86rem] text-app-text">
                          Before sending, attach your documents
                        </strong>
                        <p className="mt-1 text-[0.82rem] leading-relaxed text-app-muted">
                          {analysis.requiredDocuments.map(titleCase).join(" and ") ||
                            "CV and cover letter"}{" "}
                          are expected. Generate or review them in your document editor.
                        </p>
                        <Link
                          href={`/documents?opportunityId=${application.opportunityId}`}
                          className="mt-2 inline-block"
                        >
                          <Button size="sm" variant="outline" icon={<FileText size={14} />}>
                            Open my documents
                          </Button>
                        </Link>
                      </div>

                      {analysis.emailRecipient ? (
                        <a
                          className="inline-flex"
                          href={`mailto:${encodeURIComponent(analysis.emailRecipient)}?subject=${encodeURIComponent(
                            emailSubject,
                          )}&body=${encodeURIComponent(emailBody)}`}
                        >
                          <Button icon={<Mail size={14} />}>Open email app</Button>
                        </a>
                      ) : null}
                    </section>
                  ) : (
                    <section aria-label="Employer application page">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-[200px] flex-1">
                          <h3 className="text-[0.98rem] font-semibold text-app-text">
                            Employer’s application page
                          </h3>
                          <p className="mt-1 text-[0.82rem] leading-relaxed text-app-muted">
                            Complete each form step there. Return here whenever you need your
                            checklist or prepared documents.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEmployerPageOpen((open) => !open)}
                          >
                            {employerPageOpen ? "Hide employer page" : "Open inside MboQara"}
                          </Button>
                          {employerUrl ? (
                            <a href={employerUrl} target="_blank" rel="noopener noreferrer">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                icon={<ExternalLink size={13} />}
                              >
                                New tab
                              </Button>
                            </a>
                          ) : null}
                        </div>
                      </div>

                      {employerPageOpen && employerUrl ? (
                        <iframe
                          className="mt-3 h-[480px] w-full rounded-app-md border border-app-border bg-app-surface-2"
                          title={`Employer application for ${opportunity?.title ?? "this role"}`}
                          src={employerUrl}
                          referrerPolicy="no-referrer"
                          // The employer's page runs sandboxed without allow-same-origin: with it,
                          // a framed page keeps its origin's privileges and the
                          // sandbox isolates nothing.
                          sandbox="allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads"
                        />
                      ) : (
                        <div className="mt-3 flex flex-col items-center gap-2 rounded-app-md border border-dashed border-app-border px-4 py-10 text-center">
                          <ExternalLink size={22} className="text-app-muted" />
                          <p className="max-w-md text-[0.84rem] leading-relaxed text-app-muted">
                            {employerUrl
                              ? "Open the employer’s site here to follow its application steps."
                              : "This link cannot be embedded safely. Use the employer’s website address from the job listing."}
                          </p>
                        </div>
                      )}
                      <p className="mt-2 text-[0.74rem] text-app-muted">
                        Some employers block embedded pages. If the page stays blank, use “New
                        tab”; this checklist will remain open here.
                      </p>
                    </section>
                  )}

                  {analysis.questions.length > 0 ? (
                    <section>
                      <h3 className="text-[0.98rem] font-semibold text-app-text">
                        Questions to prepare
                      </h3>
                      <p className="mt-1 text-[0.82rem] leading-relaxed text-app-muted">
                        These were found in the employer’s page. Draft and review your answers
                        before entering them there.
                      </p>
                      <div className="mt-3 flex flex-col gap-3">
                        {analysis.questions.map((item) => (
                          <Field key={item.question} label={item.question}>
                            <Textarea
                              rows={4}
                              value={questionAnswers[item.question] ?? ""}
                              onChange={(event) =>
                                setQuestionAnswers((current) => ({
                                  ...current,
                                  [item.question]: event.target.value,
                                }))
                              }
                              placeholder="Write a truthful answer in your own words"
                            />
                          </Field>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {analysis.fields.length > 0 ? (
                    <details className="rounded-app-md border border-app-border">
                      <summary className="cursor-pointer px-3 py-2.5 text-[0.85rem] font-semibold text-app-text">
                        Detected fields and profile suggestions ({analysis.fields.length})
                      </summary>
                      <div className="p-3 pt-0">
                        <DataTable>
                          <thead>
                            <tr>
                              <Th>Field</Th>
                              <Th>Type</Th>
                              <Th>Required</Th>
                              <Th>Suggested</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.fields.map((field) => (
                              <tr key={field.key}>
                                <Td className="font-semibold text-app-text">{field.label}</Td>
                                <Td className="font-mono text-[0.76rem]">{field.type}</Td>
                                <Td className="text-[0.8rem]">{field.required ? "Yes" : "No"}</Td>
                                <Td className="max-w-[280px] text-[0.8rem]">
                                  {field.suggestedValue ? (
                                    field.suggestedValue
                                  ) : (
                                    <Badge tone="warning">you provide</Badge>
                                  )}
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </DataTable>
                      </div>
                    </details>
                  ) : (
                    <p className="text-[0.88rem] text-app-muted">
                      No structured form was detected. This employer likely uses a bespoke page.
                    </p>
                  )}

                  {analysis.instructions.length > 0 ? (
                    <section>
                      <h3 className="text-[0.98rem] font-semibold text-app-text">
                        What the employer asks you to do
                      </h3>
                      <div className="mt-2.5 flex flex-col gap-1.5">
                        {analysis.instructions.map((instruction, index) => (
                          <label
                            key={index}
                            className="flex cursor-pointer items-start gap-2.5 rounded-app-sm px-2 py-1.5 text-[0.85rem] leading-relaxed text-app-soft transition-colors hover:bg-app-surface-2/50"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-[var(--accent)]"
                              checked={Boolean(guideChecks[`instruction-${index}`])}
                              onChange={(event) =>
                                setGuideCheck(`instruction-${index}`, event.target.checked)
                              }
                            />
                            <span>{instruction}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>

                <aside className="flex flex-col gap-2 rounded-app-md border border-app-border bg-app-surface-2/40 p-4 lg:sticky lg:top-[92px]">
                  <h3 className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
                    Before you submit
                  </h3>
                  <p className="mb-2 text-[0.8rem] leading-relaxed text-app-muted">
                    Use these checks as you move through the employer’s process.
                  </p>
                  {checklist.map(([key, label]) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-app-sm py-1 text-[0.83rem] leading-relaxed text-app-soft"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                        checked={Boolean(guideChecks[key])}
                        onChange={(event) => setGuideCheck(key, event.target.checked)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  <div className="mt-2">
                    <Button
                      type="button"
                      className="w-full justify-center"
                      loading={updatingStatus}
                      disabled={
                        application.status !== "APPLICATION_PREPARATION" || !allChecked
                      }
                      onClick={() => void markReadyToApply()}
                    >
                      {application.status === "READY_TO_APPLY"
                        ? "Ready to continue"
                        : "I’m ready to submit"}
                    </Button>
                  </div>
                  {application.status === "READY_TO_APPLY" ? (
                    <div className="mt-1 flex flex-col gap-2">
                      {!confirmingSubmission ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-center"
                          onClick={() => setConfirmingSubmission(true)}
                        >
                          {analysis.method === "email"
                            ? "I sent the email"
                            : "I submitted on the employer’s site"}
                        </Button>
                      ) : (
                        <div
                          role="group"
                          aria-label="Confirm application submission"
                          className="flex flex-col gap-2 rounded-app-sm border border-app-border bg-app-surface p-2.5"
                        >
                          <p className="text-[0.81rem] leading-relaxed text-app-soft">
                            Did you complete and submit the application with the employer?
                          </p>
                          <Button
                            type="button"
                            loading={updatingStatus}
                            onClick={() => void confirmSubmitted()}
                          >
                            Yes, mark as applied
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setConfirmingSubmission(false)}
                          >
                            Not yet
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {application.status === "APPLIED" ? (
                    <p className="mt-1 flex items-center gap-1.5 text-[0.8rem] text-app-success">
                      <CheckCircle2 size={16} /> Submission recorded in your applications.
                    </p>
                  ) : null}
                </aside>
              </div>
            </Panel>
          ) : (
            <EmptyState
              icon={<ScanSearch size={26} />}
              title="Not analysed yet"
              description="Analyse the employer's page to extract the form fields and screen questions."
              action={
                <Button
                  size="sm"
                  loading={analysing || startingGuide}
                  onClick={() => void startGuidedApplication()}
                >
                  Prepare my application
                </Button>
              }
            />
          )}
        </div>
      ) : null}

      {tab === "followup" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <Panel>
            <PanelHead
              eyebrow="Nudge"
              title="Schedule a follow-up"
              description="We will remind you. We never contact the employer without you."
            />
            <div className="flex flex-wrap items-end gap-3 border-t border-app-border px-5 py-5">
              <Field label="Due date" className="w-[190px]">
                <Input
                  type="date"
                  value={followupDate}
                  onChange={(event) => setFollowupDate(event.target.value)}
                />
              </Field>
              <Button
                icon={<CalendarClock size={15} />}
                loading={savingFollowup}
                onClick={() => void scheduleFollowup()}
              >
                Schedule
              </Button>
            </div>
          </Panel>

          <Panel as="aside" className="lg:sticky lg:top-[92px]">
            <PanelHead eyebrow="The record" title="Where it stands" />
            <Rows className="border-t border-app-border">
              <Row className="items-center justify-between gap-3">
                <span className="text-[0.82rem] text-app-muted">Status</span>
                <span className="text-[0.84rem] font-medium text-app-text">
                  {titleCase(application.status)}
                </span>
              </Row>
              <Row className="items-center justify-between gap-3">
                <span className="text-[0.82rem] text-app-muted">Last updated</span>
                <span className="text-[0.84rem] font-medium text-app-text">
                  {formatDateTime(application.updatedAt)}
                </span>
              </Row>
            </Rows>
            <div className="border-t border-app-border px-5 py-4">
              <Link href="/followups">
                <Button variant="outline" size="sm" className="w-full">
                  All follow-ups
                </Button>
              </Link>
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <Panel>
            <PanelHead
              eyebrow="Tailored for this role"
              title="Documents for this role"
              description="A CV and a cover letter generated from your profile and this posting. Everything is editable before you export it."
            />
            <div className="flex max-w-md flex-col gap-2 border-t border-app-border px-5 py-5">
              <Link href={`/documents?opportunityId=${application.opportunityId}`}>
                <Button variant="outline" className="w-full" icon={<FileText size={15} />}>
                  Open document editor
                </Button>
              </Link>
              <Link href="/documents">
                <Button variant="ghost" className="w-full">
                  All documents
                </Button>
              </Link>
            </div>
          </Panel>

          <Panel as="aside" className="lg:sticky lg:top-[92px]">
            <PanelHead eyebrow="The role" title={opportunity?.title ?? "This opportunity"} />
            <Rows className="border-t border-app-border">
              <Row className="items-center justify-between gap-3">
                <span className="text-[0.82rem] text-app-muted">Employer</span>
                <span className="text-[0.84rem] font-medium text-app-text">
                  {opportunity?.companyName ?? "—"}
                </span>
              </Row>
              <Row className="items-center justify-between gap-3">
                <span className="text-[0.82rem] text-app-muted">Role</span>
                <span className="truncate text-[0.84rem] font-medium text-app-text">
                  {opportunity?.title ?? "—"}
                </span>
              </Row>
            </Rows>
            <div className="border-t border-app-border px-5 py-4">
              <Link href={`/opportunities/${application.opportunityId}`}>
                <Button variant="outline" size="sm" className="w-full">
                  View the opportunity
                </Button>
              </Link>
            </div>
          </Panel>
        </div>
      ) : null}
    </Page>
  );
}

export default function ApplicationWorkspacePage() {
  const params = useParams<{ id: string }>();
  // The workspace is keyed by the application id: the App Router keeps this
  // route mounted when only the id changes, and without the key the analysis,
  // the guide progress and the tab of the previous application stayed on
  // screen under the new one's heading.
  return (
    <Suspense fallback={<Skeleton height={320} />}>
      <ApplicationWorkspaceInner key={params.id} />
    </Suspense>
  );
}
