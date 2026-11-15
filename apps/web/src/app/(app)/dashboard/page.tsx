"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Building2,
  FileText,
  Globe2,
  ListChecks,
  Radar,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  BarList,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  MatchRing,
  Meter,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatTile,
  Td,
  Th,
  cx,
  type Tone,
} from "@/components/ui";
import { useSession } from "@/components/session";
import { useApi } from "@/lib/hooks";
import { formatDate, formatNumber, formatSalary, relativeTime, titleCase } from "@/lib/format";
import type {
  AdminStats,
  Application,
  FollowUp,
  JobDocument,
  JobSource,
  Opportunity,
  Profile,
} from "@/lib/types";

interface MatchesResponse {
  items: Opportunity[];
  total: number;
}

interface ApplicationsResponse {
  items: Application[];
}

interface FollowUpsResponse {
  items: FollowUp[];
}

interface DocumentsResponse {
  documents: JobDocument[];
}

interface SourcesResponse {
  items: JobSource[];
}

interface ProfileResponse {
  profile: Profile;
}

export default function DashboardPage() {
  const { primaryRole } = useSession();

  switch (primaryRole) {
    case "analyst":
      return <AnalystDashboard />;
    case "moderator":
      return <ModeratorDashboard />;
    case "support_agent":
      return <SupportDashboard />;
    case "source_curator":
      return <CuratorDashboard />;
    case "automation":
      return <AutomationDashboard />;
    case "admin":
    case "super_admin":
      return <AdminDashboard />;
    default:
      return <SeekerDashboard />;
  }
}

/* ========================================================================== */
/* Shared frame                                                               */
/* ========================================================================== */

function DashboardFrame({
  eyebrow,
  title,
  description,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
      />
      {children}
    </div>
  );
}

