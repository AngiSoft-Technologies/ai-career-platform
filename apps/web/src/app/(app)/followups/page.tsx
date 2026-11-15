"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CheckCircle2, ListChecks } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  Skeleton,
  Tabs,
  useToast,
} from "@/components/ui";
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
  const count = (query: { data: FollowUpsResponse | null }, status: string): number =>
    status === tab ? total : (query.data?.total ?? 0);

  const update = async (followup: FollowUp, status: string) => {
    try {
      await api.patch(`/followups/${followup.id}`, { status });
      toast.push(`Marked ${titleCase(status)}`, "success");
      followups.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not update the follow-up",
        "danger",
      );
    }
  };

  const tabs = [
    {
      key: "PENDING",
      label: "Pending",
      count: count(pendingCount, "PENDING"),
    },
    {
      key: "COMPLETED",
      label: "Completed",
      count: count(completedCount, "COMPLETED"),
    },
    {
      key: "CANCELLED",
      label: "Cancelled",
      count: count(cancelledCount, "CANCELLED"),
    },
    { key: "all", label: "All", count: count(allCount, "all") },
  ];

  const changeTab = (next: string) => {
    setTab(next);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Follow-ups"
        title="Never chase twice"
        description="We remind you when an application needs chasing. You decide whether and how to reply."
        actions={
          <Link href="/applications">
            <Button variant="outline" size="sm" icon={<CalendarClock size={14} />}>
              Open applications
            </Button>
          </Link>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={changeTab} />

      {followups.error && items.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={26} />}
          title="Could not load your follow-ups"
          description={followups.error}
          action={
            <Button variant="outline" onClick={() => followups.refresh()}>
              Try again
            </Button>
          }
        />
      ) : followups.loading && items.length === 0 ? (
        <div className="flex flex-col gap-2.5">
          <Skeleton height={76} />
          <Skeleton height={76} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={26} />}
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
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            item.status === "COMPLETED"
                              ? "success"
                              : item.status === "PENDING"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {titleCase(item.status)}
                        </Badge>
                        <Badge tone="neutral">{titleCase(item.channel)}</Badge>
                        <span className="text-[0.73rem] text-app-muted">
                          due {relativeTime(item.dueAt)}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-[0.94rem] font-semibold text-app-text">
                        <Link
                          href={`/applications/${item.applicationId}`}
                          className="hover:text-app-accent"
                        >
                          {item.opportunityTitle}
                        </Link>
                      </h3>
                      <p className="text-[0.8rem] text-app-muted">
                        {item.companyName}
                        {item.note ? ` · ${item.note}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[0.73rem] text-app-muted">
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
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}