"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
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
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ gap: "1rem", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="eyebrow">Notifications</div>
          <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
            What changed
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Application moves, generated documents and scheduled follow-ups. Read on one device,
            read everywhere.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<CheckCheck size={14} />}
          onClick={() => void markAllRead()}
          disabled={unread === 0}
        >
          Mark all read
        </Button>
      </div>

      {notifications.loading ? (
        <div className="stack">
          <Skeleton height={76} />
          <Skeleton height={76} />
          <Skeleton height={76} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={28} />}
          title="Nothing yet"
          description="Track an application or generate a document and the update will show up here."
          action={
            <Link href="/applications">
              <Button size="sm">Open applications</Button>
            </Link>
          }
        />
      ) : (
        <div className="stack" style={{ gap: "0.55rem" }}>
          {items.map((item) => (
            <Link
              key={item.id}
              href={TYPE_ROUTE[item.type] ?? "/dashboard"}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              <Card
                style={{
                  padding: "0.85rem 1rem",
                  opacity: item.isRead ? 0.72 : 1,
                  borderLeft: item.isRead
                    ? "3px solid transparent"
                    : "3px solid var(--accent)",
                }}
              >
                <div className="row row-wrap" style={{ gap: "0.75rem" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div className="row row-wrap" style={{ gap: "0.4rem", marginBottom: 4 }}>
                      <Badge tone={item.isRead ? "neutral" : "accent"}>{item.type}</Badge>
                      <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        {relativeTime(item.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 600 }}>{item.title}</div>
                    {item.body ? (
                      <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        {item.body}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
