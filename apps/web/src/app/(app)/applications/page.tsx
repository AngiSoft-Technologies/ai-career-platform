"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Radar,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Tabs,
  cx,
  useToast,
} from "@/components/ui";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Pipeline"
        title="Applications"
        description={`${total.toLocaleString()} tracked · every move you made, in one timeline.`}
        actions={
          <Link href="/followups">
            <Button variant="outline" size="sm" icon={<CheckCircle2 size={14} />}>
              Schedule follow-ups
            </Button>
          </Link>
        }
      />

      <Tabs
        tabs={[
          { key: "all", label: "All", count: total },
          ...STAGES.map((stage) => ({
            key: stage,
            label: titleCase(stage),
            count: counts[stage] ?? 0,
          })),
        ]}
        active={tab}
        onChange={changeTab}
      />

      {applications.error && items.length === 0 ? (
        <EmptyState
          icon={<Radar size={26} />}
          title="Could not load your pipeline"
          description={applications.error}
          action={
            <Button variant="outline" onClick={() => applications.refresh()}>
              Try again
            </Button>
          }
        />
      ) : applications.loading && items.length === 0 ? (
        <div className="flex flex-col gap-2.5">
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={26} />}
          title={tab === "all" ? "Nothing here yet" : `No ${titleCase(tab).toLowerCase()} applications`}
          description="Start an application from any opportunity and it will show up here."
          action={
            <Link href="/opportunities">
              <Button size="sm">Browse opportunities</Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((application) => (
            <li key={application.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={stageTone(application.status)}>
                        {titleCase(application.status)}
                      </Badge>
                      <span className="text-[0.73rem] text-app-muted">
                        updated {formatDateTime(application.updatedAt)}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-[0.98rem] font-semibold text-app-text">
                      {application.opportunityTitle ?? "Opportunity"}
                    </h3>
                    <p className="mt-0.5 text-[0.8rem] text-app-muted">
                      {application.companyName ?? "—"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      className="w-[170px]"
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
                    <Link href={`/applications/${application.id}?guided=1`}>
                      <Button variant="outline" size="sm" icon={<Radar size={13} />}>
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
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {visible.length > 0 ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}

function stageTone(status: string) {
  if (status === "OFFER") return "success" as const;
  if (status === "INTERVIEW") return "accent" as const;
  if (status === "APPLIED") return "info" as const;
  if (status === "REJECTED" || status === "WITHDRAWN") return "danger" as const;
  return "neutral" as const;
}
