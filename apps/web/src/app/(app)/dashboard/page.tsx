"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Compass,
  FileText,
  Globe2,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  BarList,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Meter,
  Page,
  PageHeader,
  Panel,
  PanelHead,
  Rows,
  Row,
  ScoreBar,
  Skeleton,
  StatTile,
  Td,
  Th,
  cx,
  type Tone,
} from "@/components/ui";
import { CompanyMark, EmptySearchArt, HeroSplit } from "@/components/app-art";
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
  image,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  image?: { src: string; alt: string };
}) {
  if (image) {
    return (
      <Page>
        <HeroSplit
          src={image.src}
          alt={image.alt}
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={actions}
          priority
        />
        {children}
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      {children}
    </Page>
  );
}

function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 }) {
  return (
    <Panel
      variant="outline"
      className={cx(
        "grid gap-px divide-app-border bg-app-border/60 sm:grid-cols-2",
        cols === 4 ? "xl:grid-cols-4" : "sm:grid-cols-3",
      )}
    >
      {children}
    </Panel>
  );
}

/* ========================================================================== */
/* Job seeker                                                                 */
/* ========================================================================== */

function SeekerDashboard() {
  const matches = useApi<MatchesResponse>("/matches", { limit: 6 });
  const applications = useApi<ApplicationsResponse>("/applications");
  const followups = useApi<FollowUpsResponse>("/followups");
  const profile = useApi<ProfileResponse>("/profile");
  const documents = useApi<DocumentsResponse>("/documents");

  const top = matches.data?.items ?? [];
  const pipeline = applications.data?.items ?? [];
  const pending = followups.data?.items?.filter((item) => item.status === "PENDING") ?? [];
  const profileValue = profile.data?.profile;

  const completeness = profileValue?.skills?.length
    ? Math.min(100, 20 + profileValue.skills.length * 6)
    : 20;
  const firstName = profileValue?.name?.split(" ")[0];

  return (
    <Page>
      <HeroSplit
        src="https://cdn1.angisoft.co.ke/mboqara/images/mboqara/careers/technology-professional.webp"
        alt="A professional working at a laptop in a studio"
        eyebrow="MboQara · live"
        priority
        title={firstName ? `Good to see you, ${firstName}.` : "Your job search is live."}
        description="Every opening we monitor, ranked against your profile. Work the top of the list, then keep your pipeline moving."
        actions={
          <>
            <Link href="/opportunities">
              <Button icon={<Compass size={15} />}>Browse ranked roles</Button>
            </Link>
            <Link href="/profile">
              <Button
                variant="outline"
                icon={<FileText size={15} />}
              >
                Complete profile
              </Button>
            </Link>
          </>
        }
        badge={
          <div className="rounded-app-lg border border-white/15 bg-black/45 px-4 py-3 backdrop-blur-md">
            <p className="font-mono text-[0.56rem] tracking-[0.2em] text-white/60 uppercase">
              Profile strength
            </p>
            <p className="mt-1 font-display text-[1.75rem] leading-none font-semibold text-white">
              {completeness}%
            </p>
            <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
        }
        stats={[
          {
            label: "Ranked roles",
            value: matches.data ? formatNumber(matches.data.total) : "—",
            hint: "in your match pool",
          },
          {
            label: "Applications",
            value: formatNumber(pipeline.length),
            hint: "being tracked",
          },
          {
            label: "Follow-ups",
            value: formatNumber(pending.length),
            hint: pending.length ? "due now" : "nothing due",
          },
          {
            label: "Documents",
            value: formatNumber(documents.data?.documents.length ?? 0),
            hint: "ready to send",
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHead
              eyebrow="Highest match"
              title="Start with these"
              description="Strongest alignment with your skills, location and seniority this week."
              action={
                <Link href="/opportunities">
                  <Button variant="ghost" size="sm" icon={<ArrowUpRight size={14} />}>
                    All roles
                  </Button>
                </Link>
              }
            />

            {matches.loading ? (
              <div className="flex flex-col gap-2 px-5 pb-5">
                <Skeleton height={76} />
                <Skeleton height={76} />
                <Skeleton height={76} />
              </div>
            ) : top.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  icon={<EmptySearchArt />}
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
              <Rows className="border-t border-app-border">
                {top.slice(0, 5).map((item, index) => (
                  <Row key={item.id} as="div" className="items-center hover:bg-app-surface-2/40">
                    <span className="w-6 shrink-0 font-mono text-[0.7rem] tabular-nums text-app-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <CompanyMark name={item.companyName} size={40} className="rounded-app-md" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/opportunities/${item.id}`}
                        className="block truncate text-[0.98rem] leading-snug font-medium text-app-text hover:text-app-accent"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-app-muted">
                        <span className="text-app-soft">{item.companyName}</span>
                        <span aria-hidden>·</span>
                        <span>{item.city || item.country}</span>
                        <span aria-hidden>·</span>
                        <span>{titleCase(item.workMode)}</span>
                        {item.salaryMin ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{formatSalary(item.salaryMin, item.salaryMax, item.currency)}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                      <ScoreBar score={item.match?.score ?? 0} />
                      <span className="text-[0.68rem] text-app-muted">{relativeTime(item.postedAt)}</span>
                    </div>
                    <ArrowUpRight
                      size={15}
                      className="shrink-0 text-app-muted transition-colors duration-150 group-hover:text-app-accent"
                    />
                  </Row>
                ))}
              </Rows>
            )}
          </Panel>

          <Panel>
            <PanelHead
              eyebrow="Application kit"
              title="Your documents"
              description="A source CV, tailored editions and the cover letters that go with them."
              action={
                <Link href="/documents">
                  <Button variant="ghost" size="sm" icon={<ArrowUpRight size={14} />}>
                    Open kit
                  </Button>
                </Link>
              }
            />
            <Rows className="border-t border-app-border">
              {(documents.data?.documents ?? []).slice(0, 3).map((document) => (
                <Row key={document.id} className="items-center">
                  <span className="grid size-9 shrink-0 place-items-center rounded-app-sm border border-app-border bg-app-surface-2 text-app-accent">
                    <FileText size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/documents/${document.id}`}
                      className="block truncate text-[0.88rem] font-medium text-app-text hover:text-app-accent"
                    >
                      {document.title}
                    </Link>
                    <p className="text-[0.72rem] text-app-muted">
                      {document.type} · created {relativeTime(document.createdAt)}
                    </p>
                  </div>
                  <Badge tone="neutral">{document.type}</Badge>
                </Row>
              ))}
              {(documents.data?.documents ?? []).length === 0 && !documents.loading ? (
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5">
                  <p className="text-[0.84rem] text-app-muted">
                    Nothing generated yet. Pick a role and we will draft a CV from your profile.
                  </p>
                  <Link href="/documents">
                    <Button size="sm" icon={<FileText size={14} />}>
                      Generate a document
                    </Button>
                  </Link>
                </div>
              ) : null}
            </Rows>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHead eyebrow="Pipeline" title="Applications" />
            <div className="flex flex-col gap-3 px-5 pb-5">
              {(["SHORTLISTED", "APPLIED", "INTERVIEW", "OFFER"] as const).map((stage) => {
                const count = pipeline.filter((item) => item.status === stage).length;
                return (
                  <div key={stage}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-[0.8rem] text-app-soft">{titleCase(stage)}</span>
                      <span className="font-mono text-[0.74rem] tabular-nums text-app-muted">
                        {count}
                      </span>
                    </div>
                    <Meter value={count} max={Math.max(pipeline.length, 1)} />
                  </div>
                );
              })}
              <Link href="/applications" className="mt-1">
                <Button variant="outline" size="sm" className="w-full">
                  Open pipeline
                </Button>
              </Link>
            </div>
          </Panel>

          <Panel>
            <PanelHead eyebrow="Next actions" title="Follow-ups" />
            {pending.length === 0 ? (
              <p className="px-5 pb-5 text-[0.82rem] leading-relaxed text-app-muted">
                Nothing due. We will remind you when an application needs chasing.
              </p>
            ) : (
              <Rows className="border-t border-app-border">
                {pending.slice(0, 4).map((item) => (
                  <Row key={item.id} className="items-center gap-3">
                    <span className="size-1.5 shrink-0 rounded-full bg-app-warning" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.84rem] font-medium text-app-text">
                        {item.opportunityTitle}
                      </p>
                      <p className="truncate text-[0.72rem] text-app-muted">{item.companyName}</p>
                    </div>
                    <Badge tone="warning">{relativeTime(item.dueAt)}</Badge>
                  </Row>
                ))}
              </Rows>
            )}
          </Panel>

          <Panel>
            <PanelHead eyebrow="Coverage" title="Where we are looking" />
            <div className="px-5 pb-5">
              <BarList
                items={[
                  { label: "Remote", value: 48, hint: "48%" },
                  { label: "Hybrid", value: 31, hint: "31%" },
                  { label: "On site", value: 22, hint: "22%" },
                  { label: "Internships", value: 14, hint: "14%" },
                ]}
              />
            </div>
          </Panel>
        </div>
      </div>
    </Page>
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
      image={{ src: "https://cdn1.angisoft.co.ke/mboqara/images/mboqara/nairobi-skyline.webp", alt: "The Nairobi skyline at dusk" }}
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
        <StatTile
          label="Events (24h)"
          value={formatNumber(stats.data?.totals.events24h ?? 0)}
          tone="info"
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHead eyebrow="Distribution" title="Opportunities by country" />
          <div className="px-5 pb-5 pt-1">
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
        </Panel>

        <Panel>
          <PanelHead eyebrow="Risk" title="Fraud risk distribution" />
          <div className="px-5 pb-5 pt-1">
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
        </Panel>
      </div>

      <Panel>
        <PanelHead eyebrow="Ranked output" title="Match distribution" />
        <div className="px-1 pb-1">
          <DataTable className="rounded-none border-0 bg-transparent">
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
                      className="font-medium text-app-text hover:text-app-accent"
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
      </Panel>

      <Panel>
        <PanelHead eyebrow="Source yield" title="Registered sources" />
        <div className="px-1 pb-1">
          <DataTable className="rounded-none border-0 bg-transparent">
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
                  <Td className="font-medium text-app-text">{source.name}</Td>
                  <Td className="font-mono text-[0.78rem]">{source.type}</Td>
                  <Td>
                    <Badge tone={source.status === "verified" ? "success" : "warning"} dot>
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
      </Panel>
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
      <div className="grid gap-px overflow-hidden rounded-app-lg border border-app-border bg-app-border/60 sm:grid-cols-3">
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
        <Panel>
          <PanelHead
            eyebrow="Held for review"
            title="Lead item first"
            description="The model's ordering, with the reason it held each posting."
          />
          <Rows className="border-t border-app-border">
            {queue.slice(0, 6).map((item, index) => (
              <Row key={item.id} className="flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex w-full min-w-0 flex-1 gap-4">
                  <span className="w-6 shrink-0 font-mono text-[0.7rem] tabular-nums text-app-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <CompanyMark name={item.companyName} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                      {item.country} · {formatDate(item.postedAt)}
                    </p>
                    <h2 className="mt-1 text-[1.1rem] leading-snug font-medium text-app-text">
                      {item.title}
                    </h2>
                    <p className="mt-1 text-[0.82rem] text-app-soft">
                      {item.companyName} · {titleCase(item.city || item.country)} ·{" "}
                      {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
                    </p>
                    {item.riskFlags?.length ? (
                      <blockquote className="mt-3 border-l-2 border-app-warning pl-3 text-[0.82rem] text-app-muted italic">
                        {item.riskFlags.join(" · ")}
                      </blockquote>
                    ) : (
                      <p className="mt-3 max-w-prose text-[0.82rem] leading-relaxed text-app-muted">
                        {item.description.slice(0, 220)}
                        {item.description.length > 220 ? "…" : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-row items-center gap-2 sm:w-[150px] sm:flex-col sm:items-stretch">
                  <Badge tone={scoreTone(100 - (item.riskScore ?? 0))} dot>
                    Risk {Math.round(item.riskScore ?? 0)}
                  </Badge>
                  <Link href={`/opportunities/${item.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      Review
                    </Button>
                  </Link>
                </div>
              </Row>
            ))}
          </Rows>
        </Panel>
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
      <div className="grid gap-px overflow-hidden rounded-app-lg border border-app-border bg-app-border/60 sm:grid-cols-3">
        <StatTile label="Open cases" value={cases.length} tone="accent" />
        <StatTile label="Pending follow-ups" value={stuck.length} tone="warning" />
        <StatTile label="Connected channels" value={channels.length} tone="success" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Panel>
          <PanelHead eyebrow="Case list" title="Latest cases" />
          <Rows className="border-t border-app-border">
            {cases.map((item) => (
              <Row key={item.id} className="items-center">
                <span className="grid size-9 shrink-0 place-items-center rounded-app-sm border border-app-border bg-app-surface-2 text-app-muted">
                  <Briefcase size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.86rem] font-medium text-app-text">
                    Application {item.id.slice(0, 8)}
                  </p>
                  <p className="text-[0.72rem] text-app-muted">
                    updated {relativeTime(item.updatedAt)}
                  </p>
                </div>
                <Badge tone={item.status === "OFFER" ? "success" : "neutral"}>{item.status}</Badge>
              </Row>
            ))}
            {!cases.length && !applications.loading ? (
              <p className="px-5 py-6 text-[0.84rem] text-app-muted">No open cases.</p>
            ) : null}
          </Rows>
        </Panel>

        <Panel>
          <PanelHead eyebrow="Channels" title="Messaging connections" />
          <Rows className="border-t border-app-border">
            {["gmail", "whatsapp", "linkedin", "github"].map((provider) => {
              const active = channels.find((item) => item.provider === provider);
              return (
                <Row key={provider} className="items-center py-3">
                  <span className="flex-1 text-[0.82rem] text-app-soft capitalize">{provider}</span>
                  <Badge tone={active ? "success" : "neutral"} dot>
                    {active ? active.status : "not linked"}
                  </Badge>
                </Row>
              );
            })}
          </Rows>
          <div className="px-5 py-4">
            <Link href="/connections">
              <Button variant="outline" size="sm" className="w-full">
                Manage connections
              </Button>
            </Link>
          </div>
        </Panel>
      </div>
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Panel>
          <PanelHead eyebrow="Network" title="Source register" />
          <div className="px-1 pb-1">
            <DataTable className="rounded-none border-0 bg-transparent">
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
                      <p className="font-medium text-app-text">{source.name}</p>
                      <p className="truncate text-[0.7rem] text-app-muted">{source.url}</p>
                    </Td>
                    <Td className="font-mono text-[0.78rem]">{source.adapter ?? source.kind}</Td>
                    <Td>
                      <Badge
                        dot
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
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHead eyebrow="Gaps" title="Where we are thin" />
            <div className="px-5 pb-5 pt-1">
              <BarList
                items={(stats.data?.sourcesByType ?? []).map((entry) => ({
                  label: titleCase(entry.type),
                  value: entry.jobs,
                  hint: `${entry.count} sources`,
                }))}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHead eyebrow="Intake" title="Verification queue" />
            <Rows className="border-t border-app-border">
              {pending.length === 0 ? (
                <p className="px-5 py-5 text-[0.82rem] leading-relaxed text-app-muted">
                  Nothing waiting. Candidates can submit new sources from the web app.
                </p>
              ) : (
                pending.map((item) => (
                  <Row key={item.id} className="items-center py-3">
                    <span className="min-w-0 flex-1 truncate text-[0.82rem] text-app-soft">
                      {item.name}
                    </span>
                    <Badge tone="warning" dot>
                      pending
                    </Badge>
                  </Row>
                ))
              )}
            </Rows>
          </Panel>
        </div>
      </div>
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
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel variant="solid" className="bg-app-accent p-5 text-app-accent-contrast">
          <p className="font-mono text-[0.6rem] tracking-[0.18em] uppercase opacity-70">
            Jobs ingested
          </p>
          <p className="mt-3 font-display text-[clamp(2.4rem,6vw,3.6rem)] leading-none font-semibold tabular-nums">
            {formatNumber(totalYield)}
          </p>
          <p className="mt-3 text-[0.8rem] opacity-75">
            all time across {sources.data?.items.length ?? 0} sources
          </p>
        </Panel>

        <Panel variant="solid" className="p-5">
          <p className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
            Events (24h)
          </p>
          <p className="mt-3 font-display text-[clamp(2.4rem,6vw,3.6rem)] leading-none font-semibold tabular-nums text-app-text">
            {formatNumber(stats.data?.totals.events24h ?? 0)}
          </p>
          <p className="mt-3 text-[0.8rem] text-app-muted">across the event bus</p>
        </Panel>

        <Panel variant="solid" className="p-5">
          <p className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
            AI tasks recorded
          </p>
          <p className="mt-3 font-display text-[clamp(2.4rem,6vw,3.6rem)] leading-none font-semibold tabular-nums text-app-text">
            {formatNumber(stats.data?.totals.aiTasks ?? 0)}
          </p>
          <p className="mt-3 text-[0.8rem] text-app-muted">latency, tokens and cost per task</p>
        </Panel>
      </div>

      <Panel>
        <PanelHead eyebrow="Schedules" title="Source check cadence" />
        <div className="px-1 pb-1">
          <DataTable className="rounded-none border-0 bg-transparent">
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
                  <Td className="font-medium text-app-text">{source.name}</Td>
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
      </Panel>
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

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHead eyebrow="Roles" title="Access model" />
          <Rows className="border-t border-app-border">
            {(roles.data?.roles ?? []).map((role) => (
              <Row key={role.id} className="items-center py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[0.8rem] font-medium text-app-text">
                    {role.name}
                  </p>
                  <p className="truncate text-[0.72rem] text-app-muted">{role.description}</p>
                </div>
                <Badge tone="neutral">
                  {(roles.data?.assignments ?? []).filter((item) => item.role === role.name).length}
                </Badge>
              </Row>
            ))}
          </Rows>
        </Panel>

        <Panel>
          <PanelHead eyebrow="Directory" title="Users" />
          <div className="px-1 pb-1">
            <DataTable className="rounded-none border-0 bg-transparent">
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Roles</Th>
                </tr>
              </thead>
              <tbody>
                {(users.data?.items ?? []).slice(0, 10).map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-app-surface-2/40">
                    <Td className="font-medium text-app-text">{user.email}</Td>
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
        </Panel>
      </div>

      <Panel>
        <PanelHead eyebrow="Taxonomy" title="Profession coverage" />
        <div className="px-5 pb-5 pt-1">
          <BarList
            items={(stats.data?.opportunitiesByCountry ?? []).slice(0, 10).map((entry) => ({
              label: entry.country,
              value: entry.count,
              hint: String(entry.count),
            }))}
          />
        </div>
      </Panel>
    </DashboardFrame>
  );
}
