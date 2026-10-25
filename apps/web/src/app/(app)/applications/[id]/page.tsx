"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
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
}

interface ApplicationsResponse {
  items: ApplicationItem[];
}

export default function ApplicationWorkspacePage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const [analysis, setAnalysis] = useState<ApplicationAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [followupDate, setFollowupDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 5);
    return date.toISOString().slice(0, 10);
  });

  const applications = useApi<ApplicationsResponse>("/applications");
  const application = applications.data?.items?.find((item) => item.id === params.id);
  const opportunities = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 100 });
  const opportunity = opportunities.data?.items?.find(
    (item) => item.id === application?.opportunityId,
  );

  const analyse = async () => {
    if (!application) return;
    setAnalysing(true);
    try {
      const response = await api.post<{ analysis: ApplicationAnalysis }>(
        `/applications/${application.id}/analyze`,
      );
      setAnalysis(response.analysis);
      setTab("apply");
      toast.push(`Analysed ${response.analysis.platform}`, "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Analysis failed",
        "danger",
      );
    } finally {
      setAnalysing(false);
    }
  };

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
            onClick={() => void analyse()}
          >
            Analyse page
          </Button>
          {opportunity?.applyUrl ? (
            <a
              href={opportunity.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Apply <ExternalLink size={13} />
            </a>
          ) : null}
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
        <Card style={{ padding: "1.2rem" }}>
          <SectionTitle
            eyebrow="Detected"
            title="Application form"
            description="Parsed live from the employer's posting page."
            action={
              <Button size="sm" variant="outline" loading={analysing} onClick={() => void analyse()}>
                Re-analyse
              </Button>
            }
          />
          {analysis ? (
            <div className="stack" style={{ marginTop: "1rem", gap: "1rem" }}>
              <div className="row row-wrap" style={{ gap: "0.4rem" }}>
                <Badge tone="accent">{titleCase(analysis.platform)}</Badge>
                <Badge tone="neutral">{titleCase(analysis.method)}</Badge>
                {analysis.emailRecipient ? (
                  <Badge tone="info">
                    <Mail size={11} /> {analysis.emailRecipient}
                  </Badge>
                ) : null}
              </div>

              {analysis.fields.length > 0 ? (
                <div className="table-scroll">
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
              ) : (
                <p style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
                  No structured form was detected. This employer likely uses a bespoke page.
                </p>
              )}

              {analysis.instructions.length > 0 ? (
                <div>
                  <div className="eyebrow" style={{ marginBottom: "0.4rem" }}>
                    Instructions
                  </div>
                  {analysis.instructions.map((instruction, index) => (
                    <p key={index} style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      {instruction}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={<Radar size={26} />}
              title="Not analysed yet"
              description="Analyse the employer's page to extract the form fields and screen questions."
              action={
                <Button size="sm" loading={analysing} onClick={() => void analyse()}>
                  Analyse now
                </Button>
              }
            />
          )}
        </Card>
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
