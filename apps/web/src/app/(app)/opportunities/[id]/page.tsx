"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
  Rows,
  Row,
  Skeleton,
  useToast,
} from "@/components/ui";
import { CompanyMark, HeroSplit } from "@/components/app-art";
import { JobDescription } from "@/components/job-description";
import { EmployerFrame } from "@/components/application/employer-frame";
import { PreparationPanel } from "@/components/application/preparation-panel";
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
import type { ApplicationPreparation, Opportunity } from "@/lib/types";

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
  riskScore?: number;
}

function OpportunityDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const opportunityId = params.id;
  const [preparation, setPreparation] = useState<ApplicationPreparation | null>(null);
  const [preparationLoading, setPreparationLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const { data, loading, error } = useApi<OpportunityDetail>(
    `/opportunities/${opportunityId}`,
  );
  const matches = useApi<{ match: OpportunityDetail["match"] }>(
    opportunityId ? `/matches/${opportunityId}` : null,
    undefined,
  );

  const refreshPreparation = useCallback(async () => {
    try {
      const response = await api.get<{ preparation: ApplicationPreparation }>(
        `/applications/prepare/${opportunityId}`,
      );
      setPreparation(response.preparation);
    } catch {
      // A missing preparation is normal before the first queue request.
    }
  }, [opportunityId]);

  const queuePreparation = useCallback(async (refresh = false) => {
    setPreparationLoading(true);
    if (refresh) setRefreshing(true);
    try {
      const path = `/applications/prepare/${opportunityId}${refresh ? "/refresh" : ""}`;
      const response = await api.post<{ preparation: ApplicationPreparation }>(path, {});
      setPreparation(response.preparation);
      if (refresh) toast.push("The agent is rebuilding this role’s package", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not start application preparation",
        "danger",
      );
    } finally {
      setPreparationLoading(false);
      setRefreshing(false);
    }
  }, [opportunityId, toast]);

  useEffect(() => {
    if (!opportunityId) return;
    void queuePreparation();
  }, [opportunityId, queuePreparation]);

  useEffect(() => {
    if (!preparation || !["QUEUED", "RUNNING"].includes(preparation.status)) return;
    const timer = window.setInterval(() => void refreshPreparation(), 2_500);
    return () => window.clearInterval(timer);
  }, [preparation, refreshPreparation]);

  const openApplicationDesk = async () => {
    if (!data) return;
    setStarting(true);
    try {
      const response = await api.post<{ application: { id: string } }>("/applications", {
        opportunityId: data.id,
      });
      router.push(`/applications/${response.application.id}`);
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not open the application desk",
        "danger",
      );
    } finally {
      setStarting(false);
    }
  };

  if (loading && !data) {
    return (
      <Page>
        <Skeleton height={30} width={220} />
        <Skeleton height={180} />
        <Skeleton height={320} />
      </Page>
    );
  }

  if (error && !data) {
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

  if (!data) {
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

  const match = matches.data?.match ?? data.match;
  const riskFlags = data.riskFlags ?? [];
  const flagged = data.riskAction && data.riskAction !== "publish";
  const score = Math.round(match?.score ?? 0);
  const applicationAction = (
    <Button loading={starting} onClick={() => void openApplicationDesk()}>
      Open application desk
    </Button>
  );

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

      <HeroSplit
        src="https://cdn1.angisoft.co.ke/mboqara/images/mboqara/careers/technology-professional.webp"
        alt="A professional at work"
        priority
        eyebrow={`${data.companyName} · ${data.city ? `${data.city}, ` : ""}${data.country} · ${relativeTime(data.postedAt)}`}
        title={data.title}
        description={data.skills?.length ? data.skills.slice(0, 10).join(" · ") : undefined}
        actions={applicationAction}
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
                {titleCase(data.seniority)}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                Mode
              </dt>
              <dd className="mt-1 text-[0.92rem] font-medium text-app-text">
                {titleCase(data.workMode)}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                Salary
              </dt>
              <dd className="mt-1 text-[0.92rem] font-medium text-app-text">
                {formatSalary(data.salaryMin, data.salaryMax, data.currency)}
              </dd>
            </div>
          </>
        }
        badge={
          flagged ? (
            <Badge tone="danger" dot>
              {titleCase(data.riskAction ?? "")} by risk engine
            </Badge>
          ) : undefined
        }
      />

      <PreparationPanel
        preparation={preparation}
        loading={preparationLoading}
        onRefresh={() => void queuePreparation(true)}
        action={applicationAction}
      />

      <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-8">
          <article className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-app-border pb-3">
              <div>
                <p className="font-mono text-[0.62rem] tracking-[0.18em] text-app-muted uppercase">
                  The role
                </p>
                <h2 className="mt-1 text-[1.15rem] leading-tight font-semibold tracking-[-0.015em] text-app-text">
                  What the employer is asking for
                </h2>
              </div>
              <span className="text-[0.75rem] text-app-muted">
                Posted {formatDate(data.postedAt)}
              </span>
            </div>
            <JobDescription
              text={data.description || "No description was provided by the source."}
            />
          </article>

          <section>
            <div className="mb-4 border-b border-app-border pb-3">
              <p className="font-mono text-[0.62rem] tracking-[0.18em] text-app-muted uppercase">
                Employer page
              </p>
              <h2 className="mt-1 text-[1.15rem] leading-tight font-semibold tracking-[-0.015em] text-app-text">
                The application stays inside MboQara
              </h2>
              <p className="mt-1.5 max-w-[62ch] text-[0.82rem] leading-relaxed text-app-muted">
                The agent has already read this page. You can see it here while
                you review the package, answer anything missing, and approve the
                application.
              </p>
            </div>
            <EmployerFrame url={data.applyUrl} title={data.title} defaultOpen />
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
          <Panel>
            <PanelHead eyebrow="Your position" title="Fit and gaps" />
            <div className="border-t border-app-border px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.84rem] text-app-soft">Match score</span>
                <span className="font-display text-[1.55rem] font-semibold tabular-nums text-app-text">
                  {score}
                </span>
              </div>
              <div className="mt-2">
                <Meter value={Math.max(0, Math.min(100, score))} />
              </div>
              {match?.explanation ? (
                <p className="mt-3 text-[0.79rem] leading-relaxed text-app-muted">
                  {match.explanation}
                </p>
              ) : null}
              {(match?.gaps ?? []).length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(match?.gaps ?? []).slice(0, 6).map((gap) => (
                    <Badge key={gap} tone="warning">
                      {gap}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHead eyebrow="The facts" title="At a glance" />
            <Rows className="border-t border-app-border">
              <Row className="grid grid-cols-2 gap-4 px-5 py-3">
                <Meta label="Salary" value={formatSalary(data.salaryMin, data.salaryMax, data.currency)} />
                <Meta label="Location" value={data.city ? `${data.city}, ${data.country}` : data.country} />
                <Meta label="Mode" value={titleCase(data.workMode)} />
                <Meta label="Method" value={titleCase(data.applicationMethod)} />
                <Meta label="Posted on" value={data.sourceKind ?? titleCase(data.platform)} />
                <Meta
                  label="Expires"
                  value={data.expiresAt ? formatDate(data.expiresAt) : "Not stated"}
                />
              </Row>
            </Rows>
          </Panel>

          <Panel>
            <PanelHead eyebrow="Can you hold it" title="Eligibility" />
            <div className="border-t border-app-border px-5 py-4">
              <Badge tone={eligibilityTone(data.eligibility)}>
                {eligibilityLabel(data.eligibility)}
              </Badge>
              <p className="mt-2 text-[0.8rem] leading-relaxed text-app-muted">
                Read from what the posting itself says about location and work authorisation.
              </p>
              {(data.eligibilityReasons ?? []).slice(0, 4).map((reason) => (
                <p key={reason} className="mt-1.5 text-[0.78rem] leading-relaxed text-app-soft">
                  {reason}
                </p>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHead eyebrow="Employer" title={data.companyName} />
            <div className="border-t border-app-border px-5 py-4">
              <div className="flex items-center gap-2.5">
                <CompanyMark name={data.companyName} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-[0.86rem] font-medium text-app-text">
                    {data.companyName}
                  </p>
                  <p className="truncate text-[0.72rem] text-app-muted">
                    {data.companyWebsite ?? "No website listed"}
                  </p>
                </div>
              </div>
              <Link href={`/companies/${data.companySlug}`} className="mt-3 block">
                <Button variant="ghost" size="sm" icon={<ArrowUpRight size={13} />} className="w-full">
                  Company intelligence
                </Button>
              </Link>
            </div>
          </Panel>

          <Panel>
            <PanelHead eyebrow="Trust" title="Posting assessment" />
            <div className="border-t border-app-border px-5 py-4">
              <div className="flex items-center gap-2">
                {riskFlags.length ? (
                  <TriangleAlert size={15} className="text-app-warning" />
                ) : (
                  <CheckCircle2 size={15} className="text-app-success" />
                )}
                <span className="text-[0.82rem] font-medium text-app-text">
                  {riskFlags.length ? `${riskFlags.length} signal${riskFlags.length === 1 ? "" : "s"}` : "No risk signals"}
                </span>
              </div>
              <p className="mt-2 text-[0.76rem] leading-relaxed text-app-muted">
                Risk score {Math.round(data.riskScore ?? 0)}/100 · decision {titleCase(data.riskAction ?? "publish")}
              </p>
              {riskFlags.slice(0, 3).map((flag) => (
                <p key={flag} className="mt-1.5 text-[0.75rem] leading-relaxed text-app-soft">
                  {flag}
                </p>
              ))}
            </div>
          </Panel>

          <Link href="/documents" className="block">
            <Button variant="outline" className="w-full" icon={<FileText size={14} />}>
              Your source documents
            </Button>
          </Link>
        </aside>
      </div>
    </Page>
  );
}

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  return <OpportunityDetailInner key={params.id} />;
}
