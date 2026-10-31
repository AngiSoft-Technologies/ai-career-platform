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
import { Badge, Button, Card, Meter, SectionTitle } from "@/components/ui";
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
  style?: React.CSSProperties;
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
  const sections = new Set(
    metrics.sections ?? report.sections?.sections ?? [],
  );
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
      keywordCoverage: Number(
        metrics.keywordCoverage ?? report.keywordCoverage ?? 0,
      ),
      averageBulletLength: Number(metrics.averageBulletLength) || 0,
      matchedKeywords: metrics.matchedKeywords ?? report.matchedKeywords ?? [],
      missingKeywords: metrics.missingKeywords ?? report.missingKeywords ?? [],
      hasContactSection:
        metrics.hasContactSection ?? sections.has("contact"),
      hasExperienceSection:
        metrics.hasExperienceSection ?? sections.has("experience"),
      hasEducationSection:
        metrics.hasEducationSection ?? sections.has("education"),
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
  style,
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
  const scoreColor =
    score >= 80
      ? "var(--success)"
      : score >= 55
        ? "var(--warning)"
        : "var(--danger)";

  return (
    <Card
      className={className}
      style={{
        padding: "1rem",
        position: "sticky",
        top: "5.5rem",
        display: "grid",
        gap: "0.85rem",
        ...style,
      }}
    >
      <SectionTitle
        eyebrow="ATS verifier"
        title={report ? `Score ${score}/100` : "Not checked yet"}
        action={
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            onClick={() => void runCheck()}
            disabled={!content.trim()}
          >
            <RefreshCw size={13} />
          </Button>
        }
      />

      {report ? (
        <>
          <div>
            <Meter value={score} />
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                marginTop: "0.5rem",
                fontSize: "0.78rem",
                color: "var(--text-muted)",
              }}
            >
              <span style={{ color: scoreColor, fontWeight: 600 }}>
                {report.grade}
              </span>
              <span>
                {report.passed ? "Passes core checks" : "Needs attention"}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "0.5rem",
            }}
          >
            <Metric label="Words" value={report.metrics.wordCount} />
            <Metric label="Bullets" value={report.metrics.bulletCount} />
            <Metric
              label="Keywords"
              value={`${Math.round(report.metrics.keywordCoverage * 100)}%`}
            />
            <Metric
              label="Avg bullet"
              value={`${report.metrics.averageBulletLength}w`}
            />
          </div>

          <div style={{ display: "grid", gap: "0.3rem" }}>
            <span className="eyebrow">Required sections</span>
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
                className="row"
                style={{
                  justifyContent: "space-between",
                  fontSize: "0.78rem",
                  padding: "0.28rem 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span>{label}</span>
                <span style={{ color: present ? "var(--success)" : "var(--warning)" }}>
                  {present ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                </span>
              </div>
            ))}
          </div>

          {report.suggestions.length > 0 ? (
            <div style={{ display: "grid", gap: "0.4rem" }}>
              <span className="eyebrow">Agent suggestions</span>
              {report.suggestions.map((suggestion) => (
                <div
                  key={suggestion}
                  className="row"
                  style={{
                    gap: "0.45rem",
                    alignItems: "flex-start",
                    fontSize: "0.78rem",
                    padding: "0.5rem",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--accent-soft)",
                  }}
                >
                  <Wand2 size={13} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          ) : null}

          {report.metrics.missingKeywords.length > 0 ? (
            <div>
              <span className="eyebrow">Missing keywords</span>
              <div
                className="row"
                style={{ flexWrap: "wrap", gap: "0.25rem", marginTop: "0.4rem" }}
              >
                {report.metrics.missingKeywords.slice(0, 12).map((keyword) => (
                  <span
                    key={keyword}
                    style={{
                      fontSize: "0.68rem",
                      padding: "0.1rem 0.35rem",
                      borderRadius: 4,
                      background: "var(--warning-soft)",
                      color: "var(--warning)",
                    }}
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {report.issues.length > 0 ? (
            <div style={{ display: "grid", gap: "0.4rem" }}>
              <span className="eyebrow">Issues</span>
              {report.issues.slice(0, 4).map((issue, index) => (
                <div
                  key={`${issue.code}-${index}`}
                  style={{
                    padding: "0.5rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${
                      issue.severity === "error"
                        ? "var(--danger)"
                        : issue.severity === "warning"
                          ? "var(--warning)"
                          : "var(--info)"
                    }`,
                  }}
                >
                  <div
                    className="row"
                    style={{ justifyContent: "space-between", gap: "0.4rem" }}
                  >
                    <strong style={{ fontSize: "0.76rem" }}>
                      {issue.message}
                    </strong>
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
                    <p
                      style={{
                        margin: "0.25rem 0 0",
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {issue.hint}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>
            The verifier runs automatically after you import, create or save a
            resume. You can also run it now.
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

      <label
        className="row"
        style={{ gap: "0.45rem", fontSize: "0.78rem", cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={auto}
          onChange={(event) => setAuto(event.target.checked)}
        />
        Re-check automatically while I edit
      </label>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        padding: "0.45rem 0.55rem",
        background: "var(--surface)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="eyebrow">{label}</div>
      <div className="tabular" style={{ fontSize: "1rem", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

export default ATSSidebar;
