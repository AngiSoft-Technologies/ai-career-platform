"use client";

import { useState } from "react";
import Link from "next/link";
import { LifeBuoy, MessageCircle, Send, Ticket, UserRound } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { formatDateTime, titleCase } from "@/lib/format";

interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  created_at: string;
  roles: string[];
}

interface ApplicationRow {
  id: string;
  opportunityId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function SupportPage() {
  const toast = useToast();
  const [tab, setTab] = useState("queue");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");

  const users = useApi<{ items: UserRow[]; total: number }>("/admin/users");
  const applications = useApi<{ items: ApplicationRow[] }>("/applications");

  const usersList = users.data?.items ?? [];
  const filtered = usersList.filter((user) =>
    user.email.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const apps = applications.data?.items ?? [];

  const sendReply = () => {
    if (!reply.trim()) return;
    toast.push("Reply queued for delivery", "success");
    setReply("");
  };

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div>
        <div className="eyebrow">Support desk</div>
        <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
          Help people get unstuck
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
          Look up a user, see their application state and draft a reply. You send it.
        </p>
      </div>

      <Tabs
        tabs={[
          { key: "queue", label: "Applications", count: apps.length },
          { key: "users", label: "Users", count: usersList.length },
          { key: "reply", label: "Reply" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "queue" ? (
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle
            eyebrow="Tickets"
            title="Recent applications"
            action={<Ticket size={16} style={{ color: "var(--text-muted)" }} />}
          />
          {applications.loading && apps.length === 0 ? (
            <Skeleton height={160} />
          ) : apps.length === 0 ? (
            <EmptyState title="No applications yet" />
          ) : (
            <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((application) => (
                    <tr key={application.id}>
                      <td>
                        <Link
                          href={`/applications/${application.id}`}
                          className="mono"
                          style={{ fontSize: "0.76rem" }}
                        >
                          {application.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td>
                        <Badge tone={application.status === "REJECTED" ? "danger" : "accent"}>
                          {titleCase(application.status)}
                        </Badge>
                      </td>
                      <td style={{ fontSize: "0.76rem" }}>
                        {formatDateTime(application.createdAt)}
                      </td>
                      <td style={{ fontSize: "0.76rem" }}>
                        {formatDateTime(application.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "users" ? (
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle
            eyebrow="Directory"
            title="Find a user"
            action={<UserRound size={16} style={{ color: "var(--text-muted)" }} />}
          />
          <div style={{ marginTop: "0.8rem" }}>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by email"
            />
          </div>
          <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td className="mono">{user.email}</td>
                    <td>
                      <div className="row row-wrap" style={{ gap: "0.25rem" }}>
                        {user.roles.map((role) => (
                          <Badge key={role} tone="neutral">
                            {titleCase(role)}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.76rem" }}>{formatDateTime(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "reply" ? (
        <Card style={{ padding: "1.1rem" }}>
          <SectionTitle
            eyebrow="Response"
            title="Draft a reply"
            description="Draft it here, review it, then send from the channel you normally use."
            action={<MessageCircle size={16} style={{ color: "var(--text-muted)" }} />}
          />
          <div className="stack" style={{ marginTop: "0.9rem", gap: "0.8rem" }}>
            <Field label="Recipient email">
              <Input placeholder="candidate@example.com" />
            </Field>
            <Field label="Message">
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                style={{ minHeight: 130 }}
                placeholder="Hi, I had a look at your application..."
              />
            </Field>
            <div>
              <Button icon={<Send size={15} />} onClick={sendReply}>
                Queue reply
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card style={{ padding: "1.1rem" }}>
        <div className="row" style={{ gap: "0.6rem" }}>
          <LifeBuoy size={17} style={{ color: "var(--accent)" }} />
          <div>
            <strong style={{ fontSize: "0.92rem" }}>Escalate to engineering</strong>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              If a user reports a failure, capture the request id and check the event stream before
              escalating.
            </p>
          </div>
        </div>
        <div style={{ marginTop: "0.8rem" }}>
          <Link href="/admin">
            <Button variant="outline" size="sm">
              Open event stream
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
