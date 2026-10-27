"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Mail,
  Radar,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Skeleton,
  Tabs,
  useToast,
} from "@/components/ui";
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
    if (!(["https:", "http:"].includes(url.protocol)) || !url.hostname) return null;
    if (typeof window !== "undefined" && url.origin === window.location.origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function ApplicationWorkspacePage() {
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
  const application = applicationOverride ?? applications.data?.items?.find((item) => item.id === params.id);
  const opportunities = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 100 });
  const opportunity = opportunities.data?.items?.find(
    (item) => item.id === application?.opportunityId,
  );
  const employerUrl = analysis ? safeEmployerUrl(analysis.analysisUrl) : null;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`jr.application-guide:${params.id}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        if ("checks" in parsed && parsed.checks && typeof parsed.checks === "object") {
          setGuideChecks(parsed.checks as Record<string, boolean>);
          setQuestionAnswers(parsed.questionAnswers && typeof parsed.questionAnswers === "object" ? parsed.questionAnswers as Record<string, string> : {});
          setEmailSubject(typeof parsed.emailSubject === "string" ? parsed.emailSubject : "");
          setEmailBody(typeof parsed.emailBody === "string" ? parsed.emailBody : "");
        } else {
          setGuideChecks(Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")));
        }
      }
    } catch {
      setGuideChecks({});
    }
    setProgressLoaded(true);
  }, [params.id]);

  useEffect(() => {
    if (progressLoaded) {
      window.localStorage.setItem(`jr.application-guide:${params.id}`, JSON.stringify({ checks: guideChecks, questionAnswers, emailSubject, emailBody }));
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
      setQuestionAnswers((current) => Object.keys(current).length ? current : Object.fromEntries(response.analysis.questions.map((item) => [item.question, item.answer ?? ""])));
      setEmailSubject((current) => current || response.analysis.emailSubject || `Application for ${opportunity?.title ?? "this role"}`);
      setEmailBody((current) => current || response.analysis.emailBody || `Hello,\n\nI am applying for the ${opportunity?.title ?? "role"} position${opportunity?.companyName ? ` at ${opportunity.companyName}` : ""}. I have attached my application documents for your review.\n\nKind regards`);
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
      toast.push(caught instanceof Error ? caught.message : "Could not update application progress", "danger");
      return null;
    } finally {
      setUpdatingStatus(false);
    }
  };

  const startGuidedApplication = async () => {
    if (!application) return;
    setStartingGuide(true);
    try {
      const result = analysis ?? await analyse();
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

  return (
    <div className="stack" style={{ gap: "1.1rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: "0.6rem" }}>
          <Link href="/applications">
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />}>
              Back
            </Button>
          </Link>
          <div>
            <div className="eyebrow">Application workspace</div>
            <h1 className="display" style={{ fontSize: "clamp(1.3rem, 3vw, 1.9rem)" }}>
              {opportunity?.title ?? "Application"}
            </h1>
          </div>
        </div>
        <div className="row row-wrap" style={{ gap: "0.4rem" }}>
          <Badge tone="accent">{titleCase(application.status)}</Badge>
          <Button
            variant="outline"
            size="sm"
            icon={<Radar size={14} />}
            loading={analysing}
            onClick={() => void startGuidedApplication()}
          >
            {analysis ? "Continue application" : "Start guided application"}
          </Button>
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
        <div className="grid-2">
          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle eyebrow="Record" title="Application details" />
            <div className="stack" style={{ marginTop: "0.9rem", gap: "0.6rem" }}>
              <Detail label="Status" value={titleCase(application.status)} />
              <Detail label="Created" value={formatDateTime(application.createdAt)} />
              <Detail label="Last updated" value={formatDateTime(application.updatedAt)} />
              <Detail label="Version" value={String(application.version)} />
              <Detail label="Employer" value={opportunity?.companyName ?? "—"} />
              <Detail label="Role" value={opportunity?.title ?? "—"} />
            </div>
          </Card>
          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle eyebrow="Promise" title="How this works" />
            <ul style={{ paddingLeft: "1.1rem", marginTop: "0.9rem", lineHeight: 1.9, fontSize: "0.88rem" }}>
              <li>Job Radar prepares the documents and the field answers.</li>
              <li>You review every suggestion and correct anything.</li>
              <li>You approve, then submit on the employer&apos;s own page.</li>
              <li>We track the outcome and remind you to follow up.</li>
            </ul>
            <div
              style={{
                marginTop: "1rem",
                padding: "0.8rem",
                borderRadius: "var(--radius-md)",
                background: "var(--success-soft)",
                fontSize: "0.83rem",
              }}
            >
              <ShieldCheck size={14} style={{ verticalAlign: "-2px" }} /> No application is ever sent
              without your explicit action.
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "apply" ? (
        <div className="application-guide">
          <Card className="application-guide__intro" style={{ padding: "1.2rem" }}>
            <div className="application-guide__intro-copy">
              <div className="eyebrow">Your application, step by step</div>
              <h2>{application.status === "APPLIED" ? "Submission recorded" : opportunity?.applicationMethod === "email" ? "Prepare and send your email" : "Complete the employer’s application"}</h2>
              <p>{application.status === "APPLIED" ? `You marked this application as submitted${application.appliedAt ? ` on ${formatDateTime(application.appliedAt)}` : ""}.` : opportunity?.applicationMethod === "email" ? "We’ll prepare the details and documents. You review everything, then send it from your email app." : "Keep these instructions beside the employer’s form. Job Radar will never submit the form for you."}</p>
            </div>
            <div className="application-guide__progress" aria-label={`Application status: ${titleCase(application.status)}`}>
              <CheckCircle2 size={18} />
              <span>{titleCase(application.status)}</span>
            </div>
          </Card>

          {analysis ? (
            <>
              <Card style={{ padding: "1.2rem" }}>
          <SectionTitle
            eyebrow="Employer instructions"
            title={analysis.method === "email" ? "Email application" : `${titleCase(analysis.platform)} application`}
            description={analysis.rawTitle ? `Instructions prepared from ${analysis.rawTitle}.` : "Review the requirements, prepare your materials, and follow the employer’s steps."}
            action={
              <Button size="sm" variant="outline" loading={analysing} onClick={() => void analyse()}>
                Re-analyse
              </Button>
            }
          />
            <div className="application-guide__layout">
              <div className="stack" style={{ gap: "1rem" }}>
              <div className="row row-wrap" style={{ gap: "0.4rem" }}>
                <Badge tone="accent">{titleCase(analysis.platform)}</Badge>
                <Badge tone="neutral">{titleCase(analysis.method)}</Badge>
                {analysis.emailRecipient ? (
                  <Badge tone="info">
                    <Mail size={11} /> {analysis.emailRecipient}
                  </Badge>
                ) : null}
              </div>

              {analysis.method === "email" ? (
                <section className="application-guide__email" aria-labelledby="email-draft-heading">
                  <h3 id="email-draft-heading">Review your email</h3>
                  <label className="field">
                    <span className="label">To</span>
                    <div className="application-guide__copy-row">
                      <input className="input" readOnly value={analysis.emailRecipient ?? "Recipient not found — check the employer instructions"} aria-label="Email recipient" />
                      {analysis.emailRecipient ? <Button type="button" size="sm" variant="outline" icon={<Clipboard size={14} />} onClick={() => void copyEmail(analysis.emailRecipient!, "Recipient")}>Copy</Button> : null}
                    </div>
                  </label>
                  <label className="field">
                    <span className="label">Subject</span>
                    <input className="input" value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} />
                  </label>
                  <label className="field">
                    <span className="label">Message</span>
                    <textarea className="input" rows={8} value={emailBody} onChange={(event) => setEmailBody(event.target.value)} />
                  </label>
                  <div className="application-guide__attachments">
                    <strong>Before sending, attach your documents</strong>
                    <p>{analysis.requiredDocuments.map(titleCase).join(" and ") || "CV and cover letter"} are expected. Generate or review them in your document editor.</p>
                    <Link href={`/documents?opportunityId=${application.opportunityId}`} className="btn btn-outline btn-sm"><FileText size={14} /> Open my documents</Link>
                  </div>
                  {analysis.emailRecipient ? (
                    <a className="btn btn-primary" href={`mailto:${encodeURIComponent(analysis.emailRecipient)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}>
                      Open email app <Mail size={14} />
                    </a>
                  ) : null}
                </section>
              ) : (
                <section className="application-guide__employer" aria-label="Employer application page">
                  <div className="application-guide__employer-heading">
                    <div>
                      <h3>Employer’s application page</h3>
                      <p>Complete each form step there. Return here whenever you need your checklist or prepared documents.</p>
                    </div>
                    <div className="row row-wrap">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEmployerPageOpen((open) => !open)}>
                        {employerPageOpen ? "Hide employer page" : "Open inside Job Radar"}
                      </Button>
                      {employerUrl ? <a className="btn btn-ghost btn-sm" href={employerUrl} target="_blank" rel="noopener noreferrer">New tab <ExternalLink size={13} /></a> : null}
                    </div>
                  </div>
                  {employerPageOpen && employerUrl ? (
                    <iframe
                      className="application-guide__frame"
                      title={`Employer application for ${opportunity?.title ?? "this role"}`}
                      src={employerUrl}
                      referrerPolicy="no-referrer"
                      sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
                    />
                  ) : (
                    <div className="application-guide__frame-placeholder">
                      <ExternalLink size={22} />
                      <p>{employerUrl ? "Open the employer’s site here to follow its application steps." : "This link cannot be embedded safely. Use the employer’s website address from the job listing."}</p>
                    </div>
                  )}
                  <p className="application-guide__embed-note">Some employers block embedded pages. If the page stays blank, use “New tab”; this checklist will remain open here.</p>
                </section>
              )}

              {analysis.questions.length > 0 ? (
                <section className="application-guide__questions" aria-labelledby="application-questions-heading">
                  <h3 id="application-questions-heading">Questions to prepare</h3>
                  <p>These were found in the employer’s page. Draft and review your answers before entering them there.</p>
                  {analysis.questions.map((item) => (
                    <label className="field" key={item.question}>
                      <span className="label">{item.question}</span>
                      <textarea className="input" rows={4} value={questionAnswers[item.question] ?? ""} onChange={(event) => setQuestionAnswers((current) => ({ ...current, [item.question]: event.target.value }))} placeholder="Write a truthful answer in your own words" />
                    </label>
                  ))}
                </section>
              ) : null}

              {analysis.fields.length > 0 ? (
                <details className="application-guide__details">
                  <summary>Detected fields and profile suggestions ({analysis.fields.length})</summary>
                <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Type</th>
                        <th>Required</th>
                        <th>Suggested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.fields.map((field) => (
                        <tr key={field.key}>
                          <td>
                            <strong>{field.label}</strong>
                          </td>
                          <td className="mono">{field.type}</td>
                          <td>{field.required ? "Yes" : "No"}</td>
                          <td style={{ maxWidth: 280 }}>
                            {field.suggestedValue ? (
                              <span style={{ fontSize: "0.8rem" }}>{field.suggestedValue}</span>
                            ) : (
                              <Badge tone="warning">you provide</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </details>
              ) : (
                <p style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
                  No structured form was detected. This employer likely uses a bespoke page.
                </p>
              )}

              {analysis.instructions.length > 0 ? (
                <div className="application-guide__instructions">
                  <h3>What the employer asks you to do</h3>
                  {analysis.instructions.map((instruction, index) => (
                    <label key={index} className="application-guide__check">
                      <input type="checkbox" checked={Boolean(guideChecks[`instruction-${index}`])} onChange={(event) => setGuideCheck(`instruction-${index}`, event.target.checked)} />
                      <span>{instruction}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              </div>

              <aside className="application-guide__rail" aria-label="Application checklist">
                <h3>Before you submit</h3>
                <p>Use these checks as you move through the employer’s process.</p>
                {[
                  ["details", "I checked the role and employer details"],
                  ["documents", `I prepared ${analysis.requiredDocuments.map(titleCase).join(" and ") || "the requested documents"}`],
                  ["answers", "I reviewed my answers and corrected anything that was wrong"],
                  ["final", analysis.method === "email" ? "I checked the recipient and attachments before sending" : "I reviewed the completed form on the employer’s page"],
                ].map(([key, label]) => (
                  <label key={key} className="application-guide__check">
                    <input type="checkbox" checked={Boolean(guideChecks[key])} onChange={(event) => setGuideCheck(key, event.target.checked)} />
                    <span>{label}</span>
                  </label>
                ))}
                <Button type="button" className="application-guide__ready" loading={updatingStatus} disabled={application.status !== "APPLICATION_PREPARATION" || !["details", "documents", "answers", "final"].every((key) => guideChecks[key])} onClick={() => void markReadyToApply()}>
                  {application.status === "READY_TO_APPLY" ? "Ready to continue" : "I’m ready to submit"}
                </Button>
                {application.status === "READY_TO_APPLY" ? (
                  <div className="application-guide__confirm">
                    {!confirmingSubmission ? (
                      <Button type="button" variant="outline" onClick={() => setConfirmingSubmission(true)}>{analysis.method === "email" ? "I sent the email" : "I submitted on the employer’s site"}</Button>
                    ) : (
                      <div role="group" aria-label="Confirm application submission">
                        <p>Did you complete and submit the application with the employer?</p>
                        <Button type="button" loading={updatingStatus} onClick={() => void confirmSubmitted()}>Yes, mark as applied</Button>
                        <Button type="button" variant="ghost" onClick={() => setConfirmingSubmission(false)}>Not yet</Button>
                      </div>
                    )}
                  </div>
                ) : null}
                {application.status === "APPLIED" ? <p className="application-guide__submitted"><CheckCircle2 size={16} /> Submission recorded in your applications.</p> : null}
              </aside>
            </div>
              </Card>
            </>
          ) : (
            <Card style={{ padding: "1.2rem" }}>
            <EmptyState
              icon={<Radar size={26} />}
              title="Not analysed yet"
              description="Analyse the employer's page to extract the form fields and screen questions."
              action={
                <Button size="sm" loading={analysing || startingGuide} onClick={() => void startGuidedApplication()}>
                  Prepare my application
                </Button>
              }
            />
            </Card>
          )}
        </div>
      ) : null}

      {tab === "followup" ? (
        <Card style={{ padding: "1.2rem" }}>
          <SectionTitle
            eyebrow="Nudge"
            title="Schedule a follow-up"
            description="We will remind you. We never contact the employer without you."
          />
          <div className="row row-wrap" style={{ gap: "0.6rem", marginTop: "1rem", alignItems: "flex-end" }}>
            <label className="field">
              <span className="label">Due date</span>
              <input
                type="date"
                className="input"
                value={followupDate}
                onChange={(event) => setFollowupDate(event.target.value)}
              />
            </label>
            <Button
              icon={<CalendarClock size={15} />}
              loading={savingFollowup}
              onClick={() => void scheduleFollowup()}
            >
              Schedule
            </Button>
          </div>
        </Card>
      ) : null}

      {tab === "documents" ? (
        <Card style={{ padding: "1.2rem" }}>
          <SectionTitle eyebrow="Kit" title="Documents for this role" />
          <div className="stack" style={{ marginTop: "0.9rem", gap: "0.5rem" }}>
            <Link
              href={`/documents?opportunityId=${application.opportunityId}`}
              className="btn btn-outline"
              style={{ width: "100%" }}
            >
              <FileText size={15} /> Open document editor
            </Link>
            <Link href={`/opportunities/${application.opportunityId}`}>
              <Button variant="ghost" style={{ width: "100%" }}>
                View the opportunity
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: "1rem" }}>
      <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: "0.86rem", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
