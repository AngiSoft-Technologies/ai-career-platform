"use client";

import Link from "next/link";
import {
  Bell,
  Briefcase,
  CalendarClock,
  CheckCheck,
  FileText,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Page,
  PageHeader,
  Panel,
  Rows,
  Skeleton,
  StatStrip,
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

const TYPE_ICON: Record<string, LucideIcon> = {
  application: Briefcase,
  document: FileText,
  followup: CalendarClock,
  match: Sparkles,
  system: Settings2,
};

const TYPE_LABEL: Record<string, string> = {
  application: "Application",
  document: "Document",
  followup: "Follow-up",
  match: "Match",
  system: "System",
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

  const byType = (type: string) => items.filter((item) => item.type === type).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Notifications"
        title="What changed"
        description="Application moves, generated documents and scheduled follow-ups. Read on one device, read everywhere."
        art={{
          src: "https://cdn1.angisoft.co.ke/mboqara/images/mboqara/careers/lagos-career-story.webp",
          alt: "A candidate reading updates on a laptop",
          caption: "Read everywhere",
        }}
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
      />

      <StatStrip
        items={[
          {
            label: "Unread",
            value: unread.toLocaleString(),
            hint: unread === 0 ? "you are caught up" : "waiting for you",
          },
          {
            label: "Applications",
            value: byType("application").toLocaleString(),
            hint: "on this page",
          },
          {
            label: "Follow-ups",
            value: byType("followup").toLocaleString(),
            hint: "on this page",
          },
        ]}
      />

      {notifications.loading && items.length === 0 ? (
        <Panel className="divide-y divide-app-border">
          <Skeleton height={84} />
          <Skeleton height={84} />
          <Skeleton height={84} />
        </Panel>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={22} />}
          title="Nothing yet"
          description="Track an application or generate a document and the update will show up here."
          action={
            <Link href="/applications">
              <Button size="sm">Open applications</Button>
            </Link>
          }
        />
      ) : (
        <Panel>
          <Rows>
            {items.map((item) => {
              const Icon = TYPE_ICON[item.type] ?? Bell;
              return (
                <Link
                  key={item.id}
                  href={TYPE_ROUTE[item.type] ?? "/dashboard"}
                  className={cx(
                    "group relative flex items-start gap-4 px-5 py-4 transition-colors duration-150 hover:bg-app-surface-2/40",
                    !item.isRead && "bg-app-accent-soft/25",
                  )}
                >
                  {!item.isRead ? (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-6 w-[2px] -translate-y-1/2 rounded-full bg-app-accent"
                    />
                  ) : null}
                  <span
                    className={cx(
                      "mt-0.5 grid size-9 shrink-0 place-items-center rounded-app-sm border",
                      item.isRead
                        ? "border-app-border bg-app-surface-2 text-app-muted"
                        : "border-app-accent/40 bg-app-accent-soft text-app-accent",
                    )}
                    aria-hidden
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          "text-[0.9rem]",
                          item.isRead ? "font-normal text-app-soft" : "font-medium text-app-text",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="font-mono text-[0.66rem] text-app-muted">
                        {relativeTime(item.createdAt)}
                      </span>
                    </p>
                    {item.body ? (
                      <p className="mt-1 max-w-[70ch] text-[0.8rem] leading-relaxed text-app-muted">
                        {item.body}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone="neutral" className="hidden sm:inline-flex">
                    {TYPE_LABEL[item.type] ?? item.type}
                  </Badge>
                </Link>
              );
            })}
          </Rows>
        </Panel>
      )}
    </Page>
  );
}
