"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CheckCircle2, ListChecks } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
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
}

export default function FollowUpsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("PENDING");
  const followups = useApi<FollowUpsResponse>("/followups");

  const items = followups.data?.items ?? [];
  const visible = tab === "all" ? items : items.filter((item) => item.status === tab);

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
    { key: "PENDING", label: "Pending", count: items.filter((i) => i.status === "PENDING").length },
    { key: "COMPLETED", label: "Completed", count: items.filter((i) => i.status === "COMPLETED").length },
    { key: "CANCELLED", label: "Cancelled", count: items.filter((i) => i.status === "CANCELLED").length },
    { key: "all", label: "All", count: items.length },
  ];

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div>
        <div className="eyebrow">Follow-ups</div>
        <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
          Never chase twice
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
          We remind you when an application needs chasing. You decide whether and how to reply.
        </p>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {followups.loading ? (
        <div className="stack">
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={28} />}
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
        <div className="stack" style={{ gap: "0.55rem" }}>
          {visible.map((item) => (
            <Card key={item.id} style={{ padding: "0.85rem 1rem" }}>
              <div className="row row-wrap" style={{ gap: "1rem" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="row row-wrap" style={{ gap: "0.4rem", marginBottom: 4 }}>
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
                    <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      due {relativeTime(item.dueAt)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.92rem", fontWeight: 600 }}>{item.opportunityTitle}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {item.companyName}
                    {item.note ? ` · ${item.note}` : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: "0.4rem" }}>
                  <span className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
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
          ))}
        </div>
      )}
    </div>
  );
}
