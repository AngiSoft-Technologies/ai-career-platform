"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Badge, Button, Meter, Panel, PanelHead, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { AtsReport } from "@/lib/types";

interface AtsIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  hint?: string;
}

interface ReportMetrics {
  wordCount: number;
  bulletCount: number;
  keywordCoverage: number;
  averageBulletLength: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  hasContactSection: boolean;
  hasExperienceSection: boolean;
  hasEducationSection: boolean;
  hasSkillsSection: boolean;
  suggestions?: string[];
}

interface DisplayReport {
  score: number;
  grade: string;
  passed: boolean;
  verdict?: string;
  issues: AtsIssue[];
  metrics: ReportMetrics;
  suggestions: string[];
}

interface StoredReport {
  score: number;
  grade: string;
  passed: boolean;
  verdict?: string;
  issues?: AtsIssue[];
  matchedKeywords?: string[];
  missingKeywords?: string[];
  keywordCoverage?: number;
  sections?: { sections?: string[] };
  metrics?: Partial<ReportMetrics> & {
    suggestions?: string[];
    sections?: string[];
  };
}

interface AtsSidebarProps {
  documentId: string;
  content: string;
  opportunityId?: string;
  autoCheck?: boolean;
  className?: string;
}

const EMPTY_METRICS: ReportMetrics = {
  wordCount: 0,
  bulletCount: 0,
  keywordCoverage: 0,
  averageBulletLength: 0,
  matchedKeywords: [],
  missingKeywords: [],
  hasContactSection: false,
  hasExperienceSection: false,
  hasEducationSection: false,
  hasSkillsSection: false,
};

function normaliseStored(report: StoredReport | null): DisplayReport | null {
  if (!report) return null;
  const metrics = report.metrics ?? {};
  const sections = new Set(metrics.sections ?? report.sections?.sections ?? []);
  return {
    score: Number(report.score) || 0,
    grade: report.grade ?? "poor",
    passed: Boolean(report.passed),
    verdict: report.verdict,
    issues: report.issues ?? [],
    metrics: {
      ...EMPTY_METRICS,
      wordCount: Number(metrics.wordCount) || 0,
      bulletCount: Number(metrics.bulletCount) || 0,
      keywordCoverage: Number(metrics.keywordCoverage ?? report.keywordCoverage ?? 0),
      averageBulletLength: Number(metrics.averageBulletLength) || 0,
      matchedKeywords: metrics.matchedKeywords ?? report.matchedKeywords ?? [],
      missingKeywords: metrics.missingKeywords ?? report.missingKeywords ?? [],
      hasContactSection: metrics.hasContactSection ?? sections.has("contact"),
      hasExperienceSection: metrics.hasExperienceSection ?? sections.has("experience"),
      hasEducationSection: metrics.hasEducationSection ?? sections.has("education"),
      hasSkillsSection: metrics.hasSkillsSection ?? sections.has("skills"),
    },
    suggestions: metrics.suggestions ?? [],
  };
}

function normaliseFresh(report: AtsReport): DisplayReport {
  return {
    score: report.score,
    grade: report.grade,
    passed: report.passed,
    issues: report.issues,
    metrics: {
      ...EMPTY_METRICS,
      ...report.metrics,
    },
    suggestions: [],
  };
}

