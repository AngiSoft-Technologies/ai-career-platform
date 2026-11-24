"use client";

import Link from "next/link";
import {
  Check,
  CircleAlert,
  FileCheck2,
  FileText,
  Mail,
  MessagesSquare,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PanelHead,
  Rows,
  Row,
  cx,
} from "@/components/ui";
import type { ApplicationPreparation } from "@/lib/types";

const STATUS_COPY: Record<
  ApplicationPreparation["status"],
  { label: string; detail: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info" }
> = {
  QUEUED: {
    label: "Queued",
    detail: "The agent is waiting for a preparation worker.",
    tone: "neutral",
  },
  RUNNING: {
    label: "Agent working",
    detail: "The agent is researching the role and writing this application package.",
    tone: "accent",
  },
  NEEDS_INPUT: {
    label: "Needs you",
    detail: "The agent found everything it could. Answer the remaining questions to continue.",
    tone: "warning",
  },
  AWAITING_REVIEW: {
    label: "Ready for review",
    detail: "The package is complete. Check the documents and answers before approval.",
    tone: "info",
  },
  READY: {
    label: "Approved",
    detail: "You approved this exact package. The agent may now submit it.",
    tone: "success",
  },
  BLOCKED: {
    label: "Blocked",
    detail: "The agent cannot prepare a trustworthy package from the available source material.",
    tone: "danger",
  },
  FAILED: {
    label: "Preparation failed",
    detail: "The last attempt failed. Refresh the package or correct the reported problem.",
    tone: "danger",
  },
  STALE: {
    label: "Out of date",
    detail: "The role or profile changed. Refresh the package before applying.",
    tone: "warning",
  },
};

const STEPS = [
  { key: "research", label: "Research employer and role" },
  { key: "tailor", label: "Tailor the application package" },
  { key: "review", label: "Your review and approval" },
  { key: "apply", label: "Agent submits the application" },
];

function stepIndex(status: ApplicationPreparation["status"]): number {
  if (status === "QUEUED") return 0;
  if (status === "RUNNING") return 1;
  if (status === "NEEDS_INPUT" || status === "AWAITING_REVIEW") return 2;
  if (status === "READY") return 3;
  if (status === "BLOCKED" || status === "FAILED") return 1;
  return 0;
}

function documentEntries(preparation: ApplicationPreparation) {
  return [
    {
      key: "cv",
      label: "Tailored resume",
      icon: FileText,
      id: preparation.documentIds.cv,
    },
    {
      key: "coverLetter",
      label: "Cover letter",
      icon: FileCheck2,
      id: preparation.documentIds.coverLetter,
    },
    {
      key: "email",
      label: "Application email",
      icon: Mail,
      id: preparation.documentIds.email,
    },
    {
      key: "answers",
      label: "Application answers",
      icon: MessagesSquare,
      id: preparation.documentIds.answers,
    },
  ].filter((entry) => Boolean(entry.id));
}

export function PreparationPanel({
  preparation,
  loading = false,
  onRefresh,
  action,
}: {
  preparation: ApplicationPreparation | null;
  loading?: boolean;
  onRefresh?: () => void;
  action?: React.ReactNode;
}) {
  if (loading && !preparation) {
    return (
      <Panel>
        <PanelHead
          eyebrow="Application agent"
          title="Reading the role and preparing your package"
          description="Research, form analysis, and document writing continue in the background."
        />
        <div className="flex items-center gap-3 border-t border-app-border px-5 py-6">
          <ScanSearch size={19} className="animate-spin text-app-accent" />
          <p className="text-[0.86rem] text-app-muted">
            The first package usually takes a little longer because the agent has to learn the employer&rsquo;s application flow.
          </p>
        </div>
      </Panel>
    );
  }

  if (!preparation) {
    return (
      <EmptyState
        icon={<Sparkles size={25} />}
        title="The application agent has not started this role"
        description="Open the role and the agent will research the employer and prepare a package specific to it."
        action={action}
      />
    );
  }

  const status = STATUS_COPY[preparation.status];
  const activeStep = stepIndex(preparation.status);
  const documents = documentEntries(preparation);
  const requirements = preparation.requirements as {
    matched?: string[];
    uncovered?: string[];
  };
  const employer = preparation.employerIntelligence as {
    summary?: string;
    techStack?: string[];
    cultureSignals?: string[];
    sources?: Array<{ url: string; title?: string; kind?: string }>;
    pagesVisited?: number;
  };

  return (
    <Panel>
      <PanelHead
        eyebrow="Application agent"
        title="This role’s application package"
        description="One preparation record per role. Nothing here is a generic resume."
        action={
          <div className="flex items-center gap-2">
            {onRefresh ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<RefreshCw size={13} />}
                onClick={onRefresh}
                disabled={preparation.status === "RUNNING"}
              >
                Refresh
              </Button>
            ) : null}
            {action}
          </div>
        }
      />

      <div className="border-t border-app-border px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {preparation.status === "RUNNING" ? (
              <ScanSearch size={20} className="mt-0.5 animate-spin text-app-accent" />
            ) : preparation.status === "READY" ? (
              <ShieldCheck size={20} className="mt-0.5 text-app-success" />
            ) : preparation.status === "NEEDS_INPUT" || preparation.status === "FAILED" ? (
              <CircleAlert size={20} className="mt-0.5 text-app-warning" />
            ) : (
              <Sparkles size={20} className="mt-0.5 text-app-accent" />
            )}
            <div>
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
              <p className="mt-2 max-w-[60ch] text-[0.84rem] leading-relaxed text-app-muted">
                {status.detail}
              </p>
            </div>
          </div>
          {preparation.missingInputs.length ? (
            <Badge tone="warning">
              {preparation.missingInputs.length} question
              {preparation.missingInputs.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>

        <ol className="mt-6 grid gap-2 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const done = index < activeStep || preparation.status === "READY";
            const active = index === activeStep && preparation.status !== "READY";
            return (
              <li
                key={step.key}
                className={cx(
                  "border-t-2 pt-2.5",
                  done
                    ? "border-app-success text-app-text"
                    : active
                      ? "border-app-accent text-app-text"
                      : "border-app-border text-app-muted",
                )}
              >
                <div className="flex items-center gap-2">
                  {done ? (
                    <Check size={13} className="text-app-success" />
                  ) : (
                    <span className="font-mono text-[0.65rem] tabular-nums opacity-70">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span className="text-[0.76rem] leading-snug font-medium">{step.label}</span>
                </div>
              </li>
            );
          })}
        </ol>

        {preparation.errorDetail ? (
          <div className="mt-5 rounded-app-md border border-app-danger/25 bg-app-danger/8 px-3.5 py-3 text-[0.81rem] leading-relaxed text-app-soft">
            {preparation.errorDetail}
          </div>
        ) : null}

        {preparation.missingInputs.length ? (
          <div className="mt-5">
            <p className="text-[0.82rem] font-semibold text-app-text">
              What the agent could not find
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {preparation.missingInputs.map((input) => (
                <li key={input.key} className="text-[0.8rem] leading-relaxed text-app-muted">
                  <strong className="font-medium text-app-soft">{input.label}</strong>
                  {input.reason ? ` — ${input.reason}` : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {documents.length ? (
        <div className="border-t border-app-border">
          <Rows>
            {documents.map((document) => {
              const Icon = document.icon;
              return (
                <Row key={document.key} className="items-center justify-between gap-4 px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon size={15} className="shrink-0 text-app-accent" />
                    <span className="truncate text-[0.84rem] font-medium text-app-text">
                      {document.label}
                    </span>
                  </div>
                  <Link href={`/documents/${document.id}`} className="shrink-0">
                    <Button size="sm" variant="ghost">
                      Review and edit
                    </Button>
                  </Link>
                </Row>
              );
            })}
          </Rows>
        </div>
      ) : null}

      {(requirements.matched?.length || requirements.uncovered?.length) ? (
        <div className="grid gap-5 border-t border-app-border px-5 py-5 lg:grid-cols-2">
          <div>
            <p className="text-[0.82rem] font-semibold text-app-text">
              Requirements the agent matched
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(requirements.matched ?? []).slice(0, 12).map((item) => (
                <Badge key={item} tone="success">
                  {item}
                </Badge>
              ))}
              {(requirements.matched ?? []).length === 0 ? (
                <span className="text-[0.79rem] text-app-muted">No grounded matches yet.</span>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-[0.82rem] font-semibold text-app-text">
              Gaps left visible
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(requirements.uncovered ?? []).slice(0, 12).map((item) => (
                <Badge key={item} tone="warning">
                  {item}
                </Badge>
              ))}
              {(requirements.uncovered ?? []).length === 0 ? (
                <span className="text-[0.79rem] text-app-muted">No uncovered requirements yet.</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {employer.summary || employer.techStack?.length || employer.cultureSignals?.length ? (
        <div className="border-t border-app-border px-5 py-5">
          <p className="text-[0.82rem] font-semibold text-app-text">Employer research</p>
          {employer.summary ? (
            <p className="mt-1.5 max-w-[72ch] text-[0.8rem] leading-relaxed text-app-muted">
              {employer.summary}
            </p>
          ) : null}
          {employer.techStack?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {employer.techStack.slice(0, 12).map((item) => (
                <Badge key={item} tone="neutral">
                  {item}
                </Badge>
              ))}
            </div>
          ) : null}
          {employer.cultureSignals?.length ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {employer.cultureSignals.slice(0, 4).map((signal) => (
                <li key={signal} className="text-[0.79rem] leading-relaxed text-app-soft">
                  {signal}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
