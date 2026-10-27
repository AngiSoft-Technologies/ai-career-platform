"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  FileText,
  MapPin,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MatchRing,
  SectionTitle,
  Skeleton,
  Tabs,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDate, formatSalary, relativeTime, titleCase } from "@/lib/format";
import type { ApplicationAnalysis, Opportunity } from "@/lib/types";

interface OpportunityDetail extends Omit<Opportunity, "match"> {
  match?: {
    opportunityId?: string;
    score: number;
    factors: Record<string, number>;
    explanation: string;
    gaps: string[];
  };
  riskFlags?: string[];
  riskAction?: string | null;
}

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const [analysing, setAnalysing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<ApplicationAnalysis | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  const { data, loading, error } = useApi<OpportunityDetail>(`/opportunities/${params.id}`);
  const matches = useApi<{ match: OpportunityDetail["match"] }>(
    params.id ? `/matches/${params.id}` : null,
    undefined,
  );

  const item = data;

  const startApplication = async () => {
    if (!item) return;
    setGenerating(true);
    try {
      const response = await api.post<{ application: { id: string } }>("/applications", {
        opportunityId: item.id,
      });
      setApplicationId(response.application.id);
      toast.push("Opening your guided application", "success");
      router.push(`/applications/${response.application.id}?guided=1`);
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not create the application",
        "danger",
      );
    } finally {
      setGenerating(false);
    }
  };

  const analyse = async () => {
    if (!item) return;
    let id = applicationId;
    if (!id) {
      const response = await api.post<{ application: { id: string } }>("/applications", {
        opportunityId: item.id,
      });
      id = response.application.id;
      setApplicationId(id);
    }
    setAnalysing(true);
    try {
      const response = await api.post<{ analysis: ApplicationAnalysis }>(
        `/applications/${id}/analyze`,
      );
      setAnalysis(response.analysis);
      toast.push(
        `Detected ${response.analysis.platform}. ${response.analysis.fields.length} fields found.`,
        "accent",
      );
      setTab("apply");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Analysis failed",
        "danger",
      );
    } finally {
      setAnalysing(false);
    }
  };

  if (loading && !item) {
    return (
      <div className="stack">
        <Skeleton height={30} width={220} />
        <Skeleton height={150} />
        <Skeleton height={280} />
      </div>
    );
  }

  if (error || !item) {
    return (
      <EmptyState
        title="Opportunity not found"
        description="It may have expired or been hidden by moderation."
        action={
          <Link href="/opportunities">
            <Button variant="outline">Back to opportunities</Button>
          </Link>
        }
      />
    );
  }

  const match = matches.data?.match ?? item.match;

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between" }}>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => router.back()}>
          Back
        </Button>
        <div className="row" style={{ gap: "0.5rem" }}>
          <Button
            variant="outline"
            size="sm"
            icon={<Radar size={14} />}
            loading={analysing}
            onClick={() => void analyse()}
          >
            Analyse application page
          </Button>
          <Button size="sm" icon={<Sparkles size={14} />} loading={generating} onClick={() => void startApplication()}>
            Start application
          </Button>
        </div>
      </div>

      <Card style={{ padding: "1.3rem" }}>
        <div className="row row-wrap" style={{ gap: "1.2rem", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="row row-wrap" style={{ gap: "0.4rem", marginBottom: 8 }}>
              <Badge tone="accent">{titleCase(item.seniority)}</Badge>
              <Badge tone="info">{titleCase(item.workMode)}</Badge>
              <Badge tone="neutral">{titleCase(item.employmentType)}</Badge>
              {item.riskAction && item.riskAction !== "publish" ? (
                <Badge tone="danger">{titleCase(item.riskAction)} by risk engine</Badge>
              ) : (
                <Badge tone="success">
                  <ShieldCheck size={11} /> Risk checked
                </Badge>
              )}
            </div>
            <h1 className="display" style={{ fontSize: "clamp(1.5rem, 3.6vw, 2.2rem)" }}>
              {item.title}
            </h1>
            <div
              className="row row-wrap"
              style={{ gap: "0.9rem", marginTop: 8, fontSize: "0.88rem", color: "var(--text-muted)" }}
            >
              <span className="row" style={{ gap: "0.35rem" }}>
                <Building2 size={14} /> {item.companyName}
              </span>
              <span className="row" style={{ gap: "0.35rem" }}>
                <MapPin size={14} /> {item.city ? `${item.city}, ` : ""}
                {item.country}
              </span>
              <span className="mono">{formatSalary(item.salaryMin, item.salaryMax, item.currency)}</span>
              <span>Posted {relativeTime(item.postedAt)}</span>
            </div>
            {item.skills?.length ? (
              <div className="row row-wrap" style={{ gap: "0.3rem", marginTop: 10 }}>
                {item.skills.map((skill) => (
                  <span
                    key={skill}
                    style={{
                      fontSize: "0.74rem",
                      padding: "0.16rem 0.5rem",
                      borderRadius: 6,
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {match ? (
            <div style={{ textAlign: "center", minWidth: 130 }}>
              <MatchRing score={match.score} size={92} />
              <div className="eyebrow" style={{ marginTop: 6 }}>
                match score
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Tabs
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "match", label: "Match analysis" },
          { key: "apply", label: "Application" },
          { key: "risk", label: "Trust & risk" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" ? (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)" }}>
          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle eyebrow="Role description" title="What the employer asked for" />
            <div
              style={{
                marginTop: "0.9rem",
                fontSize: "0.9rem",
                lineHeight: 1.7,
                color: "var(--text-soft)",
                whiteSpace: "pre-wrap",
              }}
            >
              {item.description || "No description was provided by the source."}
            </div>
          </Card>

          <div className="stack">
            <Card style={{ padding: "1.2rem" }}>
              <SectionTitle eyebrow="Apply" title="How to apply" />
              <div className="stack" style={{ marginTop: "0.9rem", gap: "0.5rem" }}>
                <InfoRow label="Method" value={titleCase(item.applicationMethod)} />
                <InfoRow label="Platform" value={titleCase(item.platform)} />
                <InfoRow label="Expires" value={item.expiresAt ? formatDate(item.expiresAt) : "Not stated"} />
                <Button
                  size="sm"
                  loading={generating}
                  onClick={() => void startApplication()}
                  style={{ marginTop: "0.3rem" }}
                >
                  {item.applicationMethod === "email" ? "Prepare application email" : "Start guided application"}
                </Button>
                <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                  Job Radar never submits on your behalf. We prepare, you review, you submit.
                </p>
              </div>
            </Card>

            <Card style={{ padding: "1.2rem" }}>
              <SectionTitle eyebrow="Company" title={item.companyName} />
              <div className="stack" style={{ marginTop: "0.8rem", gap: "0.5rem" }}>
                <InfoRow label="Industry" value={item.companyName ? "—" : "—"} />
                <InfoRow label="Website" value={item.companyWebsite ?? "Not provided"} />
                <Link href={`/companies?slug=${item.companySlug}`} className="btn btn-ghost btn-sm">
                  Company intelligence
                </Link>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "match" ? (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle eyebrow="Why this score" title="Match factors" />
            <div className="stack" style={{ marginTop: "0.9rem", gap: "0.6rem" }}>
              {match
                ? Object.entries(match.factors ?? {}).map(([key, value]) => (
                    <div key={key}>
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: "0.84rem" }}>{titleCase(key)}</span>
                        <span className="mono" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {Math.round(value)}
                        </span>
                      </div>
                      <div className="meter">
                        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                      </div>
                    </div>
                  ))
                : null}
            </div>
            {match?.explanation ? (
              <p style={{ marginTop: "1rem", fontSize: "0.86rem", color: "var(--text-muted)" }}>
                {match.explanation}
              </p>
            ) : null}
          </Card>

          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle eyebrow="Gaps" title="What is missing" />
            <div className="stack" style={{ marginTop: "0.9rem", gap: "0.4rem" }}>
              {(match?.gaps ?? []).length === 0 ? (
                <p style={{ fontSize: "0.86rem", color: "var(--text-muted)" }}>
                  Nothing significant is missing from your profile.
                </p>
              ) : (
                (match?.gaps ?? []).map((gap) => (
                  <Badge key={gap} tone="warning">
                    {gap}
                  </Badge>
                ))
              )}
            </div>
            <Link href="/profile" className="btn btn-primary btn-sm" style={{ marginTop: "1.2rem" }}>
              Update profile
            </Link>
          </Card>
        </div>
      ) : null}

      {tab === "apply" ? (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle
              eyebrow="Workspace"
              title="Application assistant"
              description="We detect the employer's form, map your profile to every field, and flag anything you must supply yourself."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Radar size={14} />}
                  loading={analysing}
                  onClick={() => void analyse()}
                >
                  Analyse
                </Button>
              }
            />
            <div style={{ marginTop: "1rem" }}>
              {analysis ? (
                <div className="stack" style={{ gap: "0.9rem" }}>
                  <div className="row row-wrap" style={{ gap: "0.4rem" }}>
                    <Badge tone="accent">{titleCase(analysis.platform)}</Badge>
                    <Badge tone="neutral">{titleCase(analysis.method)}</Badge>
                    <Badge tone="info">{analysis.fields.length} fields</Badge>
                    <Badge tone={analysis.requiresUserInput.length ? "warning" : "success"}>
                      {analysis.requiresUserInput.length} need you
                    </Badge>
                  </div>

                  {analysis.requiresUserInput.length > 0 ? (
                    <div>
                      <div className="eyebrow" style={{ marginBottom: "0.4rem" }}>
                        Requires your input
                      </div>
                      <div className="stack" style={{ gap: "0.35rem" }}>
                        {analysis.requiresUserInput.map((item) => (
                          <div
                            key={item}
                            style={{
                              padding: "0.55rem 0.7rem",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "0.84rem",
                            }}
                          >
                            <strong>{item}</strong>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                              Enter or confirm this value on the employer’s form.
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {analysis.questions.length > 0 ? (
                    <div>
                      <div className="eyebrow" style={{ marginBottom: "0.4rem" }}>
                        Screening questions
                      </div>
                      <ul style={{ paddingLeft: "1.1rem", fontSize: "0.84rem", lineHeight: 1.7 }}>
                        {analysis.questions.map((question, index) => (
                          <li key={index}>
                            {question.question}
                            {question.required ? (
                              <Badge tone="danger" className="badge" >
                                required
                              </Badge>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {analysis.requiredDocuments.length > 0 ? (
                    <div>
                      <div className="eyebrow" style={{ marginBottom: "0.4rem" }}>
                        Documents required
                      </div>
                      <div className="row row-wrap" style={{ gap: "0.35rem" }}>
                        {analysis.requiredDocuments.map((doc) => (
                          <Badge key={doc} tone="neutral">
                            {doc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="stack" style={{ gap: "0.3rem" }}>
                    {analysis.instructions.map((instruction, index) => (
                      <p key={index} style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                        {instruction}
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<Radar size={26} />}
                  title="Not analysed yet"
                  description="Run the analyser to detect the employer's application platform, fields and screening questions."
                />
              )}
            </div>
          </Card>

          <Card style={{ padding: "1.2rem" }}>
            <SectionTitle eyebrow="Documents" title="Prepare your application" />
            <div className="stack" style={{ marginTop: "0.9rem", gap: "0.5rem" }}>
              <Link href={`/documents?opportunityId=${item.id}`}>
                <Button variant="outline" style={{ width: "100%" }} icon={<FileText size={15} />}>
                  Open document editor
                </Button>
              </Link>
              <Link href="/documents">
                <Button variant="ghost" style={{ width: "100%" }}>
                  All documents
                </Button>
              </Link>
              <Button
                loading={generating}
                onClick={() => void startApplication()}
                style={{ width: "100%" }}
              >
                {item.applicationMethod === "email" ? "Prepare application email" : "Start guided application"}
              </Button>
            </div>
            <div
              style={{
                marginTop: "1.2rem",
                padding: "0.8rem",
                borderRadius: "var(--radius-md)",
                background: "var(--success-soft)",
                border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
              }}
            >
              <div className="eyebrow" style={{ color: "var(--success)" }}>
                Your control
              </div>
              <p style={{ fontSize: "0.83rem", marginTop: 4 }}>
                Every answer is suggested from your own profile. Nothing is invented, and nothing is
                sent until you approve it.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "risk" ? (
        <Card style={{ padding: "1.2rem" }}>
          <SectionTitle
            eyebrow="Trust signals"
            title="How we scored this posting"
            description="Every listing is checked before publication. This is the reasoning behind the decision."
          />
          <div className="grid-3" style={{ marginTop: "1rem" }}>
            <StatBlock label="Risk score" value={String(Math.round(item.riskScore ?? 0))} />
            <StatBlock label="Decision" value={titleCase(item.riskAction ?? "publish")} />
            <StatBlock label="Flags" value={String(item.riskFlags?.length ?? 0)} />
          </div>
          <div className="stack" style={{ marginTop: "1rem", gap: "0.4rem" }}>
            {(item.riskFlags ?? []).length === 0 ? (
              <p style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
                No risk signals fired. The listing passed every check.
              </p>
            ) : (
              (item.riskFlags ?? []).map((flag, index) => (
                <div
                  key={index}
                  style={{
                    padding: "0.55rem 0.7rem",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--warning-soft)",
                    border: "1px solid color-mix(in srgb, var(--warning) 28%, transparent)",
                    fontSize: "0.85rem",
                  }}
                >
                  {flag}
                </div>
              ))
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: "0.8rem" }}>
      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: "0.84rem", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "0.9rem 1rem",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div className="eyebrow">{label}</div>
      <div className="display" style={{ fontSize: "1.5rem", marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}
