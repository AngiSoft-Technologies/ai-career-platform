"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  cx,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  items: Notification[];
  unreadCount: number;
  nextCursor: string | null;
}

const TYPE_ROUTE: Record<string, string> = {
  application: "/applications",
  document: "/documents",
  followup: "/followups",
  match: "/matches",
  system: "/dashboard",
};

export default function NotificationsPage() {
  const toast = useToast();
  const notifications = useApi<NotificationsResponse>("/me/notifications");
  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unreadCount ?? 0;

  const markAllRead = async () => {
    try {
      await api.post("/me/notifications/read", {});
      notifications.refresh();
      window.dispatchEvent(new Event("jr:notifications"));
      toast.push("All notifications marked read", "success");
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not mark notifications read",
        "danger",
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Notifications"
        title="What changed"
        description="Application moves, generated documents and scheduled follow-ups. Read on one device, read everywhere."
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCheck size={14} />}
            onClick={() => void markAllRead()}
            disabled={unread === 0}
          >
            Mark all read
          </Button>
        }
        meta={
          unread > 0 ? (
            <Badge tone="accent">
              {unread} unread
            </Badge>
          ) : null
        }
      />

      {notifications.loading && items.length === 0 ? (
        <div className="flex flex-col gap-2.5">
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={26} />}
          title="Nothing yet"
          description="Track an application or generate a document and the update will show up here."
          action={
            <Link href="/applications">
              <Button size="sm">Open applications</Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={TYPE_ROUTE[item.type] ?? "/dashboard"}
                className={cx(
                  "block rounded-app-lg border bg-app-surface p-4 transition-[border-color,background] duration-150",
                  item.isRead
                    ? "border-app-border opacity-75 hover:opacity-100"
                    : "border-app-accent/40 bg-app-accent-soft/20 hover:border-app-accent/70",
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.isRead ? "neutral" : "accent"}>{item.type}</Badge>
                      <span className="text-[0.73rem] text-app-muted">
                        {relativeTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[0.92rem] font-semibold text-app-text">
                      {item.title}
                    </p>
                    {item.body ? (
                      <p className="mt-0.5 text-[0.81rem] leading-relaxed text-app-muted">
                        {item.body}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
