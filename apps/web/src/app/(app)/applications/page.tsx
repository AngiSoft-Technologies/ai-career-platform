"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Briefcase, CheckCircle2, Inbox, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Page,
  Pagination,
  Panel,
  Rows,
  Row,
  Select,
  Skeleton,
  Tabs,
  cx,
  useToast,
} from "@/components/ui";
import { CompanyMark, EmptyPipelineArt, HeroSplit } from "@/components/app-art";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import type { Application } from "@/lib/types";
import { APPLICATION_STATUS_TRANSITIONS } from "@angisoft/mboqara-contracts";
import type { ApplicationStatus } from "@angisoft/mboqara-contracts";

interface ApplicationsResponse {
  items: Application[];
  total: number;
  statusCounts: Record<string, number>;
}

const STAGES = ["SHORTLISTED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];
const PAGE_SIZE = 20;

export default function ApplicationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);

  // The stage filter is the database's, and the page number rides with it:
  // a pipeline of a thousand applications is paged by the same count the
  // tabs show, not by whatever the browser happened to download.
  const query =
    tab === "all"
      ? { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
      : { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, status: tab };
  const applications = useApi<ApplicationsResponse>("/applications", query);

  const items = applications.data?.items ?? [];
  const total = applications.data?.total ?? 0;
  const counts = applications.data?.statusCounts ?? {};
  const visible = tab === "all" ? items : items.filter((item) => item.status === tab);

  const updateStatus = async (application: Application, status: ApplicationStatus) => {
    try {
      await api.patch(`/applications/${application.id}/status`, {
        status,
        version: application.version,
      });
      toast.push(`Moved to ${titleCase(status)}`, "success");
      applications.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not update the application",
        "danger",
      );
    }
  };

  const changeTab = (next: string) => {
    setTab(next);
    setPage(1);
  };

  const stageTotal = STAGES.reduce((sum, stage) => sum + (counts[stage] ?? 0), 0) || 1;

  return (
    <Page>
      <HeroSplit
        src="https://cdn1.angisoft.co.ke/mboqara/images/mboqara/team-meeting.webp"
        alt="A team in a working meeting"
        eyebrow="Pipeline"
        priority
        title="Applications"
        description="Every role you have moved on, the stage each one reached, and what it needs next."
        actions={
          <Link href="/followups">
            <Button variant="outline" size="sm" icon={<CheckCircle2 size={14} />}>
              Schedule follow-ups
            </Button>
          </Link>
        }
        stats={[
          { label: "Tracked", value: total.toLocaleString(), hint: "applications" },
          { label: "Interviews", value: (counts.INTERVIEW ?? 0).toLocaleString(), hint: "in progress" },
          { label: "Offers", value: (counts.OFFER ?? 0).toLocaleString(), hint: "on the table" },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="font-mono text-[0.56rem] tracking-[0.18em] text-app-muted uppercase">
              {stat.label}
            </dt>
            <dd className="mt-1.5 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums text-app-text">
              {stat.value}
            </dd>
            <dd className="mt-1 text-[0.7rem] text-app-muted">{stat.hint}</dd>
          </div>
        ))}
      />

      <Panel className="grid grid-cols-2 gap-px bg-app-border/60 sm:grid-cols-3 lg:grid-cols-6">
        {STAGES.map((stage) => {
          const count = counts[stage] ?? 0;
          const percent = Math.round((count / stageTotal) * 100);
          return (
            <button
              key={stage}
              type="button"
              onClick={() => changeTab(stage)}
              className={cx(
                "bg-app-elevated px-4 py-4 text-left transition-colors duration-150 hover:bg-app-surface-2",
                tab === stage && "bg-app-accent-soft",
              )}
            >
              <p className="font-mono text-[0.58rem] tracking-[0.16em] text-app-muted uppercase">
                {titleCase(stage)}
              </p>
              <p className="mt-2 font-display text-[1.7rem] leading-none font-semibold tabular-nums text-app-text">
                {count.toLocaleString()}
              </p>
              <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-app-surface-2">
                <span
                  className={cx("block h-full rounded-full", stageBar(stage))}
                  style={{ width: `${Math.max(percent, count > 0 ? 6 : 0)}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[0.62rem] tabular-nums text-app-muted">
                {percent}%
              </p>
            </button>
          );
        })}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.62rem] tracking-[0.16em] text-app-muted uppercase">
          Showing
        </span>
        <button
          type="button"
          onClick={() => changeTab("all")}
          className={cx(
            "rounded-app-sm border px-2 py-1 text-[0.76rem] transition-colors duration-150",
            tab === "all"
              ? "border-app-accent/40 bg-app-accent-soft text-app-text"
              : "border-app-border text-app-muted hover:text-app-soft",
          )}
        >
          All stages · {total.toLocaleString()}
        </button>
        {tab !== "all" ? (
          <button
            type="button"
            onClick={() => changeTab("all")}
            className="font-mono text-[0.7rem] text-app-muted underline decoration-app-border underline-offset-2 hover:text-app-soft"
          >
            clear
          </button>
        ) : null}
      </div>

      {applications.error && items.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} />}
          title="Could not load your pipeline"
          description={applications.error}
          action={
            <Button variant="outline" onClick={() => applications.refresh()}>
              Try again
            </Button>
          }
        />
      ) : applications.loading && items.length === 0 ? (
        <Panel className="divide-y divide-app-border">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-4 px-5 py-5">
              <Skeleton height={40} width={40} />
              <div className="flex-1">
                <Skeleton height={14} width="40%" />
                <div className="mt-2">
                  <Skeleton height={11} width="60%" />
                </div>
              </div>
            </div>
          ))}
        </Panel>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<EmptyPipelineArt />}
          title={tab === "all" ? "Nothing here yet" : `No ${titleCase(tab).toLowerCase()} applications`}
          description="Start an application from any opportunity and it will show up here."
          action={
            <Link href="/opportunities">
              <Button size="sm">Browse opportunities</Button>
            </Link>
          }
        />
      ) : (
        <Panel>
          <div className="hidden grid-cols-[minmax(0,1fr)_140px_170px_140px] gap-4 border-b border-app-border px-5 py-2.5 lg:grid">
            {["Role", "Stage", "Updated", "Next"].map((label) => (
              <span
                key={label}
                className="font-mono text-[0.58rem] tracking-[0.16em] text-app-muted uppercase"
              >
                {label}
              </span>
            ))}
          </div>
          <Rows>
            {visible.map((application) => (
              <Row key={application.id} className="items-center gap-4 py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_140px_170px_140px]">
                <div className="flex min-w-0 items-center gap-3">
                  <CompanyMark name={application.companyName} size={38} />
                  <div className="min-w-0">
                    <Link
                      href={`/applications/${application.id}`}
                      className="block truncate text-[0.94rem] font-medium text-app-text hover:text-app-accent"
                    >
                      {application.opportunityTitle ?? "Opportunity"}
                    </Link>
                    <p className="truncate text-[0.75rem] text-app-muted">
                      {application.companyName ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 lg:block">
                  <Badge tone={stageTone(application.status)} dot>
                    {titleCase(application.status)}
                  </Badge>
                </div>

                <p className="font-mono text-[0.72rem] text-app-muted">
                  {formatDateTime(application.updatedAt)}
                </p>

                <div className="flex items-center gap-1.5">
                  <Link href={`/applications/${application.id}?guided=1`}>
                    <Button variant="outline" size="sm" icon={<Sparkles size={13} />}>
                      Continue
                    </Button>
                  </Link>
                  <Link
                    href={`/applications/${application.id}`}
                    aria-label="Open application"
                    className="inline-grid size-8 place-items-center rounded-app-md text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
                  >
                    <ArrowUpRight size={15} />
                  </Link>
                </div>

                <div className="w-full lg:hidden">
                  <Select
                    className="w-full"
                    value={application.status}
                    onChange={(event) =>
                      void updateStatus(application, event.target.value as ApplicationStatus)
                    }
                    aria-label="Application status"
                  >
                    {[
                      application.status,
                      ...(APPLICATION_STATUS_TRANSITIONS[application.status] ?? []),
                    ].map((stage) => (
                      <option key={stage} value={stage}>
                        {titleCase(stage)}
                      </option>
                    ))}
                  </Select>
                </div>
              </Row>
            ))}
          </Rows>
        </Panel>
      )}

      {visible.length > 0 ? (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      ) : null}
    </Page>
  );
}

function stageTone(status: string) {
  if (status === "OFFER") return "success" as const;
  if (status === "INTERVIEW") return "accent" as const;
  if (status === "APPLIED") return "info" as const;
  if (status === "REJECTED" || status === "WITHDRAWN") return "danger" as const;
  return "neutral" as const;
}

function stageBar(status: string) {
  if (status === "OFFER") return "bg-app-success";
  if (status === "INTERVIEW") return "bg-app-accent";
  if (status === "APPLIED") return "bg-app-info";
  if (status === "REJECTED" || status === "WITHDRAWN") return "bg-app-danger";
  return "bg-app-muted";
}
