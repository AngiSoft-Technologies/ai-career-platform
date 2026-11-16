"use client";

import Link from "next/link";
import { useState } from "react";
import { LifeBuoy, MessageCircle, Send, Ticket, UserRound } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  Page,
  PageHeader,
  Pagination,
  Panel,
  PanelHead,
  Skeleton,
  Tabs,
  Td,
  Textarea,
  Th,
  useToast,
} from "@/components/ui";
import { useApi, useDebounced } from "@/lib/hooks";
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
  opportunityTitle?: string | null;
  companyName?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const USER_PAGE_SIZE = 20;

export default function SupportPage() {
  const toast = useToast();
  const [tab, setTab] = useState("queue");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [recipient, setRecipient] = useState("");
  const [reply, setReply] = useState("");

  // The search is the server's, not the browser's: filtering a downloaded
  // page of two hundred accounts only ever matched those two hundred.
  const debouncedQuery = useDebounced(query, 300);
  const users = useApi<{ items: UserRow[]; total: number }>("/admin/users", {
    q: debouncedQuery || undefined,
    limit: USER_PAGE_SIZE,
    offset: (page - 1) * USER_PAGE_SIZE,
  });

  // The desk reads the selected person's pipeline. Without the userId the
  // route answers for the agent's own account — which is what the old page
  // showed while calling it "tickets" — so the lookup is explicit and the
  // heading says whose rows these are.
  const applications = useApi<{ items: ApplicationRow[]; total: number }>(
    selectedUser ? `/applications?userId=${selectedUser.id}&limit=100` : "/applications?limit=100",
  );

  const usersList = users.data?.items ?? [];
  const apps = applications.data?.items ?? [];
  const appsTotal = applications.data?.total ?? 0;

  const copyDraft = async () => {
    if (!reply.trim()) return;
    try {
      await navigator.clipboard.writeText(
        recipient.trim() ? `To: ${recipient.trim()}\n\n${reply}` : reply,
      );
      toast.push("Draft copied — send it from your usual channel", "success");
    } catch {
      toast.push("Clipboard access is unavailable in this browser", "warning");
    }
  };

  const chooseUser = (user: UserRow) => {
    setSelectedUser(user);
    setRecipient(user.email);
    setTab("queue");
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Support desk"
        title="Help people get unstuck"
        description="Look up a user, read their application state, draft a reply. You send it."
        art={{
          src: "https://cdn.angisoft.co.ke/public/images/mboqara/careers/healthcare-professional.webp",
          alt: "A professional at a desk ready to help",
          caption: "You send every reply",
        }}
        meta={
          selectedUser ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Looking up {selectedUser.email}</Badge>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-[0.76rem] text-app-muted underline underline-offset-2 hover:text-app-soft"
              >
                back to my own queue
              </button>
            </div>
          ) : null
        }
      />

      <Tabs
        tabs={[
          { key: "queue", label: "Applications", count: apps.length },
          { key: "users", label: "Users", count: users.data?.total ?? 0 },
          { key: "reply", label: "Reply" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "queue" ? (
        <Panel>
          <PanelHead
            eyebrow="Tickets"
            title={selectedUser ? "Their applications" : "Recent applications"}
            description={
              selectedUser
                ? `Every application ${selectedUser.email} has tracked, newest first.`
                : "The applications tracked on this account, newest first."
            }
            action={<Ticket size={16} className="text-app-muted" />}
          />
          {applications.error ? (
            <div className="border-t border-app-border px-5 py-4">
              <div className="rounded-app-md border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-[0.84rem] text-app-danger">
                {applications.error}
              </div>
            </div>
          ) : applications.loading && apps.length === 0 ? (
            <div className="border-t border-app-border p-5">
              <Skeleton height={160} />
            </div>
          ) : apps.length === 0 ? (
            <div className="border-t border-app-border p-5">
              <EmptyState
                icon={<Ticket size={26} />}
                title={selectedUser ? "No applications" : "No applications yet"}
                description={
                  selectedUser
                    ? `${selectedUser.email} has not tracked an application yet.`
                    : "Applications people track appear here when you look them up."
                }
                action={
                  <Button size="sm" variant="outline" onClick={() => setTab("users")}>
                    Find a user
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="border-t border-app-border">
              <DataTable className="rounded-none border-0 shadow-none">
                <thead>
                  <tr>
                    <Th>Application</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    <Th>Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((application) => (
                    <tr key={application.id} className="transition-colors hover:bg-app-surface-2/40">
                      <Td>
                        <Link
                          href={`/applications/${application.id}`}
                          className="font-semibold text-app-text hover:text-app-accent"
                        >
                          {application.opportunityTitle ?? `Application ${application.id.slice(0, 8)}`}
                        </Link>
                        <p className="text-[0.72rem] text-app-muted">
                          {application.companyName ?? application.id.slice(0, 8)}
                        </p>
                      </Td>
                      <Td>
                        <Badge tone={application.status === "REJECTED" ? "danger" : "accent"}>
                          {titleCase(application.status)}
                        </Badge>
                      </Td>
                      <Td className="text-[0.76rem]">{formatDateTime(application.createdAt)}</Td>
                      <Td className="text-[0.76rem]">{formatDateTime(application.updatedAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <p className="border-t border-app-border px-5 py-3 text-[0.76rem] text-app-muted">
                {appsTotal.toLocaleString()} application{appsTotal === 1 ? "" : "s"} in total
              </p>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "users" ? (
        <Panel>
          <PanelHead
            eyebrow="Directory"
            title="Find a user"
            description="Search by email, then open their applications."
            action={<UserRound size={16} className="text-app-muted" />}
          />
          <div className="border-t border-app-border px-5 py-4">
            <div className="max-w-md">
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by email"
              />
            </div>
          </div>
          {users.error ? (
            <div className="border-t border-app-border px-5 py-4">
              <div className="rounded-app-md border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-[0.84rem] text-app-danger">
                {users.error}
              </div>
            </div>
          ) : users.loading && usersList.length === 0 ? (
            <div className="border-t border-app-border p-5">
              <Skeleton height={160} />
            </div>
          ) : usersList.length === 0 ? (
            <div className="border-t border-app-border p-5">
              <EmptyState
                icon={<UserRound size={26} />}
                title="No users match"
                description="Try a different email address."
              />
            </div>
          ) : (
            <>
              <div className="border-t border-app-border">
                <DataTable className="rounded-none border-0 shadow-none">
                  <thead>
                    <tr>
                      <Th>Email</Th>
                      <Th>Roles</Th>
                      <Th>Joined</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((user) => (
                      <tr key={user.id} className="transition-colors hover:bg-app-surface-2/40">
                        <Td className="font-mono text-[0.8rem]">{user.email}</Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((role) => (
                              <Badge key={role} tone="neutral">
                                {titleCase(role)}
                              </Badge>
                            ))}
                          </div>
                        </Td>
                        <Td className="text-[0.76rem]">{formatDateTime(user.created_at)}</Td>
                        <Td>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => chooseUser(user)}
                          >
                            Open
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
              <div className="border-t border-app-border p-4">
                <Pagination
                  page={page}
                  pageSize={USER_PAGE_SIZE}
                  total={users.data?.total ?? 0}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </Panel>
      ) : null}

      {tab === "reply" ? (
        <Panel>
          <PanelHead
            eyebrow="Response"
            title="Draft a reply"
            description="Draft it here, review it, then send it from the channel you normally use. Nothing is sent on your behalf."
            action={<MessageCircle size={16} className="text-app-muted" />}
          />
          <div className="flex max-w-2xl flex-col gap-3 border-t border-app-border px-5 py-5">
            <Field label="Recipient email">
              <Input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="candidate@example.com"
              />
            </Field>
            <Field label="Message">
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                className="min-h-[130px]"
                placeholder="Hi, I had a look at your application..."
              />
            </Field>
            <div>
              <Button icon={<Send size={15} />} onClick={() => void copyDraft()}>
                Copy draft
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <LifeBuoy size={17} className="mt-0.5 shrink-0 text-app-accent" />
          <div>
            <strong className="text-[0.92rem] text-app-text">Escalate to engineering</strong>
            <p className="mt-0.5 max-w-[60ch] text-[0.82rem] leading-relaxed text-app-muted">
              If a user reports a failure, capture the request id and check the event stream before
              escalating.
            </p>
          </div>
        </div>
        <Link href="/admin">
          <Button variant="outline" size="sm">
            Open event stream
          </Button>
        </Link>
      </Panel>
    </Page>
  );
}