export function ATSSidebar({
  documentId,
  content,
  opportunityId,
  autoCheck = true,
  className,
}: AtsSidebarProps) {
  const [report, setReport] = useState<DisplayReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(autoCheck);
  const lastRunRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ report: StoredReport | null }>(`/documents/${documentId}/ats`)
      .then((response) => {
        if (!cancelled) setReport(normaliseStored(response.report));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const runCheck = useCallback(async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const response = await api.post<{ report: AtsReport & { suggestions?: string[] } }>(
        `/documents/${documentId}/ats/run`,
        opportunityId ? { opportunityId } : {},
      );
      const next = normaliseFresh(response.report);
      setReport({ ...next, suggestions: response.report.suggestions ?? [] });
      lastRunRef.current = content;
    } catch {
      // Advisory only — leave the previous report in place.
    } finally {
      setLoading(false);
    }
  }, [content, documentId, opportunityId]);

  useEffect(() => {
    if (!auto || !content.trim()) return;
    if (lastRunRef.current === content) return;
    const timer = setTimeout(() => {
      void runCheck();
    }, 2500);
    return () => clearTimeout(timer);
  }, [auto, content, runCheck]);

  const score = report?.score ?? 0;
  const scoreTone = score >= 80 ? "text-app-success" : score >= 55 ? "text-app-warning" : "text-app-danger";

  return (
    <Panel className={cx("flex flex-col gap-3.5 p-4", className)}>
      <PanelHead
        className="px-0 py-0"
        eyebrow="ATS verifier"
        title={report ? `Score ${score}/100` : "Not checked yet"}
        action={
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            onClick={() => void runCheck()}
            disabled={!content.trim()}
            aria-label="Re-run ATS check"
          >
            <RefreshCw size={13} />
          </Button>
        }
      />

      {report ? (
        <>
          <div>
            <Meter value={score} />
            <div className="mt-2 flex items-baseline justify-between gap-2 text-[0.78rem] text-app-muted">
              <span className={cx("font-semibold", scoreTone)}>{report.grade}</span>
              <span>{report.passed ? "Passes core checks" : "Needs attention"}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Words" value={report.metrics.wordCount} />
            <Metric label="Bullets" value={report.metrics.bulletCount} />
            <Metric label="Keywords" value={`${Math.round(report.metrics.keywordCoverage * 100)}%`} />
            <Metric label="Avg bullet" value={`${report.metrics.averageBulletLength}w`} />
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
              Required sections
            </span>
            {(
              [
                ["Contact", report.metrics.hasContactSection],
                ["Experience", report.metrics.hasExperienceSection],
                ["Education", report.metrics.hasEducationSection],
                ["Skills", report.metrics.hasSkillsSection],
              ] as const
            ).map(([label, present]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-app-border/60 py-1 text-[0.78rem] text-app-soft last:border-b-0"
              >
                <span>{label}</span>
                <span className={present ? "text-app-success" : "text-app-warning"}>
                  {present ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                </span>
              </div>
            ))}
          </div>

          {report.suggestions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                Agent suggestions
              </span>
              {report.suggestions.map((suggestion) => (
                <div
                  key={suggestion}
                  className="flex items-start gap-2 rounded-app-sm bg-app-accent-soft p-2 text-[0.78rem] leading-relaxed text-app-soft"
                >
                  <Wand2 size={13} className="mt-0.5 shrink-0 text-app-accent" />
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          ) : null}

          {report.metrics.missingKeywords.length > 0 ? (
            <div>
              <span className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                Missing keywords
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {report.metrics.missingKeywords.slice(0, 12).map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded bg-app-warning/15 px-1.5 py-0.5 text-[0.68rem] text-app-warning"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {report.issues.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                Issues
              </span>
              {report.issues.slice(0, 4).map((issue, index) => (
                <div
                  key={`${issue.code}-${index}`}
                  className={cx(
                    "rounded-app-sm border border-app-border p-2",
                    issue.severity === "error"
                      ? "border-l-[3px] border-l-app-danger"
                      : issue.severity === "warning"
                        ? "border-l-[3px] border-l-app-warning"
                        : "border-l-[3px] border-l-app-info",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-[0.76rem] text-app-text">{issue.message}</strong>
                    <Badge
                      tone={
                        issue.severity === "error"
                          ? "danger"
                          : issue.severity === "warning"
                            ? "warning"
                            : "info"
                      }
                    >
                      {issue.severity}
                    </Badge>
                  </div>
                  {issue.hint ? (
                    <p className="mt-1 text-[0.72rem] leading-relaxed text-app-muted">{issue.hint}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-[0.82rem] leading-relaxed text-app-muted">
            The verifier runs automatically after you import, create or save a resume. You can also
            run it now.
          </p>
          <Button
            size="sm"
            loading={loading}
            onClick={() => void runCheck()}
            disabled={!content.trim()}
          >
            {loading ? <Loader2 size={13} /> : <Sparkles size={13} />}
            Check ATS readiness
          </Button>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-[0.78rem] text-app-soft">
        <input
          type="checkbox"
          className="accent-[var(--accent)]"
          checked={auto}
          onChange={(event) => setAuto(event.target.checked)}
        />
        Re-check automatically while I edit
      </label>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-app-sm border border-app-border bg-app-surface px-2.5 py-2">
      <p className="text-[0.64rem] font-semibold tracking-[0.12em] text-app-muted uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-[1rem] leading-none font-semibold tabular-nums text-app-text">
        {value}
      </p>
    </div>
  );
}

export default ATSSidebar;
