"use client";

import Link from "next/link";
import { useMemo } from "react";
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
  EmptyState,
  MatchRing,
  Meter,
  SectionTitle,
  Skeleton,
  StatTile,
  cx,
  type Tone,
} from "@/components/ui";
import { useSession } from "@/components/session";
import { useTheme } from "@/components/theme";
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
    <div className="stack" style={{ gap: "1.4rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="display" style={{ fontSize: "clamp(1.7rem, 4vw, 2.6rem)", marginTop: 4 }}>
            {title}
          </h1>
          {description ? (
            <p style={{ color: "var(--text-muted)", marginTop: 6, maxWidth: 640, fontSize: "0.92rem" }}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="row row-wrap">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/* ========================================================================== */
/* Job seeker — bento                                                         */
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

  return (
    <DashboardFrame
      eyebrow="Your radar"
      title={
        profileValue?.name
          ? `Good to see you, ${profileValue.name.split(" ")[0]}`
          : "Your radar"
      }
      description="Roles ranked against your profile, your application pipeline, and what needs your attention next."
      actions={
        <>
          <Link href="/profile">
            <Button variant="outline" icon={<FileText size={15} />}>
              Complete profile
            </Button>
          </Link>
          <Link href="/opportunities">
            <Button icon={<Radar size={15} />}>Browse jobs</Button>
          </Link>
        </>
      }
    >
      <div className="bento">
        <Card className="span-8" style={{ gridColumn: "span 8", padding: "1.2rem" }} hover>
          <SectionTitle
            eyebrow="Highest match"
            title="Start here"
            description="Strongest alignment with your skills, location and seniority."
          />
          {matches.loading ? (
            <div className="stack" style={{ marginTop: "1rem" }}>
              <Skeleton height={68} />
              <Skeleton height={68} />
            </div>
          ) : top.length === 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <EmptyState
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
            <div className="stack" style={{ marginTop: "1rem", gap: "0.55rem" }}>
              {top.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  href={`/opportunities/${item.id}`}
                  className="surface-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.9rem",
                    padding: "0.8rem 0.9rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <MatchRing score={item.match?.score ?? 0} size={52} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{item.title}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {item.companyName} · {item.city || item.country} · {titleCase(item.workMode)}
                    </div>
                  </div>
                  <ArrowUpRight size={16} style={{ color: "var(--text-muted)" }} />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ gridColumn: "span 4", padding: "1.2rem" }}>
          <SectionTitle eyebrow="Pipeline" title="Your applications" />
          <div className="stack" style={{ marginTop: "1rem", gap: "0.6rem" }}>
            {["SHORTLISTED", "APPLIED", "INTERVIEW", "OFFER"].map((stage) => {
              const count = pipeline.filter((item) => item.status === stage).length;
              return (
                <div key={stage}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: "0.82rem" }}>{titleCase(stage)}</span>
                    <span className="mono" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {count}
                    </span>
                  </div>
                  <Meter value={count} max={Math.max(pipeline.length, 1)} />
                </div>
              );
            })}
          </div>
          <Link href="/applications" className="btn btn-ghost btn-sm" style={{ marginTop: "1rem", width: "100%" }}>
            View all applications
          </Link>
        </Card>

        <Card style={{ gridColumn: "span 4", padding: "1.2rem" }}>
          <SectionTitle eyebrow="Next actions" title="Follow-ups" />
          <div className="stack" style={{ marginTop: "1rem", gap: "0.5rem" }}>
            {pending.length === 0 ? (
              <p style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                Nothing due. We will remind you when an application needs chasing.
              </p>
            ) : (
              pending.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "0.6rem 0.7rem",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: "0.84rem", fontWeight: 600 }}>{item.opportunityTitle}</div>
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      {item.companyName}
                    </span>
                    <Badge tone="warning">{relativeTime(item.dueAt)}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card style={{ gridColumn: "span 4", padding: "1.2rem" }}>
          <SectionTitle eyebrow="Profile strength" title="How well we can match you" />
          <div style={{ marginTop: "1rem" }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: "0.84rem" }}>Completeness</span>
              <span className="mono" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                {profileValue?.skills?.length ? Math.min(100, 20 + profileValue.skills.length * 6) : 20}%
              </span>
            </div>
            <Meter value={profileValue?.skills?.length ? Math.min(100, 20 + profileValue.skills.length * 6) : 20} />
            <ul
              style={{
                marginTop: "0.9rem",
                paddingLeft: "1.1rem",
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                lineHeight: 1.7,
              }}
            >
              <li>Add a headline so we can tailor suggestions</li>
              <li>List your location for geo-matching</li>
              <li>Add years of experience</li>
            </ul>
          </div>
          <Link href="/profile" className="btn btn-outline btn-sm" style={{ marginTop: "1rem", width: "100%" }}>
            Improve profile
          </Link>
        </Card>

        <Card style={{ gridColumn: "span 4", padding: "1.2rem" }}>
          <SectionTitle eyebrow="Coverage" title="Where we are looking" />
          <div style={{ marginTop: "1rem" }}>
            <BarList
              items={[
                { label: "Remote roles", value: 48, hint: "48" },
                { label: "Hybrid roles", value: 31, hint: "31" },
                { label: "On-site roles", value: 22, hint: "22" },
                { label: "Internships", value: 14, hint: "14" },
              ]}
            />
          </div>
          <Link href="/opportunities" className="btn btn-ghost btn-sm" style={{ marginTop: "1rem", width: "100%" }}>
            Filter by work mode
          </Link>
        </Card>
      </div>
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Analyst — dense console                                                   */
/* ========================================================================== */

function AnalystDashboard() {
  const stats = useApi<AdminStats>("/admin/stats");
  const sources = useApi<SourcesResponse>("/sources");
  const matches = useApi<MatchesResponse>("/matches", { limit: 10 });

  const rows = matches.data?.items ?? [];

  return (
    <DashboardFrame
      eyebrow="analytics :: overview"
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
      <div className="grid-4">
        <StatTile label="Active opportunities" value={formatNumber(stats.data?.totals.activeOpportunities ?? 0)} delta="live" tone="success" />
        <StatTile label="Applications" value={formatNumber(stats.data?.totals.applications ?? 0)} />
        <StatTile label="Monitored sources" value={formatNumber(stats.data?.totals.sources ?? 0)} delta="24h" tone="accent" />
        <StatTile label="Events (24h)" value={formatNumber(stats.data?.totals.events24h ?? 0)} tone="info" />
      </div>

      <div className="grid-2">
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="distribution" title="Opportunities by country" />
          <div style={{ marginTop: "1rem" }}>
            {stats.loading ? (
              <Skeleton height={140} />
            ) : (
              <BarList
                items={(stats.data?.opportunitiesByCountry ?? []).map((entry) => ({
                  label: entry.country,
                  value: entry.count,
                  hint: String(entry.count),
                }))}
              />
            )}
          </div>
        </Card>

        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="risk" title="Fraud risk distribution" />
          <div style={{ marginTop: "1rem" }}>
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

      <Card style={{ padding: "0" }}>
        <div style={{ padding: "1.1rem 1.1rem 0.6rem" }}>
          <SectionTitle eyebrow="ranked output" title="Match distribution" />
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Company</th>
                <th>Country</th>
                <th>Mode</th>
                <th>Salary</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/opportunities/${item.id}`}>
                      <strong>{item.title}</strong>
                    </Link>
                  </td>
                  <td>{item.companyName}</td>
                  <td className="mono">{item.country}</td>
                  <td className="mono">{item.workMode}</td>
                  <td className="mono">
                    {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
                  </td>
                  <td>
                    <Badge tone={scoreTone(item.match?.score ?? 0)}>
                      {Math.round(item.match?.score ?? 0)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {!rows.length && !matches.loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem" }}>
                    No ranked output yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle eyebrow="source yield" title="Registered sources" />
        <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Status</th>
                <th>Health</th>
                <th>Jobs</th>
                <th>Next check</th>
              </tr>
            </thead>
            <tbody>
              {(sources.data?.items ?? []).slice(0, 12).map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.name}</strong>
                  </td>
                  <td className="mono">{source.type}</td>
                  <td>
                    <Badge tone={source.status === "verified" ? "success" : "warning"}>
                      {source.status}
                    </Badge>
                  </td>
                  <td className="mono">{source.health}</td>
                  <td className="mono">{formatNumber(source.discoveredCount)}</td>
                  <td className="mono">{relativeTime(source.nextCheckAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardFrame>
  );
}

function scoreTone(score: number): Tone {
  if (score >= 80) return "success";
  if (score >= 60) return "accent";
  if (score >= 40) return "warning";
  return "danger";
}

/* ========================================================================== */
/* Moderator — editorial queue                                                */
/* ========================================================================== */

function ModeratorDashboard() {
  const opportunities = useApi<{ items: Opportunity[] }>("/opportunities", { limit: 12 });

  const flagged = (opportunities.data?.items ?? []).filter(
    (item) => (item.riskScore ?? 0) > 0,
  );
  const queue = flagged.length > 0 ? flagged : opportunities.data?.items ?? [];

  return (
    <DashboardFrame
      eyebrow="The moderation desk"
      title="Queue"
      description="Every posting is scored before it reaches candidates. Review what the model flagged."
      actions={
        <Link href="/moderation">
          <Button size="sm">Open full queue</Button>
        </Link>
      }
    >
      <div className="grid-3">
        <StatTile label="Awaiting review" value={queue.length} tone="warning" />
        <StatTile label="Flagged by model" value={flagged.length} tone="danger" />
        <StatTile label="Published today" value={opportunities.data?.items.length ?? 0} tone="success" />
      </div>

      {queue.length === 0 ? (
        <EmptyState title="The queue is clear" description="Nothing needs a human decision right now." />
      ) : (
        <div className="stack" style={{ gap: "1.1rem" }}>
          {queue.slice(0, 6).map((item, index) => (
            <Card
              key={item.id}
              as="article"
              style={{
                padding: "1.2rem 1.4rem",
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto",
                gap: "1.2rem",
                alignItems: "start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow">
                  {index === 0 ? "Lead item" : `Item ${String(index + 1).padStart(2, "0")}`} ·{" "}
                  {item.country} · {formatDate(item.postedAt)}
                </div>
                <h2 style={{ fontSize: "1.25rem", marginTop: 6 }}>{item.title}</h2>
                <p style={{ color: "var(--text-soft)", fontSize: "0.88rem", marginTop: 4 }}>
                  {item.companyName} · {titleCase(item.city || item.country)} ·{" "}
                  {formatSalary(item.salaryMin, item.salaryMax, item.currency)}
                </p>
                {item.riskFlags?.length ? (
                  <blockquote
                    style={{
                      margin: "0.8rem 0 0",
                      paddingLeft: "0.9rem",
                      borderLeft: "2px solid var(--accent)",
                      color: "var(--text-muted)",
                      fontSize: "0.86rem",
                      fontStyle: "italic",
                    }}
                  >
                    {item.riskFlags.join(" · ")}
                  </blockquote>
                ) : (
                  <p
                    style={{
                      margin: "0.8rem 0 0",
                      color: "var(--text-muted)",
                      fontSize: "0.86rem",
                    }}
                  >
                    {item.description.slice(0, 220)}
                    {item.description.length > 220 ? "…" : ""}
                  </p>
                )}
              </div>
              <div className="stack" style={{ gap: "0.5rem", minWidth: 150 }}>
                <Badge tone={scoreTone(100 - (item.riskScore ?? 0))}>
                  Risk {Math.round(item.riskScore ?? 0)}
                </Badge>
                <Link href={`/opportunities/${item.id}`}>
                  <Button variant="outline" size="sm" style={{ width: "100%" }}>
                    Review
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Support — split pane                                                      */
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
      eyebrow="Support console"
      title="Candidate cases"
      description="Where a candidate is blocked, which channel failed, and what needs a human response."
      actions={
        <Link href="/support">
          <Button size="sm">Open case queue</Button>
        </Link>
      }
    >
      <div className="grid-3">
        <StatTile label="Open cases" value={cases.length} tone="accent" />
        <StatTile label="Pending follow-ups" value={stuck.length} tone="warning" />
        <StatTile label="Connected channels" value={channels.length} tone="success" />
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)" }}>
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="case list" title="Latest cases" />
          <div className="stack" style={{ marginTop: "0.9rem", gap: "0.45rem" }}>
            {cases.map((item) => (
              <div
                key={item.id}
                className="row"
                style={{
                  justifyContent: "space-between",
                  padding: "0.65rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.86rem", fontWeight: 600 }}>
                    Application {item.id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                    updated {relativeTime(item.updatedAt)}
                  </div>
                </div>
                <Badge tone={item.status === "OFFER" ? "success" : "neutral"}>{item.status}</Badge>
              </div>
            ))}
            {!cases.length && !applications.loading ? (
              <p style={{ fontSize: "0.86rem", color: "var(--text-muted)" }}>No open cases.</p>
            ) : null}
          </div>
        </Card>

        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="channels" title="Messaging connections" />
          <div className="stack" style={{ marginTop: "0.9rem", gap: "0.5rem" }}>
            {["gmail", "whatsapp", "linkedin", "github"].map((provider) => {
              const active = channels.find((item) => item.provider === provider);
              return (
                <div
                  key={provider}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    padding: "0.55rem 0.7rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span style={{ fontSize: "0.84rem", textTransform: "capitalize" }}>{provider}</span>
                  <Badge tone={active ? "success" : "neutral"}>{active ? active.status : "not linked"}</Badge>
                </div>
              );
            })}
          </div>
          <Link href="/connections" className="btn btn-outline btn-sm" style={{ marginTop: "1rem", width: "100%" }}>
            Manage connections
          </Link>
        </Card>
      </div>
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Source curator — coverage map                                              */
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
      <div className="grid-4">
        <StatTile label="Registered sources" value={items.length} tone="accent" />
        <StatTile label="Healthy" value={healthy} tone="success" />
        <StatTile label="Jobs discovered" value={formatNumber(totalJobs)} />
        <StatTile label="Awaiting verification" value={pending.length} tone="warning" />
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)" }}>
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="network" title="Source register" />
          <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Adapter</th>
                  <th>Status</th>
                  <th>Yield</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 14).map((source) => (
                  <tr key={source.id}>
                    <td>
                      <strong>{source.name}</strong>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{source.url}</div>
                    </td>
                    <td className="mono">{source.adapter ?? source.kind}</td>
                    <td>
                      <Badge tone={source.status === "verified" ? "success" : source.status === "rejected" ? "danger" : "warning"}>
                        {source.status}
                      </Badge>
                    </td>
                    <td className="mono">{formatNumber(source.discoveredCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="stack">
          <Card style={{ padding: "1.1rem" }}>
            <SectionTitle eyebrow="gaps" title="Where we are thin" />
            <div style={{ marginTop: "0.9rem" }}>
              <BarList
                items={(stats.data?.sourcesByType ?? []).map((entry) => ({
                  label: titleCase(entry.type),
                  value: entry.jobs,
                  hint: `${entry.count} sources`,
                }))}
              />
            </div>
          </Card>

          <Card style={{ padding: "1.1rem" }}>
            <SectionTitle eyebrow="intake" title="Verification queue" />
            <div className="stack" style={{ marginTop: "0.9rem", gap: "0.5rem" }}>
              {pending.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Nothing waiting. Candidates can submit new sources from the web app.
                </p>
              ) : (
                pending.map((item) => (
                  <div key={item.id} className="row" style={{ justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.84rem" }}>{item.name}</span>
                    <Badge tone="warning">pending</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Automation — kinetic counters                                              */
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
      <div className="grid-3">
        <Card style={{ padding: "1.4rem", background: "var(--accent)", borderColor: "var(--accent)" }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.8)" }}>
            Jobs ingested
          </div>
          <div
            className="display"
            style={{ fontSize: "clamp(2.4rem, 8vw, 4rem)", color: "#fff", marginTop: 4 }}
          >
            {formatNumber(totalYield)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.82rem" }}>
            all time across {sources.data?.items.length ?? 0} sources
          </div>
        </Card>

        <Card style={{ padding: "1.4rem", background: "var(--accent-2)", borderColor: "var(--accent-2)" }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.8)" }}>
            Events (24h)
          </div>
          <div
            className="display"
            style={{ fontSize: "clamp(2.4rem, 8vw, 4rem)", color: "#fff", marginTop: 4 }}
          >
            {formatNumber(stats.data?.totals.events24h ?? 0)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.82rem" }}>
            across the event bus
          </div>
        </Card>

        <Card style={{ padding: "1.4rem" }}>
          <div className="eyebrow">AI tasks recorded</div>
          <div className="display" style={{ fontSize: "clamp(2.4rem, 8vw, 4rem)", marginTop: 4 }}>
            {formatNumber(stats.data?.totals.aiTasks ?? 0)}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
            latency, tokens and cost per task
          </div>
        </Card>
      </div>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle eyebrow="schedules" title="Source check cadence" />
        <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Every</th>
                <th>Last run</th>
                <th>Next run</th>
                <th>Reliability</th>
              </tr>
            </thead>
            <tbody>
              {(sources.data?.items ?? []).slice(0, 12).map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.name}</strong>
                  </td>
                  <td className="mono">{source.checkFrequencyMinutes}m</td>
                  <td className="mono">{relativeTime(source.lastCheckedAt)}</td>
                  <td className="mono">{relativeTime(source.nextCheckAt)}</td>
                  <td className="mono">{Math.round(source.reliability * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardFrame>
  );
}

/* ========================================================================== */
/* Admin — operations control                                                 */
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
      description="Access control, fraud calibration and system health across the whole Job Radar estate."
      actions={
        <Link href="/admin">
          <Button size="sm" icon={<ShieldAlert size={15} />}>
            Manage access
          </Button>
        </Link>
      }
    >
      <div className="grid-4">
        <StatTile label="Users" value={formatNumber(stats.data?.totals.users ?? 0)} />
        <StatTile label="Opportunities" value={formatNumber(stats.data?.totals.activeOpportunities ?? 0)} tone="accent" />
        <StatTile label="Applications" value={formatNumber(stats.data?.totals.applications ?? 0)} tone="success" />
        <StatTile label="Documents" value={formatNumber(stats.data?.totals.documents ?? 0)} tone="info" />
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="roles" title="Access model" />
          <div className="stack" style={{ marginTop: "0.9rem", gap: "0.5rem" }}>
            {(roles.data?.roles ?? []).map((role) => (
              <div
                key={role.id}
                className="row"
                style={{
                  justifyContent: "space-between",
                  gap: "0.8rem",
                  padding: "0.55rem 0.7rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                    {role.name}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                    {role.description}
                  </div>
                </div>
                <Badge tone="neutral">
                  {(roles.data?.assignments ?? []).filter((item) => item.role === role.name).length}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="directory" title="Users" />
          <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Roles</th>
                </tr>
              </thead>
              <tbody>
                {(users.data?.items ?? []).slice(0, 10).map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.email}</strong>
                    </td>
                    <td>
                      <div className="row row-wrap" style={{ gap: "0.25rem" }}>
                        {(user.roles ?? []).map((role) => (
                          <Badge key={role} tone="accent">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle eyebrow="taxonomy" title="Profession coverage" />
        <div style={{ marginTop: "0.9rem" }}>
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
