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
  BarList,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Select,
  Skeleton,
  StatTile,
  Tabs,
  Td,
  Th,
  useToast,
  cx,
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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Control room"
        description="Platform health, people and the knowledge that makes matching work."
        actions={
          totals ? (
            <Badge tone={totals.events24h > 0 ? "success" : "neutral"}>
              <Activity size={11} /> {totals.events24h} events / 24h
            </Badge>
          ) : null
        }
      />

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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Users" value={String(totals?.users ?? 0)} icon={<Users size={15} />} />
            <StatTile
              label="Live opportunities"
              value={String(totals?.activeOpportunities ?? 0)}
              icon={<Activity size={15} />}
            />
            <StatTile label="Applications" value={String(totals?.applications ?? 0)} />
            <StatTile label="Sources" value={String(totals?.sources ?? 0)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <SectionTitle eyebrow="Coverage" title="Opportunities by country" />
              <div className="mt-4">
                <BarList
                  items={(stats.data?.opportunitiesByCountry ?? []).slice(0, 12).map((row) => ({
                    label: row.country,
                    value: row.count,
                    hint: String(row.count),
                  }))}
                />
              </div>
            </Card>
            <Card className="p-4 sm:p-5">
              <SectionTitle
                eyebrow="Trust"
                title="Risk distribution"
                action={<ShieldAlert size={16} className="text-app-muted" />}
              />
              <div className="mt-4 flex flex-col gap-2">
                {(stats.data?.riskDistribution ?? []).map((row) => (
                  <div
                    key={row.risk_action}
                    className="flex items-center justify-between gap-3 rounded-app-sm border border-app-border px-3 py-2"
                  >
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
                    <span className="font-mono text-[0.78rem] tabular-nums text-app-muted">
                      {row.count}
                    </span>
                  </div>
                ))}
                {(stats.data?.riskDistribution ?? []).length === 0 ? (
                  <p className="text-[0.83rem] text-app-muted">No scored postings yet.</p>
                ) : null}
              </div>
            </Card>
          </div>

          <Card className="p-4 sm:p-5">
            <SectionTitle eyebrow="Flow" title="Application pipeline" />
            <div className="mt-4 flex flex-wrap gap-2">
              {(stats.data?.pipeline ?? []).map((row) => (
                <div
                  key={row.status}
                  className="min-w-[110px] rounded-app-md border border-app-border bg-app-surface-2/40 px-3 py-2"
                >
                  <p className="font-mono text-[1.2rem] leading-none font-bold tabular-nums text-app-text">
                    {row.count}
                  </p>
                  <p className="mt-1 text-[0.72rem] text-app-muted">{titleCase(row.status)}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {tab === "users" ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle
            eyebrow="People"
            title="Registered users"
            description={`${users.data?.total ?? 0} accounts`}
            action={<Users size={16} className="text-app-muted" />}
          />
          <div className="mt-4">
            {users.loading && !users.data ? (
              <Skeleton height={220} />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Email</Th>
                    <Th>Name</Th>
                    <Th>Roles</Th>
                    <Th>Joined</Th>
                  </tr>
                </thead>
                <tbody>
                  {(users.data?.items ?? []).map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-app-surface-2/40">
                      <Td className="font-mono text-[0.8rem]">{user.email}</Td>
                      <Td>{user.name ?? "—"}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {!(Array.isArray(user.roles) ? user.roles : []).length ? (
                            <span className="text-[0.75rem] text-app-muted">no roles</span>
                          ) : (
                            (Array.isArray(user.roles) ? user.roles : []).map((role) => (
                              <Badge key={role} tone="accent">
                                {titleCase(role)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </Td>
                      <Td className="text-[0.78rem]">{formatDateTime(user.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </div>
        </Card>
      ) : null}

      {tab === "roles" ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <SectionTitle
              eyebrow="Access control"
              title="Assign a role"
              action={<UserCog size={16} className="text-app-muted" />}
            />
            <div className="mt-4 flex flex-col gap-3">
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
              <div>
                <Button loading={busy} disabled={!assignUser || !assignRole} onClick={() => void assign()}>
                  Assign role
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle
              eyebrow="Catalogue"
              title={`${roles.data?.permissions?.length ?? 0} permissions`}
            />
            <div className="mt-4 flex flex-wrap gap-1">
              {(roles.data?.permissions ?? []).map((permission) => (
                <span
                  key={permission.name}
                  className="rounded bg-app-surface-2 px-1.5 py-0.5 font-mono text-[0.7rem] text-app-soft"
                >
                  {permission.name}
                </span>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "taxonomy" ? (
        <div className="flex flex-col gap-4">
          <Card className="p-4 sm:p-5">
            <SectionTitle
              eyebrow="Knowledge"
              title="Add a profession"
              description="Every profession gets a path, aliases and a salary median."
              action={<Tags size={16} className="text-app-muted" />}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <div className="mt-4">
              <Button loading={busy} disabled={!newSlug || !newName} onClick={() => void addProfession()}>
                Add profession
              </Button>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle
              eyebrow="Catalogue"
              title={`${taxonomy.data?.professions?.length ?? 0} professions · ${
                taxonomy.data?.opportunityLinks?.length ?? 0
              } linked to live roles`}
            />
            <div className="mt-4">
              <DataTable>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Slug</Th>
                    <Th>Depth</Th>
                    <Th>Domain</Th>
                    <Th>Median</Th>
                  </tr>
                </thead>
                <tbody>
                  {(taxonomy.data?.professions ?? []).slice(0, 120).map((profession) => (
                    <tr key={profession.id} className="transition-colors hover:bg-app-surface-2/40">
                      <Td className="font-semibold text-app-text">
                        {profession.depth > 0 ? "· ".repeat(profession.depth) : ""}
                        {profession.name}
                      </Td>
                      <Td className="font-mono text-[0.78rem]">{profession.slug}</Td>
                      <Td className="font-mono text-[0.78rem]">{profession.depth}</Td>
                      <Td>{profession.domain ?? "—"}</Td>
                      <Td className="font-mono text-[0.78rem]">
                        {profession.median_salary
                          ? `${profession.median_salary.toLocaleString()} ${profession.currency ?? ""}`
                          : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "scam" ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle
            eyebrow="Trust and safety"
            title={`${scam.data?.total ?? 0} known scam fingerprints`}
            description="Every posting is fingerprinted and compared against this corpus."
            action={<Fingerprint size={16} className="text-app-muted" />}
          />
          <div className="mt-4">
            {scam.loading && !scam.data ? (
              <Skeleton height={180} />
            ) : (scam.data?.items?.length ?? 0) === 0 ? (
              <EmptyState title="Corpus is empty" />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Label</Th>
                    <Th>Simhash</Th>
                    <Th>Sample</Th>
                    <Th>Added</Th>
                  </tr>
                </thead>
                <tbody>
                  {scam.data?.items?.map((signature) => (
                    <tr key={signature.id} className="transition-colors hover:bg-app-surface-2/40">
                      <Td>
                        <Badge tone="danger">{signature.label}</Badge>
                      </Td>
                      <Td className="font-mono text-[0.72rem]">{signature.simhash}</Td>
                      <Td className="text-[0.76rem]">
                        {signature.sample_url ? (
                          <a
                            href={signature.sample_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-app-accent hover:underline"
                          >
                            open
                          </a>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="text-[0.76rem]">{formatDateTime(signature.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </div>
        </Card>
      ) : null}

      {tab === "invitations" ? <InvitationsPanel /> : null}

      {tab === "events" ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle eyebrow="Audit" title="Recent platform events" />
          <div className="mt-4">
            {events.loading && !events.data ? (
              <Skeleton height={220} />
            ) : (events.data?.items?.length ?? 0) === 0 ? (
              <EmptyState title="No events yet" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {events.data?.items?.map((event) => (
                  <li
                    key={event.id}
                    className={cx(
                      "flex flex-wrap items-center justify-between gap-3 rounded-app-sm border border-app-border px-3 py-2",
                      "transition-colors duration-150 hover:bg-app-surface-2/40",
                    )}
                  >
                    <span className="font-mono text-[0.78rem] text-app-text">{event.type}</span>
                    <span className="text-[0.74rem] text-app-muted">
                      {event.aggregate_type ?? "—"} · {formatDateTime(event.occurred_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
