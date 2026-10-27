"use client";

import { useState } from "react";
import {
  Activity,
  Fingerprint,
  ShieldAlert,
  Tags,
  UserCog,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Select,
  Skeleton,
  StatTile,
  Tabs,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import { InvitationsPanel } from "./invitations-panel";

interface StatsResponse {
  totals: {
    users: number;
    activeOpportunities: number;
    applications: number;
    sources: number;
    documents: number;
    aiTasks: number;
    events24h: number;
  };
  opportunitiesByCountry: { country: string; count: number }[];
  sourcesByType: { type: string; count: number }[];
  riskDistribution: { risk_action: string; count: number }[];
  pipeline: { status: string; count: number }[];
}

interface RolesResponse {
  roles: { id: string; name: string; description?: string | null }[];
  permissions: { name: string; description?: string | null; resource?: string; action?: string }[];
  assignments: { user_id: string; role_id: string; role_name: string; expires_at?: string | null }[];
}

interface UsersResponse {
  items: { id: string; email: string; name?: string | null; created_at: string; roles: string[] }[];
  total: number;
}

interface TaxonomyResponse {
  professions: {
    id: string;
    slug: string;
    name: string;
    depth: number;
    domain?: string | null;
    aliases?: string[] | null;
    median_salary?: number | null;
    currency?: string | null;
    is_active: boolean;
  }[];
  closures: { ancestor: string; descendant: string; depth: number }[];
  opportunityLinks: { opportunity_id: string; slug: string; name: string; confidence: number }[];
}

interface ScamResponse {
  items: { id: string; simhash: string; label: string; sample_url?: string | null; created_at: string }[];
  total: number;
}

interface EventResponse {
  items: {
    id: number;
    type: string;
    aggregate_type?: string | null;
    aggregate_id?: string | null;
    payload?: unknown;
    occurred_at: string;
  }[];
  total: number;
}

export default function AdminPage() {
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const stats = useApi<StatsResponse>("/admin/stats");
  const roles = useApi<RolesResponse>("/admin/roles");
  const users = useApi<UsersResponse>("/admin/users");
  const taxonomy = useApi<TaxonomyResponse>("/admin/taxonomy");
  const scam = useApi<ScamResponse>("/admin/scam-corpus");
  const events = useApi<EventResponse>("/admin/event-stream", { limit: 60 });
  const invitations = useApi<{ items: unknown[] }>("/admin/invitations");

  const [assignUser, setAssignUser] = useState("");
  const [assignRole, setAssignRole] = useState("");
  const [busy, setBusy] = useState(false);

  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [newDomain, setNewDomain] = useState("");

  const assign = async () => {
    if (!assignUser || !assignRole) return;
    setBusy(true);
    try {
      await api.post("/admin/roles/assign", { userId: assignUser, role: assignRole });
      toast.push(`Role ${assignRole} assigned`, "success");
      roles.refresh();
      users.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not assign the role",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  const addProfession = async () => {
    setBusy(true);
    try {
      await api.post("/admin/taxonomy", {
        slug: newSlug,
        name: newName,
        parentId: newParent || null,
        domain: newDomain || undefined,
      });
      toast.push(`Profession "${newName}" added`, "success");
      setNewSlug("");
      setNewName("");
      setNewParent("");
      setNewDomain("");
      taxonomy.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not add the profession",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  const totals = stats.data?.totals;

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div className="row row-wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Operations</div>
          <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
            Control room
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Platform health, people and the knowledge that makes matching work.
          </p>
        </div>
        {totals ? (
          <Badge tone={totals.events24h > 0 ? "success" : "neutral"}>
            <Activity size={11} /> {totals.events24h} events / 24h
          </Badge>
        ) : null}
      </div>

      <Tabs
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "users", label: "Users", count: users.data?.total },
          { key: "roles", label: "Roles", count: roles.data?.roles?.length },
          { key: "taxonomy", label: "Taxonomy", count: taxonomy.data?.professions?.length },
          { key: "scam", label: "Scam corpus", count: scam.data?.total },
          { key: "invitations", label: "Invitations", count: invitations.data?.items?.length },
          { key: "events", label: "Events", count: events.data?.total },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" ? (
        <>
          <div className="grid-4">
            <StatTile label="Users" value={String(totals?.users ?? 0)} icon={<Users size={15} />} />
            <StatTile
              label="Live opportunities"
              value={String(totals?.activeOpportunities ?? 0)}
              icon={<Activity size={15} />}
            />
            <StatTile label="Applications" value={String(totals?.applications ?? 0)} />
            <StatTile label="Sources" value={String(totals?.sources ?? 0)} />
          </div>

          <div className="grid-2">
            <Card style={{ padding: "1.1rem" }}>
              <SectionTitle eyebrow="Coverage" title="Opportunities by country" />
              <div className="stack" style={{ marginTop: "0.8rem", gap: "0.35rem" }}>
                {(stats.data?.opportunitiesByCountry ?? []).slice(0, 12).map((row) => (
                  <div key={row.country} className="row" style={{ justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.85rem" }}>{row.country}</span>
                    <span className="mono" style={{ fontSize: "0.8rem" }}>
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
            <Card style={{ padding: "1.1rem" }}>
              <SectionTitle
                eyebrow="Trust"
                title="Risk distribution"
                action={<ShieldAlert size={16} style={{ color: "var(--text-muted)" }} />}
              />
              <div className="stack" style={{ marginTop: "0.8rem", gap: "0.35rem" }}>
                {(stats.data?.riskDistribution ?? []).map((row) => (
                  <div key={row.risk_action} className="row" style={{ justifyContent: "space-between" }}>
                    <Badge
                      tone={
                        row.risk_action === "block"
                          ? "danger"
                          : row.risk_action === "review"
                            ? "warning"
                            : "success"
                      }
                    >
                      {row.risk_action}
                    </Badge>
                    <span className="mono" style={{ fontSize: "0.8rem" }}>
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card style={{ padding: "1.1rem" }}>
            <SectionTitle eyebrow="Flow" title="Application pipeline" />
            <div className="row row-wrap" style={{ gap: "0.5rem", marginTop: "0.8rem" }}>
              {(stats.data?.pipeline ?? []).map((row) => (
                <div key={row.status} className="surface" style={{ padding: "0.6rem 0.8rem" }}>
                  <div className="mono" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                    {row.count}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {titleCase(row.status)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {tab === "users" ? (
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle
            eyebrow="People"
            title="Registered users"
            action={<Users size={16} style={{ color: "var(--text-muted)" }} />}
          />
          <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {(users.data?.items ?? []).map((user) => (
                  <tr key={user.id}>
                    <td className="mono">{user.email}</td>
                    <td>{user.name ?? "—"}</td>
                    <td>
                      <div className="row row-wrap" style={{ gap: "0.25rem" }}>
                        {!(Array.isArray(user.roles) ? user.roles : []).length ? (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            no roles
                          </span>
                        ) : (
                          (Array.isArray(user.roles) ? user.roles : []).map((role) => (
                            <Badge key={role} tone="accent">
                              {titleCase(role)}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.78rem" }}>{formatDateTime(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "roles" ? (
        <div className="grid-2">
          <Card style={{ padding: "1.1rem" }}>
            <SectionTitle
              eyebrow="Access control"
              title="Assign a role"
              action={<UserCog size={16} style={{ color: "var(--text-muted)" }} />}
            />
            <div className="stack" style={{ marginTop: "0.9rem", gap: "0.7rem" }}>
              <Field label="User id">
                <Input
                  value={assignUser}
                  onChange={(event) => setAssignUser(event.target.value)}
                  placeholder="uuid"
                />
              </Field>
              <Field label="Role">
                <Select value={assignRole} onChange={(event) => setAssignRole(event.target.value)}>
                  <option value="">Choose a role</option>
                  {(roles.data?.roles ?? []).map((role) => (
                    <option key={role.name} value={role.name}>
                      {titleCase(role.name)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button loading={busy} disabled={!assignUser || !assignRole} onClick={() => void assign()}>
                Assign role
              </Button>
            </div>
          </Card>

          <Card style={{ padding: "1.1rem" }}>
            <SectionTitle eyebrow="Catalogue" title={`${roles.data?.permissions?.length ?? 0} permissions`} />
            <div className="row row-wrap" style={{ gap: "0.3rem", marginTop: "0.8rem" }}>
              {(roles.data?.permissions ?? []).map((permission) => (
                <span
                  key={permission.name}
                  className="mono"
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.14rem 0.42rem",
                    borderRadius: 5,
                    background: "var(--surface-2)",
                  }}
                >
                  {permission.name}
                </span>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "taxonomy" ? (
        <div className="stack" style={{ gap: "1rem" }}>
          <Card style={{ padding: "1.1rem" }}>
            <SectionTitle
              eyebrow="Knowledge"
              title="Add a profession"
              description="Every profession gets a path, aliases and a salary median."
              action={<Tags size={16} style={{ color: "var(--text-muted)" }} />}
            />
            <div className="grid-2" style={{ marginTop: "0.9rem" }}>
              <Field label="Name">
                <Input value={newName} onChange={(event) => setNewName(event.target.value)} />
              </Field>
              <Field label="Slug">
                <Input value={newSlug} onChange={(event) => setNewSlug(event.target.value)} />
              </Field>
              <Field label="Parent id" hint="Leave empty for a top-level category">
                <Input value={newParent} onChange={(event) => setNewParent(event.target.value)} />
              </Field>
              <Field label="Domain">
                <Input value={newDomain} onChange={(event) => setNewDomain(event.target.value)} />
              </Field>
            </div>
            <div style={{ marginTop: "0.9rem" }}>
              <Button loading={busy} disabled={!newSlug || !newName} onClick={() => void addProfession()}>
                Add profession
              </Button>
            </div>
          </Card>

          <Card style={{ padding: "1.1rem" }}>
            <SectionTitle
              eyebrow="Catalogue"
              title={`${taxonomy.data?.professions?.length ?? 0} professions · ${
                taxonomy.data?.opportunityLinks?.length ?? 0
              } linked to live roles`}
            />
            <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Depth</th>
                    <th>Domain</th>
                    <th>Median</th>
                  </tr>
                </thead>
                <tbody>
                  {(taxonomy.data?.professions ?? []).slice(0, 120).map((profession) => (
                    <tr key={profession.id}>
                      <td style={{ fontWeight: 600 }}>
                        {profession.depth > 0 ? "· ".repeat(profession.depth) : ""}
                        {profession.name}
                      </td>
                      <td className="mono">{profession.slug}</td>
                      <td>{profession.depth}</td>
                      <td>{profession.domain ?? "—"}</td>
                      <td className="mono">
                        {profession.median_salary
                          ? `${profession.median_salary.toLocaleString()} ${profession.currency ?? ""}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "scam" ? (
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle
            eyebrow="Trust and safety"
            title={`${scam.data?.total ?? 0} known scam fingerprints`}
            description="Every posting is fingerprinted and compared against this corpus."
            action={<Fingerprint size={16} style={{ color: "var(--text-muted)" }} />}
          />
          {scam.loading ? (
            <Skeleton height={160} />
          ) : (scam.data?.items?.length ?? 0) === 0 ? (
            <EmptyState title="Corpus is empty" />
          ) : (
            <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Simhash</th>
                    <th>Sample</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {scam.data?.items?.map((signature) => (
                    <tr key={signature.id}>
                      <td>
                        <Badge tone="danger">{signature.label}</Badge>
                      </td>
                      <td className="mono" style={{ fontSize: "0.72rem" }}>
                        {signature.simhash}
                      </td>
                      <td style={{ fontSize: "0.76rem" }}>
                        {signature.sample_url ? (
                          <a href={signature.sample_url} target="_blank" rel="noopener noreferrer">
                            open
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ fontSize: "0.76rem" }}>
                        {formatDateTime(signature.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "invitations" ? <InvitationsPanel /> : null}

      {tab === "events" ? (
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle eyebrow="Audit" title="Recent platform events" />
          {events.loading ? (
            <Skeleton height={200} />
          ) : (events.data?.items?.length ?? 0) === 0 ? (
            <EmptyState title="No events yet" />
          ) : (
            <div className="stack" style={{ marginTop: "0.8rem", gap: "0.35rem" }}>
              {events.data?.items?.map((event) => (
                <div
                  key={event.id}
                  className="row row-wrap"
                  style={{
                    justifyContent: "space-between",
                    gap: "0.8rem",
                    padding: "0.5rem 0.65rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span className="mono" style={{ fontSize: "0.78rem" }}>
                    {event.type}
                  </span>
                  <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                    {event.aggregate_type ?? "—"} · {formatDateTime(event.occurred_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
