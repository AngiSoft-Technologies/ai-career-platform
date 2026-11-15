"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  FileText,
  MapPin,
  Radar,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MatchRing,
  Meter,
  SectionTitle,
  Skeleton,
  Tabs,
  cx,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import {
  eligibilityLabel,
  eligibilityTone,
  formatDate,
  formatSalary,
  relativeTime,
  titleCase,
} from "@/lib/format";
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

function OpportunityDetailInner() {
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
      <div className="flex flex-col gap-3">
        <Skeleton height={30} width={220} />
        <Skeleton height={150} />
        <Skeleton height={280} />
      </div>
    );
  }

  // A failed request is not a missing posting: the two were rendered
  // identically, so an expired session looked like a deleted role.
  if (error && !item) {
    return (
      <EmptyState
        icon={<ShieldCheck size={26} />}
        title="Could not load this role"
        description={error}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <Link href="/opportunities">
              <Button variant="ghost">Back to opportunities</Button>
            </Link>
          </div>
        }
      />
    );
  }

  if (!item) {
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
  const riskFlags = item.riskFlags ?? [];
  const flagged = item.riskAction && item.riskAction !== "publish";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => router.back()}>
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Radar size={14} />}
            loading={analysing}
            onClick={() => void analyse()}
          >
            Analyse application page
          </Button>
          <Button
            size="sm"
            icon={<Sparkles size={14} />}
            loading={generating}
            onClick={() => void startApplication()}
          >
            Start application
          </Button>
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-[260px] flex-1">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="accent">{titleCase(item.seniority)}</Badge>
              <Badge tone="info">{titleCase(item.workMode)}</Badge>
              <Badge tone="neutral">{titleCase(item.employmentType)}</Badge>
              {item.eligibility && item.eligibility !== "unknown" ? (
                <Badge tone={eligibilityTone(item.eligibility)}>
                  {eligibilityLabel(item.eligibility)}
                </Badge>
              ) : null}
              {flagged ? (
                <Badge tone="danger">
                  <TriangleAlert size={11} /> {titleCase(item.riskAction ?? "")} by risk engine
                </Badge>
              ) : (
                <Badge tone="success">
                  <ShieldCheck size={11} /> Risk checked
                </Badge>
              )}
            </div>

            <h1 className="mt-3 text-[clamp(1.5rem,3.6vw,2.2rem)] leading-[1.12] font-semibold tracking-[-0.02em] text-app-text">
              {item.title}
            </h1>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.86rem] text-app-muted">
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={14} /> {item.companyName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} /> {item.city ? `${item.city}, ` : ""}
                {item.country}
              </span>
              <span className="font-mono text-[0.8rem]">
                {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
              </span>
              <span>Posted {relativeTime(item.postedAt)}</span>
            </div>

            {item.skills?.length ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {item.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-[6px] bg-app-accent-soft px-2 py-0.5 text-[0.74rem] text-app-accent"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {match ? (
            <div className="flex min-w-[130px] flex-col items-center gap-2">
              <MatchRing score={match.score} size={92} />
              <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                match score
              </p>
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
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <Card className="p-4 sm:p-5">
            <SectionTitle eyebrow="Role description" title="What the employer asked for" />
            <div className="mt-4 text-[0.9rem] leading-[1.7] whitespace-pre-wrap text-app-soft">
              {item.description || "No description was provided by the source."}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <SectionTitle eyebrow="Eligibility" title="Can you hold this role" />
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={eligibilityTone(item.eligibility)}>
                    {eligibilityLabel(item.eligibility)}
                  </Badge>
                </div>
                <p className="text-[0.82rem] leading-relaxed text-app-muted">
                  Read from what the posting itself says about location and
                  work authorisation — not from the country it happens to
                  name. A role that says “open worldwide” is one you can
                  hold; one that names a country and a residency rule is
                  not.
                </p>
                {(item.eligibilityReasons ?? []).slice(0, 4).map((reason) => (
                  <p key={reason} className="text-[0.8rem] text-app-soft">
                    · {reason}
                  </p>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle eyebrow="Apply" title="How to apply" />
              <div className="mt-3 flex flex-col gap-2">
                <InfoRow label="Method" value={titleCase(item.applicationMethod)} />
                {/* Where the employer publishes. The catalogue reads a
                    hundred and thirty boards, and the answer to "where
                    does this company post" is on the posting itself. */}
                <InfoRow label="Posted on" value={item.sourceKind ?? titleCase(item.platform)} />
                <InfoRow
                  label="Expires"
                  value={item.expiresAt ? formatDate(item.expiresAt) : "Not stated"}
                />
                <div className="pt-1">
                  <Button
                    size="sm"
                    loading={generating}
                    onClick={() => void startApplication()}
                  >
                    {item.applicationMethod === "email"
                      ? "Prepare application email"
                      : "Start guided application"}
                  </Button>
                </div>
                <p className="text-[0.76rem] leading-relaxed text-app-muted">
                  MboQara never submits on your behalf. We prepare, you review, you submit.
                </p>
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle eyebrow="Company" title={item.companyName} />
              <div className="mt-3 flex flex-col gap-2">
                <InfoRow label="Website" value={item.companyWebsite ?? "Not provided"} />
                <Link href={`/companies/${item.companySlug}`} className="block pt-1">
                  <Button variant="ghost" size="sm" icon={<ArrowUpRight size={13} />} className="w-full">
                    Company intelligence
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "match" ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <SectionTitle eyebrow="Why this score" title="Match factors" />
            <div className="mt-4 flex flex-col gap-3">
              {match
                ? Object.entries(match.factors ?? {}).map(([key, value]) => (
                    <div key={key}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-[0.84rem] text-app-soft">{titleCase(key)}</span>
                        <span className="font-mono text-[0.8rem] tabular-nums text-app-muted">
                          {Math.round(value)}
                        </span>
                      </div>
                      <Meter value={Math.max(0, Math.min(100, value))} />
                    </div>
                  ))
                : null}
            </div>
            {match?.explanation ? (
              <p className="mt-4 text-[0.86rem] leading-relaxed text-app-muted">
                {match.explanation}
              </p>
            ) : null}
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle eyebrow="Gaps" title="What is missing" />
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(match?.gaps ?? []).length === 0 ? (
                <p className="text-[0.86rem] text-app-muted">
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
            <div className="mt-5">
              <Link href="/profile">
                <Button variant="outline" size="sm">
                  Update profile
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "apply" ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
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
            <div className="mt-4">
              {analysis ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="accent">{titleCase(analysis.platform)}</Badge>
                    <Badge tone="neutral">{titleCase(analysis.method)}</Badge>
                    <Badge tone="info">{analysis.fields.length} fields</Badge>
                    <Badge tone={analysis.requiresUserInput.length ? "warning" : "success"}>
                      {analysis.requiresUserInput.length} need you
                    </Badge>
                  </div>

                  {analysis.requiresUserInput.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                        Requires your input
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {analysis.requiresUserInput.map((entry) => (
                          <div
                            key={entry}
                            className="rounded-app-sm border border-app-border px-3 py-2 text-[0.84rem]"
                          >
                            <strong className="text-app-text">{entry}</strong>
                            <p className="mt-0.5 text-[0.78rem] text-app-muted">
                              Enter or confirm this value on the employer’s form.
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {analysis.questions.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                        Screening questions
                      </p>
                      <ul className="list-disc space-y-1.5 pl-5 text-[0.84rem] leading-relaxed text-app-soft">
                        {analysis.questions.map((question, index) => (
                          <li key={index}>
                            {question.question}
                            {question.required ? (
                              <Badge tone="danger" className="ml-1.5">
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
                      <p className="mb-1.5 text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                        Documents required
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.requiredDocuments.map((doc) => (
                          <Badge key={doc} tone="neutral">
                            {doc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-1.5">
                    {analysis.instructions.map((instruction, index) => (
                      <p key={index} className="text-[0.84rem] leading-relaxed text-app-muted">
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

          <Card className="p-4 sm:p-5">
            <SectionTitle eyebrow="Documents" title="Prepare your application" />
            <div className="mt-4 flex flex-col gap-2">
              <Link href={`/documents?opportunityId=${item.id}`}>
                <Button variant="outline" className="w-full" icon={<FileText size={15} />}>
                  Open document editor
                </Button>
              </Link>
              <Link href="/documents">
                <Button variant="ghost" className="w-full">
                  All documents
                </Button>
              </Link>
              <Button
                loading={generating}
                onClick={() => void startApplication()}
                className="w-full"
              >
                {item.applicationMethod === "email"
                  ? "Prepare application email"
                  : "Start guided application"}
              </Button>
            </div>
            <div className="mt-5 rounded-app-md border border-app-success/30 bg-app-success/10 p-3.5">
              <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-success uppercase">
                Your control
              </p>
              <p className="mt-1 text-[0.83rem] leading-relaxed text-app-soft">
                Every answer is suggested from your own profile. Nothing is invented, and nothing is
                sent until you approve it.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "risk" ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle
            eyebrow="Trust signals"
            title="How we scored this posting"
            description="Every listing is checked before publication. This is the reasoning behind the decision."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatBlock label="Risk score" value={String(Math.round(item.riskScore ?? 0))} />
            <StatBlock label="Decision" value={titleCase(item.riskAction ?? "publish")} />
            <StatBlock label="Flags" value={String(riskFlags.length)} />
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            {riskFlags.length === 0 ? (
              <p className="text-[0.88rem] text-app-muted">
                No risk signals fired. The listing passed every check.
              </p>
            ) : (
              riskFlags.map((flag, index) => (
                <div
                  key={index}
                  className={cx(
                    "rounded-app-sm border border-app-warning/30 bg-app-warning/10 px-3 py-2",
                    "text-[0.85rem] text-app-soft",
                  )}
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

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  // Keyed by id: the App Router keeps this route mounted when only the id
  // changes, and without the key the analysis, the tracked application and
  // the tab of the previous role stayed on screen under the new one.
  return <OpportunityDetailInner key={params.id} />;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[0.8rem] text-app-muted">{label}</span>
      <span className="max-w-[65%] text-right text-[0.84rem] font-semibold break-words text-app-text">
        {value}
      </span>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-app-md border border-app-border px-4 py-3.5">
      <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-[1.5rem] leading-none font-bold tabular-nums text-app-text">{value}</p>
    </div>
  );
}
