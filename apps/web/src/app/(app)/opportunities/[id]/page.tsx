"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Meta,
  Meter,
  Page,
  Panel,
  PanelHead,
  Skeleton,
  Tabs,
  useToast,
} from "@/components/ui";
import { CompanyMark, HeroSplit } from "@/components/app-art";
import { JobDescription } from "@/components/job-description";
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
      <Page>
        <Skeleton height={30} width={220} />
        <Skeleton height={180} />
        <Skeleton height={320} />
      </Page>
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
  const score = Math.round(match?.score ?? 0);

  return (
    <Page>
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 font-mono text-[0.66rem] tracking-[0.14em] text-app-muted uppercase transition-colors hover:text-app-soft"
        >
          <ArrowLeft size={13} />
          Back
        </button>
      </div>

      {/* The role's identity is the page, so it is set as a masthead rather
          than as a card that happens to contain a title. */}
      <HeroSplit
        src="https://cdn.angisoft.co.ke/public/images/mboqara/careers/technology-professional.webp"
        alt="A professional at work"
        priority
        eyebrow={`${item.companyName} · ${item.city ? `${item.city}, ` : ""}${item.country} · ${relativeTime(item.postedAt)}`}
        title={item.title}
        description={item.skills?.length ? item.skills.slice(0, 10).join(" · ") : undefined}
        actions={
          <>
            <Button loading={generating} onClick={() => void startApplication()}>
              {item.applicationMethod === "email"
                ? "Prepare application email"
                : "Start application"}
            </Button>
            <Button
              variant="outline"
              icon={<ScanSearch size={14} />}
              loading={analysing}
              onClick={() => void analyse()}
            >
              Analyse employer form
            </Button>
          </>
        }
        stats={
          <>
            <div>
              <dt className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                Match
              </dt>
              <dd className="mt-1 flex items-baseline gap-1 font-display text-[2.1rem] leading-none font-semibold tracking-[-0.03em] tabular-nums text-app-text">
                {score}
                <span className="font-mono text-[0.66rem] font-normal tracking-normal text-app-muted">
                  /100
                </span>
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                Seniority
              </dt>
              <dd className="mt-1 text-[0.92rem] font-medium text-app-text">
                {titleCase(item.seniority)}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                Mode
              </dt>
              <dd className="mt-1 text-[0.92rem] font-medium text-app-text">
                {titleCase(item.workMode)}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                Salary
              </dt>
              <dd className="mt-1 text-[0.92rem] font-medium text-app-text">
                {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
              </dd>
            </div>
          </>
        }
        badge={
          flagged ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="danger" dot>
                {titleCase(item.riskAction ?? "")} by risk engine
              </Badge>
            </div>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { key: "overview", label: "The role" },
          { key: "match", label: "Your fit" },
          { key: "apply", label: "Application" },
          { key: "risk", label: "Trust" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" ? (
        <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <article className="min-w-0">
            <JobDescription
              text={item.description || "No description was provided by the source."}
            />
          </article>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
            <Panel>
              <PanelHead eyebrow="The facts" title="At a glance" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-app-border px-5 py-4">
                <Meta label="Salary" value={formatSalary(item.salaryMin, item.salaryMax, item.currency)} />
                <Meta label="Location" value={item.city ? `${item.city}, ${item.country}` : item.country} />
                <Meta label="Mode" value={titleCase(item.workMode)} />
                <Meta label="Method" value={titleCase(item.applicationMethod)} />
                <Meta label="Posted on" value={item.sourceKind ?? titleCase(item.platform)} />
                <Meta
                  label="Expires"
                  value={item.expiresAt ? formatDate(item.expiresAt) : "Not stated"}
                />
              </dl>
            </Panel>

            <Panel>
              <PanelHead eyebrow="Can you hold it" title="Eligibility" />
              <div className="border-t border-app-border px-5 py-4">
                <Badge tone={eligibilityTone(item.eligibility)}>
                  {eligibilityLabel(item.eligibility)}
                </Badge>
                <p className="mt-2 text-[0.8rem] leading-relaxed text-app-muted">
                  Read from what the posting itself says about location and work authorisation — not
                  from the country it happens to name.
                </p>
                {(item.eligibilityReasons ?? []).slice(0, 4).map((reason) => (
                  <p key={reason} className="mt-1.5 text-[0.78rem] leading-relaxed text-app-soft">
                    · {reason}
                  </p>
                ))}
              </div>
            </Panel>

            <Panel>
              <PanelHead eyebrow="Company" title={item.companyName} />
              <div className="border-t border-app-border px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <CompanyMark name={item.companyName} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-[0.86rem] font-medium text-app-text">
                      {item.companyName}
                    </p>
                    <p className="truncate text-[0.72rem] text-app-muted">
                      {item.companyWebsite ?? "No website listed"}
                    </p>
                  </div>
                </div>
                <Link href={`/companies/${item.companySlug}`} className="mt-3 block">
                  <Button variant="ghost" size="sm" icon={<ArrowUpRight size={13} />} className="w-full">
                    Company intelligence
                  </Button>
                </Link>
              </div>
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "match" ? (
        <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="min-w-0">
            <h2 className="text-[1.15rem] leading-tight font-semibold tracking-[-0.015em] text-app-text">
              Why this role scores {score}
            </h2>
            {match?.explanation ? (
              <p className="mt-2 max-w-[62ch] text-[0.9rem] leading-relaxed text-app-soft">
                {match.explanation}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-4">
              {match
                ? Object.entries(match.factors ?? {}).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_48px] items-center gap-4">
                      <span className="text-[0.82rem] text-app-soft">{titleCase(key)}</span>
                      <Meter value={Math.max(0, Math.min(100, value))} />
                      <span className="text-right font-mono text-[0.76rem] tabular-nums text-app-muted">
                        {Math.round(value)}
                      </span>
                    </div>
                  ))
                : null}
            </div>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
            <Panel>
              <PanelHead eyebrow="What is missing" title="Gaps in your profile" />
              <div className="border-t border-app-border px-5 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {(match?.gaps ?? []).length === 0 ? (
                    <p className="text-[0.84rem] leading-relaxed text-app-muted">
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
                <Link href="/profile" className="mt-4 block">
                  <Button variant="outline" size="sm" className="w-full">
                    Update profile
                  </Button>
                </Link>
              </div>
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "apply" ? (
        <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-app-border pb-3">
              <div>
                <h2 className="text-[1.15rem] leading-tight font-semibold tracking-[-0.015em] text-app-text">
                  The employer&rsquo;s form
                </h2>
                <p className="mt-1 max-w-[56ch] text-[0.84rem] leading-relaxed text-app-muted">
                  We detect the platform, map your profile to every field, and flag anything you must
                  supply yourself.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<ScanSearch size={14} />}
                loading={analysing}
                onClick={() => void analyse()}
              >
                Analyse
              </Button>
            </div>

            {analysis ? (
              <div className="mt-5 flex flex-col gap-6">
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
                    <p className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
                      Requires your input
                    </p>
                    <ul className="mt-2 divide-y divide-app-border border-y border-app-border">
                      {analysis.requiresUserInput.map((entry) => (
                        <li key={entry} className="py-2.5">
                          <strong className="text-[0.86rem] font-medium text-app-text">{entry}</strong>
                          <p className="mt-0.5 text-[0.78rem] text-app-muted">
                            Enter or confirm this value on the employer&rsquo;s form.
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {analysis.questions.length > 0 ? (
                  <div>
                    <p className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
                      Screening questions
                    </p>
                    <ol className="mt-2 flex flex-col gap-2">
                      {analysis.questions.map((question, index) => (
                        <li
                          key={index}
                          className="flex gap-3 text-[0.86rem] leading-relaxed text-app-soft"
                        >
                          <span className="font-mono text-[0.7rem] text-app-muted">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span>
                            {question.question}
                            {question.required ? (
                              <Badge tone="danger" className="ml-1.5">
                                required
                              </Badge>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {analysis.requiredDocuments.length > 0 ? (
                  <div>
                    <p className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
                      Documents required
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
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
                icon={<ScanSearch size={26} />}
                title="Not analysed yet"
                description="Run the analyser to detect the employer's application platform, fields and screening questions."
              />
            )}
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
            <Panel>
              <PanelHead eyebrow="Documents" title="Prepare the kit" />
              <div className="flex flex-col gap-2 border-t border-app-border px-5 py-4">
                <Link href={`/documents?opportunityId=${item.id}`}>
                  <Button variant="outline" className="w-full" icon={<FileText size={15} />}>
                    Open document editor
                  </Button>
                </Link>
                <Button loading={generating} onClick={() => void startApplication()} className="w-full">
                  {item.applicationMethod === "email"
                    ? "Prepare application email"
                    : "Start guided application"}
                </Button>
              </div>
            </Panel>
            <div className="rounded-app-lg border border-app-success/25 bg-app-success/8 p-4">
              <p className="font-mono text-[0.6rem] tracking-[0.16em] text-app-success uppercase">
                Your control
              </p>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-app-soft">
                Every answer is suggested from your own profile. Nothing is invented, and nothing is
                sent until you approve it.
              </p>
            </div>
          </aside>
        </div>
      ) : null}

      {tab === "risk" ? (
        <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <div className="min-w-0">
            <h2 className="text-[1.15rem] leading-tight font-semibold tracking-[-0.015em] text-app-text">
              How we scored this posting
            </h2>
            <p className="mt-1 max-w-[56ch] text-[0.84rem] leading-relaxed text-app-muted">
              Every listing is checked before publication. This is the reasoning behind the decision.
            </p>
            <div className="mt-5 flex flex-col gap-1.5">
              {riskFlags.length === 0 ? (
                <p className="text-[0.88rem] leading-relaxed text-app-muted">
                  No risk signals fired. The listing passed every check.
                </p>
              ) : (
                riskFlags.map((flag, index) => (
                  <div
                    key={index}
                    className="flex gap-2.5 rounded-app-sm border border-app-warning/25 bg-app-warning/8 px-3 py-2 text-[0.85rem] leading-relaxed text-app-soft"
                  >
                    <TriangleAlert size={14} className="mt-0.5 shrink-0 text-app-warning" aria-hidden />
                    {flag}
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
            <Panel>
              <PanelHead eyebrow="Verdict" title="Trust assessment" />
              <dl className="flex flex-col gap-4 border-t border-app-border px-5 py-4">
                <Meta label="Risk score" value={`${Math.round(item.riskScore ?? 0)} / 100`} />
                <Meta label="Decision" value={titleCase(item.riskAction ?? "publish")} />
                <Meta label="Signals" value={String(riskFlags.length)} />
              </dl>
            </Panel>
          </aside>
        </div>
      ) : null}
    </Page>
  );
}

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  // Keyed by id: the App Router keeps this route mounted when only the id
  // changes, and without the key the analysis, the tracked application and
  // the tab of the previous role stayed on screen under the new one.
  return <OpportunityDetailInner key={params.id} />;
}