/** A compact, two-column section that collapses on small screens. */
function Split({
  main,
  side,
  flip = false,
}: {
  main: React.ReactNode;
  side: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div
      className={cx(
        "grid items-start gap-4",
        flip
          ? "lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
          : "lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]",
      )}
    >
      <div className={cx("flex min-w-0 flex-col gap-4", flip && "lg:order-2")}>{main}</div>
      <div className={cx("flex min-w-0 flex-col gap-4", flip && "lg:order-1")}>{side}</div>
    </div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/* ========================================================================== */
/* Job seeker                                                                 */
/* ========================================================================== */

function SeekerDashboard() {
  const matches = useApi<MatchesResponse>("/matches", { limit: 6 });
  const applications = useApi<ApplicationsResponse>("/applications");
  const followups = useApi<FollowUpsResponse>("/followups");
  const profile = useApi<ProfileResponse>("/profile");

  const top = matches.data?.items ?? [];
  const pipeline = applications.data?.items ?? [];
  const pending = followups.data?.items?.filter((item) => item.status === "PENDING") ?? [];
  const profileValue = profile.data?.profile;

  const completeness = profileValue?.skills?.length
    ? Math.min(100, 20 + profileValue.skills.length * 6)
    : 20;

  return (
    <DashboardFrame
      eyebrow="Your radar"
      title={
        profileValue?.name
          ? `Good to see you, ${profileValue.name.split(" ")[0]}`
          : "Your radar"
      }
      description="Roles ranked against your profile, your pipeline, and what needs a decision next."
      actions={
        <>
          <Link href="/profile">
            <Button variant="outline" icon={<FileText size={15} />}>
              Complete profile
            </Button>
          </Link>
          <Link href="/opportunities">
            <Button icon={<Radar size={15} />}>Browse roles</Button>
          </Link>
        </>
      }
    >
      <StatGrid>
        <StatTile
          label="Ranked roles"
          value={matches.data ? formatNumber(matches.data.total) : "—"}
          hint="in your match pool"
          tone="accent"
          icon={<Sparkles size={15} />}
        />
        <StatTile
          label="Applications"
          value={formatNumber(pipeline.length)}
          hint="tracked"
          icon={<Briefcase size={15} />}
        />
        <StatTile
          label="Follow-ups due"
          value={formatNumber(pending.length)}
          tone={pending.length > 0 ? "warning" : "success"}
          icon={<ListChecks size={15} />}
        />
        <StatTile
          label="Profile strength"
          value={`${completeness}%`}
          tone={completeness >= 70 ? "success" : "warning"}
          icon={<BadgeCheck size={15} />}
        />
      </StatGrid>

      <Split
        main={
          <Card className="p-4 sm:p-5">
            <SectionTitle
              eyebrow="Highest match"
              title="Start here"
              description="Strongest alignment with your skills, location and seniority."
              action={
                <Link href="/opportunities">
                  <Button variant="ghost" size="sm" icon={<ArrowUpRight size={14} />}>
                    All roles
                  </Button>
                </Link>
              }
            />

            {matches.loading ? (
              <div className="mt-4 flex flex-col gap-2.5">
                <Skeleton height={68} />
                <Skeleton height={68} />
                <Skeleton height={68} />
              </div>
            ) : top.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={<Sparkles size={24} />}
                  title="No ranked roles yet"
                  description="Complete your profile and we will rank every opening we monitor against it."
                  action={
                    <Link href="/profile">
                      <Button size="sm">Complete profile</Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {top.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/opportunities/${item.id}`}
                      className="group flex items-center gap-3 rounded-app-md border border-app-border bg-app-surface-2/40 p-3 transition-[border-color,background] duration-150 hover:border-app-border-strong hover:bg-app-surface-2"
                    >
                      <MatchRing score={item.match?.score ?? 0} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.93rem] font-semibold text-app-text">
                          {item.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.78rem] text-app-muted">
                          <span>{item.companyName}</span>
                          <span aria-hidden>·</span>
                          <span>{item.city || item.country}</span>
                          <span aria-hidden>·</span>
                          <span>{titleCase(item.workMode)}</span>
                        </p>
                      </div>
                      <ArrowUpRight
                        size={15}
                        className="shrink-0 text-app-muted transition-colors duration-150 group-hover:text-app-accent"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        }
        side={
          <>
            <Card className="p-4">
              <SectionTitle eyebrow="Pipeline" title="Applications" />
              <div className="mt-3 flex flex-col gap-3">
                {(["SHORTLISTED", "APPLIED", "INTERVIEW", "OFFER"] as const).map((stage) => {
                  const count = pipeline.filter((item) => item.status === stage).length;
                  return (
                    <div key={stage}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-[0.8rem] text-app-soft">{titleCase(stage)}</span>
                        <span className="font-mono text-[0.76rem] tabular-nums text-app-muted">
                          {count}
                        </span>
                      </div>
                      <Meter value={count} max={Math.max(pipeline.length, 1)} />
                    </div>
                  );
                })}
              </div>
              <Link href="/applications" className="mt-4 block">
                <Button variant="ghost" size="sm" className="w-full">
                  View applications
                </Button>
              </Link>
            </Card>

            <Card className="p-4">
              <SectionTitle eyebrow="Next actions" title="Follow-ups" />
              <div className="mt-3 flex flex-col gap-2">
                {pending.length === 0 ? (
                  <p className="text-[0.82rem] leading-relaxed text-app-muted">
                    Nothing due. We will remind you when an application needs chasing.
                  </p>
                ) : (
                  pending.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-app-md border border-app-border bg-app-surface-2/40 px-3 py-2"
                    >
                      <p className="truncate text-[0.82rem] font-semibold text-app-text">
                        {item.opportunityTitle}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-[0.72rem] text-app-muted">
                          {item.companyName}
                        </span>
                        <Badge tone="warning">{relativeTime(item.dueAt)}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle eyebrow="Coverage" title="Where we are looking" />
              <div className="mt-3">
                <BarList
                  items={[
                    { label: "Remote", value: 48, hint: "48" },
                    { label: "Hybrid", value: 31, hint: "31" },
                    { label: "On site", value: 22, hint: "22" },
                    { label: "Internships", value: 14, hint: "14" },
                  ]}
                />
              </div>
              <Link href="/opportunities" className="mt-4 block">
                <Button variant="ghost" size="sm" className="w-full">
                  Filter by work mode
                </Button>
              </Link>
            </Card>
          </>
        }
      />
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Analyst                                                                    */
/* ========================================================================== */

function scoreTone(score: number): Tone {
  if (score >= 80) return "success";
  if (score >= 60) return "accent";
  if (score >= 40) return "warning";
  return "danger";
}

function AnalystDashboard() {
  const stats = useApi<AdminStats>("/admin/stats");
  const sources = useApi<SourcesResponse>("/sources");
  const matches = useApi<MatchesResponse>("/matches", { limit: 10 });

  const rows = matches.data?.items ?? [];

  return (
    <DashboardFrame
      eyebrow="Analytics"
      title="Platform telemetry"
      description="Match distribution, source yield and pipeline movement across every monitored source."
      actions={
        <Link href="/admin">
          <Button variant="outline" size="sm" icon={<TrendingUp size={14} />}>
            Full analytics
          </Button>
        </Link>
      }
    >
      <StatGrid>
        <StatTile
          label="Active opportunities"
          value={formatNumber(stats.data?.totals.activeOpportunities ?? 0)}
          delta="live"
          tone="success"
        />
        <StatTile label="Applications" value={formatNumber(stats.data?.totals.applications ?? 0)} />
        <StatTile
          label="Monitored sources"
          value={formatNumber(stats.data?.totals.sources ?? 0)}
          delta="24h"
          tone="accent"
        />
        <StatTile label="Events (24h)" value={formatNumber(stats.data?.totals.events24h ?? 0)} tone="info" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle eyebrow="Distribution" title="Opportunities by country" />
          <div className="mt-4">
            {stats.loading ? (
              <Skeleton height={140} />
            ) : (
              <BarList
                items={(stats.data?.opportunitiesByCountry ?? []).slice(0, 8).map((entry) => ({
                  label: entry.country,
                  value: entry.count,
                  hint: String(entry.count),
                }))}
              />
            )}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle eyebrow="Risk" title="Fraud risk distribution" />
          <div className="mt-4">
            {stats.loading ? (
              <Skeleton height={140} />
            ) : (
              <BarList
                items={(stats.data?.riskDistribution ?? []).map((entry) => ({
                  label: titleCase(entry.risk_action),
                  value: entry.count,
                  hint: `${entry.count} · avg ${entry.avg_score ?? 0}`,
                }))}
              />
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle eyebrow="Ranked output" title="Match distribution" />
        <div className="mt-3">
          <DataTable>
            <thead>
              <tr>
                <Th>Role</Th>
                <Th>Company</Th>
                <Th>Country</Th>
                <Th>Mode</Th>
                <Th>Salary</Th>
                <Th>Score</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-app-surface-2/40">
                  <Td>
                    <Link
                      href={`/opportunities/${item.id}`}
                      className="font-semibold text-app-text hover:text-app-accent"
                    >
                      {item.title}
                    </Link>
                  </Td>
                  <Td>{item.companyName}</Td>
                  <Td className="font-mono text-[0.78rem]">{item.country}</Td>
                  <Td className="font-mono text-[0.78rem]">{item.workMode}</Td>
                  <Td className="font-mono text-[0.78rem]">
                    {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
                  </Td>
                  <Td>
                    <Badge tone={scoreTone(item.match?.score ?? 0)}>
                      {Math.round(item.match?.score ?? 0)}
                    </Badge>
                  </Td>
                </tr>
              ))}
              {!rows.length && !matches.loading ? (
                <tr>
                  <Td colSpan={6} className="py-8 text-center text-app-muted">
                    No ranked output yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle eyebrow="Source yield" title="Registered sources" />
        <div className="mt-3">
          <DataTable>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Health</Th>
                <Th>Jobs</Th>
                <Th>Next check</Th>
              </tr>
            </thead>
            <tbody>
              {(sources.data?.items ?? []).slice(0, 12).map((source) => (
                <tr key={source.id} className="transition-colors hover:bg-app-surface-2/40">
                  <Td className="font-semibold text-app-text">{source.name}</Td>
                  <Td className="font-mono text-[0.78rem]">{source.type}</Td>
                  <Td>
                    <Badge tone={source.status === "verified" ? "success" : "warning"}>
                      {source.status}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-[0.78rem]">{source.health}</Td>
                  <Td className="font-mono text-[0.78rem]">{formatNumber(source.discoveredCount)}</Td>
                  <Td className="font-mono text-[0.78rem]">{relativeTime(source.nextCheckAt)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Moderator                                                                  */
/* ========================================================================== */

function ModeratorDashboard() {
  const held = useApi<{ items: Opportunity[] }>("/opportunities/held", { limit: 12 });
  const queue = held.data?.items ?? [];
  const publishedToday = useApi<{ totals: { activeOpportunities: number } }>("/stats");

  return (
    <DashboardFrame
      eyebrow="Trust and safety"
      title="Moderation queue"
      description="Every posting is scored before it reaches candidates. Review what the model flagged."
      actions={
        <Link href="/moderation">
          <Button size="sm" icon={<BadgeCheck size={14} />}>
            Open full queue
          </Button>
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Awaiting review" value={queue.length} tone="warning" />
        <StatTile
          label="Flagged by model"
          value={queue.filter((item) => item.riskScore && item.riskScore > 0).length}
          tone="danger"
        />
        <StatTile
          label="Published today"
          value={publishedToday.data?.totals.activeOpportunities ?? 0}
          tone="success"
        />
      </div>

      {queue.length === 0 ? (
        <EmptyState
          icon={<BadgeCheck size={26} />}
          title="The queue is clear"
          description="Nothing needs a human decision right now."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {queue.slice(0, 6).map((item, index) => (
            <Card key={item.id} as="article" className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-[240px] flex-1">
                  <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
                    {index === 0 ? "Lead item" : `Item ${String(index + 1).padStart(2, "0")}`} ·{" "}
                    {item.country} · {formatDate(item.postedAt)}
                  </p>
                  <h2 className="mt-1.5 text-[1.2rem] leading-snug font-semibold text-app-text">
                    {item.title}
                  </h2>
                  <p className="mt-1 text-[0.85rem] text-app-soft">
                    {item.companyName} · {titleCase(item.city || item.country)} ·{" "}
                    {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
                  </p>
                  {item.riskFlags?.length ? (
                    <blockquote className="mt-3 border-l-2 border-app-accent pl-3 text-[0.84rem] text-app-muted italic">
                      {item.riskFlags.join(" · ")}
                    </blockquote>
                  ) : (
                    <p className="mt-3 text-[0.84rem] leading-relaxed text-app-muted">
                      {item.description.slice(0, 220)}
                      {item.description.length > 220 ? "…" : ""}
                    </p>
                  )}
                </div>
                <div className="flex min-w-[140px] flex-col items-stretch gap-2">
                  <Badge tone={scoreTone(100 - (item.riskScore ?? 0))}>
                    Risk {Math.round(item.riskScore ?? 0)}
                  </Badge>
                  <Link href={`/opportunities/${item.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      Review
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Support                                                                    */
/* ========================================================================== */

function SupportDashboard() {
  const applications = useApi<ApplicationsResponse>("/applications");
  const followups = useApi<FollowUpsResponse>("/followups");
  const connections = useApi<{ items: Array<{ id: string; provider: string; status: string }> }>(
    "/connections",
  );

  const cases = applications.data?.items ?? [];
  const stuck = followups.data?.items?.filter((item) => item.status !== "COMPLETED") ?? [];
  const channels = connections.data?.items ?? [];

  return (
    <DashboardFrame
      eyebrow="Support"
      title="Candidate cases"
      description="Where a candidate is blocked, which channel failed, and what needs a human response."
      actions={
        <Link href="/support">
          <Button size="sm">Open case queue</Button>
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Open cases" value={cases.length} tone="accent" />
        <StatTile label="Pending follow-ups" value={stuck.length} tone="warning" />
        <StatTile label="Connected channels" value={channels.length} tone="success" />
      </div>

      <Split
        main={
          <Card className="p-4">
            <SectionTitle eyebrow="Case list" title="Latest cases" />
            <ul className="mt-3 flex flex-col gap-2">
              {cases.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-app-md border border-app-border bg-app-surface-2/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.84rem] font-semibold text-app-text">
                      Application {item.id.slice(0, 8)}
                    </p>
                    <p className="text-[0.72rem] text-app-muted">
                      updated {relativeTime(item.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={item.status === "OFFER" ? "success" : "neutral"}>{item.status}</Badge>
                </li>
              ))}
              {!cases.length && !applications.loading ? (
                <li className="text-[0.84rem] text-app-muted">No open cases.</li>
              ) : null}
            </ul>
          </Card>
        }
        side={
          <Card className="p-4">
            <SectionTitle eyebrow="Channels" title="Messaging connections" />
            <div className="mt-3 flex flex-col gap-2">
              {["gmail", "whatsapp", "linkedin", "github"].map((provider) => {
                const active = channels.find((item) => item.provider === provider);
                return (
                  <div
                    key={provider}
                    className="flex items-center justify-between gap-3 rounded-app-md border border-app-border px-3 py-2"
                  >
                    <span className="text-[0.82rem] text-app-soft capitalize">{provider}</span>
                    <Badge tone={active ? "success" : "neutral"}>
                      {active ? active.status : "not linked"}
                    </Badge>
                  </div>
                );
              })}
            </div>
            <Link href="/connections" className="mt-4 block">
              <Button variant="outline" size="sm" className="w-full">
                Manage connections
              </Button>
            </Link>
          </Card>
        }
      />
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Source curator                                                             */
/* ========================================================================== */

function CuratorDashboard() {
  const sources = useApi<SourcesResponse>("/sources");
  const stats = useApi<AdminStats>("/admin/stats");
  const queue = useApi<SourcesResponse>("/sources/queue");

  const items = sources.data?.items ?? [];
  const pending = queue.data?.items ?? [];
  const healthy = items.filter((item) => item.health === "healthy").length;
  const totalJobs = items.reduce((sum, item) => sum + (item.discoveredCount ?? 0), 0);

  return (
    <DashboardFrame
      eyebrow="Source cartography"
      title="Coverage"
      description="Every board, API and ATS we monitor, where it is healthy, and which gaps are still open."
      actions={
        <Link href="/sources">
          <Button size="sm" icon={<Globe2 size={15} />}>
            Manage sources
          </Button>
        </Link>
      }
    >
      <StatGrid>
        <StatTile label="Registered sources" value={items.length} tone="accent" />
        <StatTile label="Healthy" value={healthy} tone="success" />
        <StatTile label="Jobs discovered" value={formatNumber(totalJobs)} />
        <StatTile label="Awaiting verification" value={pending.length} tone="warning" />
      </StatGrid>

      <Split
        main={
          <Card className="p-4">
            <SectionTitle eyebrow="Network" title="Source register" />
            <div className="mt-3">
              <DataTable>
                <thead>
                  <tr>
                    <Th>Source</Th>
                    <Th>Adapter</Th>
                    <Th>Status</Th>
                    <Th>Yield</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 14).map((source) => (
                    <tr key={source.id} className="transition-colors hover:bg-app-surface-2/40">
                      <Td>
                        <p className="font-semibold text-app-text">{source.name}</p>
                        <p className="truncate text-[0.7rem] text-app-muted">{source.url}</p>
                      </Td>
                      <Td className="font-mono text-[0.78rem]">{source.adapter ?? source.kind}</Td>
                      <Td>
                        <Badge
                          tone={
                            source.status === "verified"
                              ? "success"
                              : source.status === "rejected"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {source.status}
                        </Badge>
                      </Td>
                      <Td className="font-mono text-[0.78rem]">{formatNumber(source.discoveredCount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </Card>
        }
        side={
          <>
            <Card className="p-4">
              <SectionTitle eyebrow="Gaps" title="Where we are thin" />
              <div className="mt-3">
                <BarList
                  items={(stats.data?.sourcesByType ?? []).map((entry) => ({
                    label: titleCase(entry.type),
                    value: entry.jobs,
                    hint: `${entry.count} sources`,
                  }))}
                />
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle eyebrow="Intake" title="Verification queue" />
              <div className="mt-3 flex flex-col gap-2">
                {pending.length === 0 ? (
                  <p className="text-[0.82rem] leading-relaxed text-app-muted">
                    Nothing waiting. Candidates can submit new sources from the web app.
                  </p>
                ) : (
                  pending.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[0.82rem] text-app-soft">{item.name}</span>
                      <Badge tone="warning">pending</Badge>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </>
        }
      />
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Automation                                                                 */
/* ========================================================================== */

function AutomationDashboard() {
  const stats = useApi<AdminStats>("/admin/stats");
  const sources = useApi<SourcesResponse>("/sources");

  const totalYield = (sources.data?.items ?? []).reduce(
    (sum, item) => sum + (item.discoveredCount ?? 0),
    0,
  );

  return (
    <DashboardFrame
      eyebrow="Automation runtime"
      title="Pipeline throughput"
      description="Source checks, ingestion runs and document generation moving through the system right now."
      actions={
        <Link href="/automation">
          <Button size="sm" icon={<Activity size={15} />}>
            Open automations
          </Button>
        </Link>
      }
    >
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-app-accent bg-app-accent p-5">
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-app-accent-contrast/80 uppercase">
            Jobs ingested
          </p>
          <p className="mt-1 text-[clamp(2.2rem,7vw,3.4rem)] leading-none font-bold tabular-nums text-app-accent-contrast">
            {formatNumber(totalYield)}
          </p>
          <p className="mt-2 text-[0.8rem] text-app-accent-contrast/85">
            all time across {sources.data?.items.length ?? 0} sources
          </p>
        </Card>

        <Card className="border-app-accent-2 bg-app-accent-2 p-5">
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-app-accent-contrast/80 uppercase">
            Events (24h)
          </p>
          <p className="mt-1 text-[clamp(2.2rem,7vw,3.4rem)] leading-none font-bold tabular-nums text-app-accent-contrast">
            {formatNumber(stats.data?.totals.events24h ?? 0)}
          </p>
          <p className="mt-2 text-[0.8rem] text-app-accent-contrast/85">across the event bus</p>
        </Card>

        <Card className="p-5">
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-app-muted uppercase">
            AI tasks recorded
          </p>
          <p className="mt-1 text-[clamp(2.2rem,7vw,3.4rem)] leading-none font-bold tabular-nums text-app-text">
            {formatNumber(stats.data?.totals.aiTasks ?? 0)}
          </p>
          <p className="mt-2 text-[0.8rem] text-app-muted">latency, tokens and cost per task</p>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle eyebrow="Schedules" title="Source check cadence" />
        <div className="mt-3">
          <DataTable>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Every</Th>
                <Th>Last run</Th>
                <Th>Next run</Th>
                <Th>Reliability</Th>
              </tr>
            </thead>
            <tbody>
              {(sources.data?.items ?? []).slice(0, 12).map((source) => (
                <tr key={source.id} className="transition-colors hover:bg-app-surface-2/40">
                  <Td className="font-semibold text-app-text">{source.name}</Td>
                  <Td className="font-mono text-[0.78rem]">{source.checkFrequencyMinutes}m</Td>
                  <Td className="font-mono text-[0.78rem]">{relativeTime(source.lastCheckedAt)}</Td>
                  <Td className="font-mono text-[0.78rem]">{relativeTime(source.nextCheckAt)}</Td>
                  <Td className="font-mono text-[0.78rem]">
                    {Math.round(source.reliability * 100)}%
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Admin                                                                      */
/* ========================================================================== */

function AdminDashboard() {
  const stats = useApi<AdminStats>("/admin/stats");
  const roles = useApi<{
    roles: Array<{ id: string; name: string; description: string }>;
    permissions: Array<{ name: string; description: string }>;
    assignments: Array<{ user_id: string; email: string; role: string }>;
  }>("/admin/roles");
  const users = useApi<{ items: Array<{ id: string; email: string; name: string; roles: string[] }> }>(
    "/admin/users",
  );

  return (
    <DashboardFrame
      eyebrow="Control room"
      title="Platform administration"
      description="Access control, fraud calibration and system health across the whole MboQara estate."
      actions={
        <Link href="/admin">
          <Button size="sm" icon={<ShieldAlert size={15} />}>
            Manage access
          </Button>
        </Link>
      }
    >
      <StatGrid>
        <StatTile label="Users" value={formatNumber(stats.data?.totals.users ?? 0)} icon={<Users size={15} />} />
        <StatTile
          label="Opportunities"
          value={formatNumber(stats.data?.totals.activeOpportunities ?? 0)}
          tone="accent"
        />
        <StatTile
          label="Applications"
          value={formatNumber(stats.data?.totals.applications ?? 0)}
          tone="success"
        />
        <StatTile label="Documents" value={formatNumber(stats.data?.totals.documents ?? 0)} tone="info" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle eyebrow="Roles" title="Access model" />
          <div className="mt-3 flex flex-col gap-2">
            {(roles.data?.roles ?? []).map((role) => (
              <div
                key={role.id}
                className="flex items-center justify-between gap-3 rounded-app-md border border-app-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[0.82rem] font-semibold text-app-text">
                    {role.name}
                  </p>
                  <p className="text-[0.72rem] text-app-muted">{role.description}</p>
                </div>
                <Badge tone="neutral">
                  {(roles.data?.assignments ?? []).filter((item) => item.role === role.name).length}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle eyebrow="Directory" title="Users" />
          <div className="mt-3">
            <DataTable>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Roles</Th>
                </tr>
              </thead>
              <tbody>
                {(users.data?.items ?? []).slice(0, 10).map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-app-surface-2/40">
                    <Td className="font-semibold text-app-text">{user.email}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(user.roles) ? user.roles : []).map((role) => (
                          <Badge key={role} tone="accent">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle eyebrow="Taxonomy" title="Profession coverage" />
        <div className="mt-4">
          <BarList
            items={(stats.data?.opportunitiesByCountry ?? []).slice(0, 10).map((entry) => ({
              label: entry.country,
              value: entry.count,
              hint: String(entry.count),
            }))}
          />
        </div>
      </Card>
    </DashboardFrame>
  );
}
