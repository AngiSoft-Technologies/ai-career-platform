"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CheckCircle2, ListChecks } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Page,
  Pagination,
  Panel,
  Rows,
  Row,
  Skeleton,
  Tabs,
  StatStrip,
  cx,
  useToast,
} from "@/components/ui";
import { HeroSplit } from "@/components/app-art";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime, titleCase } from "@/lib/format";
import type { FollowUp } from "@/lib/types";

interface FollowUpsResponse {
  items: FollowUp[];
  total: number;
}

const PAGE_SIZE = 20;

const STATUSES = ["PENDING", "COMPLETED", "CANCELLED"] as const;

export default function FollowUpsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("PENDING");
  const [page, setPage] = useState(1);

  // The stage is filtered by the database, and the page number rides with
  // it. The tabs' counts come from the same filter asked for one row at a
  // time — the total is the answer, not the page — so a queue past the old
  // 300-row cap still counts correctly.
  const status = tab === "all" ? undefined : tab;
  const followups = useApi<FollowUpsResponse>("/followups", {
    status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pendingCount = useApi<FollowUpsResponse>("/followups", {
    status: "PENDING",
    limit: 1,
  });
  const completedCount = useApi<FollowUpsResponse>("/followups", {
    status: "COMPLETED",
    limit: 1,
  });
  const cancelledCount = useApi<FollowUpsResponse>("/followups", {
    status: "CANCELLED",
    limit: 1,
  });
  const allCount = useApi<FollowUpsResponse>("/followups", { limit: 1 });

  const items = followups.data?.items ?? [];
  const total = followups.data?.total ?? 0;

  // The count a tab shows: the active tab's own page total (the request
  // that made the list), and the one-row total for every other stage.
  const count = (query: { data: FollowUpsResponse | null }, stage: string): number =>
    stage === tab ? total : (query.data?.total ?? 0);

  const update = async (followup: FollowUp, next: string) => {
    try {
      await api.patch(`/followups/${followup.id}`, { status: next });
      toast.push(`Marked ${titleCase(next)}`, "success");
      followups.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not update the follow-up",
        "danger",
      );
    }
  };

  const tabs = [
    { key: "PENDING", label: "Pending", count: count(pendingCount, "PENDING") },
    { key: "COMPLETED", label: "Completed", count: count(completedCount, "COMPLETED") },
    { key: "CANCELLED", label: "Cancelled", count: count(cancelledCount, "CANCELLED") },
    { key: "all", label: "All", count: count(allCount, "all") },
  ];

  const changeTab = (next: string) => {
    setTab(next);
    setPage(1);
  };

  // Overdue is the only thing on this page that can cost an opportunity, so
  // it is the only thing that gets colour.
  const overdue = items.filter(
    (item) => item.status === "PENDING" && new Date(item.dueAt).getTime() < Date.now(),
  ).length;

  return (
    <Page>
      <HeroSplit
        src="https://cdn.angisoft.co.ke/public/images/mboqara/mobile-worker.webp"
        alt="A professional working from a phone"
        eyebrow="Follow-ups"
        priority
        title="Never chase twice"
        description="We remind you when an application needs chasing. You decide whether and how to reply."
        actions={
          <Link href="/applications">
            <Button variant="outline" size="sm" icon={<CalendarClock size={14} />}>
              Open applications
            </Button>
          </Link>
        }
        stats={[
          {
            label: "Pending",
            value: count(pendingCount, "PENDING").toLocaleString(),
            hint: "waiting on you",
          },
          {
            label: "Overdue",
            value: overdue.toLocaleString(),
            hint: "past the due date",
          },
          {
            label: "Completed",
            value: count(completedCount, "COMPLETED").toLocaleString(),
            hint: "closed out",
          },
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

      <StatStrip
        items={[
          {
            label: "Pending",
            value: count(pendingCount, "PENDING"),
            hint: "waiting on you",
            active: tab === "PENDING",
            onSelect: () => changeTab("PENDING"),
          },
          {
            label: "Completed",
            value: count(completedCount, "COMPLETED"),
            hint: "closed out",
            active: tab === "COMPLETED",
            onSelect: () => changeTab("COMPLETED"),
          },
          {
            label: "Cancelled",
            value: count(cancelledCount, "CANCELLED"),
            hint: "no longer needed",
            active: tab === "CANCELLED",
            onSelect: () => changeTab("CANCELLED"),
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.62rem] tracking-[0.16em] text-app-muted uppercase">
          Stage
        </span>
        {[
          ...tabs.slice(0, 3),
          { key: "all", label: "Every follow-up", count: count(allCount, "all") },
        ].map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => changeTab(entry.key)}
            aria-pressed={tab === entry.key}
            className={cx(
              "rounded-app-sm border px-2 py-1 text-[0.76rem] transition-colors duration-150",
              tab === entry.key
                ? "border-app-accent/40 bg-app-accent-soft text-app-text"
                : "border-app-border text-app-muted hover:text-app-soft",
            )}
          >
            {entry.label} · {entry.count.toLocaleString()}
          </button>
        ))}
      </div>

      {followups.error && items.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={22} />}
          title="Could not load your follow-ups"
          description={followups.error}
          action={
            <Button variant="outline" onClick={() => followups.refresh()}>
              Try again
            </Button>
          }
        />
      ) : followups.loading && items.length === 0 ? (
        <Panel className="divide-y divide-app-border">
          <Skeleton height={76} />
          <Skeleton height={76} />
        </Panel>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={22} />}
          title="Nothing to chase"
          description="Schedule a follow-up from any application workspace and it will appear here."
          action={
            <Link href="/applications">
              <Button size="sm" icon={<CalendarClock size={14} />}>
                Open applications
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <Panel>
            <Rows>
              {items.map((item) => {
                const due = new Date(item.dueAt);
                const late =
                  item.status === "PENDING" && due.getTime() < Date.now();
                const today =
                  item.status === "PENDING" &&
                  due.toDateString() === new Date().toDateString();
                return (
                  <Row key={item.id} className="items-center gap-4 py-4">
                    <div
                      className={cx(
                        "hidden w-12 shrink-0 flex-col items-center justify-center rounded-app-sm border py-1.5 sm:flex",
                        late
                          ? "border-app-danger/40 bg-app-danger/10"
                          : today
                            ? "border-app-warning/40 bg-app-warning/10"
                            : "border-app-border bg-app-surface-2",
                      )}
                    >
                      <span
                        className={cx(
                          "font-mono text-[0.56rem] tracking-[0.12em] uppercase",
                          late ? "text-app-danger" : "text-app-muted",
                        )}
                      >
                        {due.toLocaleString("en-GB", { month: "short" })}
                      </span>
                      <span
                        className={cx(
                          "font-display text-[1.15rem] leading-none font-semibold tabular-nums",
                          late ? "text-app-danger" : "text-app-text",
                        )}
                      >
                        {due.getDate()}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          dot
                          tone={
                            item.status === "COMPLETED"
                              ? "success"
                              : late
                                ? "danger"
                                : item.status === "PENDING"
                                  ? "warning"
                                  : "neutral"
                          }
                        >
                          {item.status === "COMPLETED"
                            ? titleCase(item.status)
                            : late
                              ? "Overdue"
                              : today
                                ? "Due today"
                                : titleCase(item.status)}
                        </Badge>
                        <Badge tone="neutral">{titleCase(item.channel)}</Badge>
                        <span className="font-mono text-[0.68rem] text-app-muted">
                          due {relativeTime(item.dueAt)}
                        </span>
                      </div>
                      <h3 className="mt-1.5 truncate text-[0.94rem] font-medium text-app-text">
                        <Link
                          href={`/applications/${item.applicationId}`}
                          className="hover:text-app-accent"
                        >
                          {item.opportunityTitle}
                        </Link>
                      </h3>
                      <p className="truncate text-[0.76rem] text-app-muted">
                        {item.companyName}
                        {item.note ? ` · ${item.note}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="hidden font-mono text-[0.7rem] text-app-muted md:block">
                        {formatDateTime(item.dueAt)}
                      </span>
                      {item.status !== "COMPLETED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<CheckCircle2 size={13} />}
                          onClick={() => void update(item, "COMPLETED")}
                        >
                          Done
                        </Button>
                      ) : null}
                    </div>
                  </Row>
                );
              })}
            </Rows>
          </Panel>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </Page>
  );
}
