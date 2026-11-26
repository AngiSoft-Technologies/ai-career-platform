"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
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
  Rows,
  Row,
  Skeleton,
  useToast,
} from "@/components/ui";
import { HeroSplit } from "@/components/app-art";
import { JobDescription } from "@/components/job-description";
import {
  FitAssessment,
  HiringCompany,
  ResumeImprovements,
  RoleCriteriaSection,
} from "@/components/discovery/role-sections";
import {
  findDefaultResume,
  fitSummary,
  resumeSuggestions,
  roleCriteria,
  type FitSummary,
  type RoleCriteria,
} from "@/components/discovery/role-analysis";
import { SaveToggle } from "@/components/discovery/save-toggle";
import { sceneForPath } from "@/lib/app-scenes";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import {
  eligibilityLabel,
  eligibilityTone,
  formatDate,
  formatSalary,
  relativeTime,
  titleCase,
} from "@/lib/format";
import type {
  ApplicationPreparation,
  JobDocument,
  Opportunity,
  Profile,
} from "@/lib/types";
import type { SavedOpportunity } from "@angisoft/mboqara-contracts";

interface MatchResponse {
  match?: Opportunity["match"];
}

interface ProfileResponse {
  profile: Profile;
}

interface DocumentsResponse {
  documents: JobDocument[];
}

interface SavedResponse {
  items: SavedOpportunity[];
}

const EMPTY_CRITERIA: RoleCriteria = {
  responsibilities: [],
  requirements: [],
  prepared: { responsibilities: false, requirements: false },
};

const EMPTY_FIT: FitSummary = {
  strengths: [],
  weaknesses: [],
  resume: null,
};

function OpportunityDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const opportunityId = params.id;
  const [preparation, setPreparation] = useState<ApplicationPreparation | null>(null);
  const [preparationLoading, setPreparationLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const { data, loading, error } = useApi<Opportunity>(
    opportunityId ? `/opportunities/${opportunityId}` : null,
  );
  const matches = useApi<MatchResponse>(
    opportunityId ? `/matches/${opportunityId}` : null,
  );
  const profile = useApi<ProfileResponse>("/profile");
  const documents = useApi<DocumentsResponse>("/documents", { limit: 100 });
  const savedQuery = useApi<SavedResponse>("/feed/state/saved", { limit: 200 });

  const refreshPreparation = useCallback(async () => {
    try {
      const response = await api.get<{ preparation: ApplicationPreparation }>(
        `/applications/prepare/${opportunityId}`,
      );
      setPreparation(response.preparation);
      return true;
    } catch {
      // A missing preparation is normal before the first queue request.
      return false;
    }
  }, [opportunityId]);

  const queuePreparation = useCallback(async () => {
    try {
      const response = await api.post<{ preparation: ApplicationPreparation }>(
        `/applications/prepare/${opportunityId}`,
        {},
      );
      setPreparation(response.preparation);
      return true;
    } catch {
      return false;
    }
  }, [opportunityId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setPreparationLoading(true);
      const found = await refreshPreparation();
      if (!found && !cancelled) await queuePreparation();
      if (!cancelled) setPreparationLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [opportunityId, refreshPreparation, queuePreparation]);

  useEffect(() => {
    if (!preparation || !["QUEUED", "RUNNING"].includes(preparation.status)) return;
    const timer = window.setInterval(() => void refreshPreparation(), 2_500);
    return () => window.clearInterval(timer);
  }, [preparation, refreshPreparation]);

  useEffect(() => {
    // Next.js records its own position in history.state. A bare length check
    // is fooled by a fresh tab, where "back" would leave the app entirely.
    const state = window.history.state as { idx?: unknown } | null;
    const idx = state?.idx;
    setCanGoBack(typeof idx === "number" ? idx > 0 : window.history.length > 1);
  }, []);

  useEffect(() => {
    if (savedQuery.data) {
      setSavedIds(
        new Set(savedQuery.data.items.map((entry) => entry.opportunity.id)),
      );
    }
  }, [savedQuery.data]);

  const setSaved = useCallback((id: string, saved: boolean) => {
    setSavedIds((previous) => {
      const next = new Set(previous);
      if (saved) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const resume = useMemo(
    () => findDefaultResume(documents.data?.documents ?? []),
    [documents.data],
  );

  const criteria = useMemo(
    () => (data ? roleCriteria(data, preparation) : EMPTY_CRITERIA),
    [data, preparation],
  );

  const fit = useMemo(
    () =>
      data
        ? fitSummary({
            profile: profile.data?.profile ?? null,
            resume,
            opportunity: data,
            preparation,
          })
        : EMPTY_FIT,
    [data, profile.data, resume, preparation],
  );

  const suggestions = useMemo(
    () =>
      data
        ? resumeSuggestions({
            profile: profile.data?.profile ?? null,
            resume,
            opportunity: data,
            preparation,
          })
        : [],
    [data, profile.data, resume, preparation],
  );

  const goBack = () => {
    if (canGoBack) router.back();
    else router.push("/opportunities");
  };

  const apply = async () => {
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
  const score = typeof match?.score === "number" ? Math.round(match.score) : null;
  const riskFlags = data.riskFlags ?? [];
  const flagged = data.riskAction && data.riskAction !== "publish";
  const scene = sceneForPath("/opportunities");
  const insightsLoading = preparationLoading || profile.loading || documents.loading;

  return (
    <Page>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={<ArrowLeft size={14} />}
        onClick={goBack}
        className="self-start"
      >
        Go back
      </Button>

      <HeroSplit
        src={scene.src}
        alt={scene.alt}
        priority
        eyebrow={`${data.companyName} · ${data.city ? `${data.city}, ` : ""}${data.country} · ${relativeTime(data.postedAt)}`}
        title={data.title}
        description={
          data.skills?.length
            ? `Skills: ${data.skills.slice(0, 10).join(" · ")}`
            : undefined
        }
        actions={
          <>
            <SaveToggle
              opportunityId={data.id}
              saved={savedIds.has(data.id)}
              onChange={(value) => setSaved(data.id, value)}
              label={savedIds.has(data.id) ? "Saved" : "Add to wish list"}
            />
            <Button loading={starting} onClick={() => void apply()} icon={<ArrowUpRight size={15} />}>
              Apply
            </Button>
          </>
        }
        stats={
          <>
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
                Eligibility
              </dt>
              <dd className="mt-1 text-[0.92rem] font-medium text-app-text">
                {eligibilityLabel(data.eligibility)}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                Posted
              </dt>
              <dd className="mt-1 text-[0.92rem] font-medium text-app-text">
                {formatDate(data.postedAt)}
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

      <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-8">
          <Panel>
            <PanelHead eyebrow="The role" title="What the employer is asking for" />
            <div className="border-t border-app-border px-5 py-5">
              <JobDescription
                text={data.description || "No description was provided by the source."}
              />
            </div>
            <RoleCriteriaSection
              eyebrow="The work"
              title="Responsibilities"
              criteria={criteria}
              kind="responsibilities"
            />
            <RoleCriteriaSection
              eyebrow="What you need"
              title="Requirements"
              criteria={criteria}
              kind="requirements"
            />
          </Panel>

          <HiringCompany opportunity={data} />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
          <FitAssessment fit={fit} loading={insightsLoading} />
          <ResumeImprovements suggestions={suggestions} />

          <Panel>
            <PanelHead eyebrow="The facts" title="At a glance" />
            <Rows className="border-t border-app-border">
              <Row className="grid grid-cols-2 gap-4 px-5 py-3">
                <Meta
                  label="Match"
                  value={
                    score === null ? (
                      "Not scored"
                    ) : (
                      <span className="inline-flex items-baseline gap-1 tabular-nums">
                        {score}
                        <span className="font-mono text-[0.62rem] font-normal text-app-muted">
                          /100
                        </span>
                      </span>
                    )
                  }
                />
                <Meta
                  label="Salary"
                  value={
                    data.salaryMin || data.salaryMax
                      ? formatSalary(data.salaryMin, data.salaryMax, data.currency)
                      : "Not stated"
                  }
                />
                <Meta label="Location" value={data.city ? `${data.city}, ${data.country}` : data.country} />
                <Meta label="Method" value={titleCase(data.applicationMethod)} />
                <Meta label="Posted on" value={data.sourceKind ?? titleCase(data.platform)} />
                <Meta
                  label="Expires"
                  value={data.expiresAt ? formatDate(data.expiresAt) : "Not stated"}
                />
              </Row>
            </Rows>
            {score !== null ? (
              <div className="border-t border-app-border px-5 py-4">
                <Meter value={Math.max(0, Math.min(100, score))} />
                {match?.explanation ? (
                  <p className="mt-3 text-[0.79rem] leading-relaxed text-app-muted">
                    {match.explanation}
                  </p>
                ) : null}
              </div>
            ) : null}
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
            <PanelHead eyebrow="Trust" title="Posting assessment" />
            <div className="border-t border-app-border px-5 py-4">
              <div className="flex items-center gap-2">
                {riskFlags.length ? (
                  <TriangleAlert size={15} className="text-app-warning" aria-hidden />
                ) : (
                  <CheckCircle2 size={15} className="text-app-success" aria-hidden />
                )}
                <span className="text-[0.82rem] font-medium text-app-text">
                  {riskFlags.length ? `${riskFlags.length} signal${riskFlags.length === 1 ? "" : "s"}` : "No risk signals"}
                </span>
              </div>
              <p className="mt-2 text-[0.76rem] leading-relaxed text-app-muted">
                {typeof data.riskScore === "number"
                  ? `Risk score ${Math.round(data.riskScore)}/100 · decision ${titleCase(data.riskAction ?? "publish")}`
                  : "No risk score was recorded for this posting."}
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
              Your document library
            </Button>
          </Link>
        </aside>
      </div>
    </Page>
  );
}

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Skeleton height={320} />}>
      <OpportunityDetailInner key={params.id} />
    </Suspense>
  );
}
