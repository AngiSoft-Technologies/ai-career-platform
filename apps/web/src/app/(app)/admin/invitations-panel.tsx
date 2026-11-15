"use client";

import { useState } from "react";
import { Copy, Link2, Mail, UserPlus } from "lucide-react";
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
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  emailSent: boolean;
  emailProvider: string | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
  invitedByEmail: string | null;
}

interface InvitationsResponse {
  items: InvitationRow[];
}

const ROLE_OPTIONS = [
  { value: "moderator", label: "Moderator - reports and content review" },
  { value: "admin", label: "Admin - platform operations" },
  { value: "source_curator", label: "Source curator - job sources" },
  { value: "support_agent", label: "Support agent - user support" },
  { value: "analyst", label: "Analyst - read-only analytics" },
  { value: "super_admin", label: "Super admin - full access" },
];

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "accepted") return "success";
  if (status === "pending") return "warning";
  if (status === "revoked") return "danger";
  return "neutral";
}

export function InvitationsPanel() {
  const toast = useToast();
  const invitations = useApi<InvitationsResponse>("/admin/invitations");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("moderator");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const invite = async () => {
    if (!email.trim() || !role) return;
    setBusy(true);
    try {
      const result = await api.post<{
        inviteUrl: string;
        emailSent: boolean;
      }>("/admin/invitations", {
        email: email.trim(),
        role,
        name: name.trim() || undefined,
      });
      setLastLink(result.inviteUrl);
      setEmail("");
      setName("");
      toast.push(
        result.emailSent
          ? `Invitation sent to ${email.trim()}`
          : "Invitation created. Share the link below.",
        "success",
      );
      invitations.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not create that invitation",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async (id: string) => {
    setBusy(true);
    try {
      const result = await api.post<{ inviteUrl: string }>(
        `/admin/invitations/${id}/resend`,
      );
      setLastLink(result.inviteUrl);
      toast.push("Invitation sent again", "success");
      invitations.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not resend that invitation",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await api.delete(`/admin/invitations/${id}`);
      toast.push("Invitation cancelled", "success");
      invitations.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not cancel that invitation",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.push("Link copied", "success");
    } catch {
      toast.push("Copy that link manually", "warning");
    }
  };

  const items = invitations.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 sm:p-5">
        <SectionTitle
          eyebrow="People"
          title="Invite someone to MboQara"
          description="They receive an email with a link to set their own password, and join with the role you choose here."
          action={<UserPlus size={15} className="text-app-accent" />}
        />

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@company.com"
            />
          </Field>
          <Field label="Name" hint="Optional">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="First name"
            />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            loading={busy}
            disabled={!email.trim()}
            onClick={() => void invite()}
            icon={<Mail size={14} />}
          >
            Send invite
          </Button>
        </div>

        {lastLink ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-app-md bg-app-accent-soft px-3 py-2.5 text-[0.8rem] text-app-soft">
            <Link2 size={14} className="shrink-0 text-app-accent" />
            <span className="min-w-0 flex-1 [word-break:break-all]">{lastLink}</span>
            <Button variant="ghost" size="sm" icon={<Copy size={13} />} onClick={() => void copy(lastLink)}>
              Copy
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle eyebrow="History" title={`${items.length} invitations`} />
        <div className="mt-4">
          {invitations.loading && items.length === 0 ? (
            <Skeleton height={180} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No invitations yet"
              description="Invite someone above and it will show up here."
              icon={<UserPlus size={18} />}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-app-md border border-app-border px-3 py-2.5"
                >
                  <div className="min-w-[220px]">
                    <p className="text-[0.88rem] font-semibold text-app-text">{item.email}</p>
                    <p className="mt-0.5 text-[0.74rem] text-app-muted">
                      {titleCase(item.role)} - invited {formatDateTime(item.createdAt)}
                      {item.invitedByEmail ? ` by ${item.invitedByEmail}` : ""}
                      {item.status === "pending"
                        ? ` - expires ${formatDateTime(item.expiresAt)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                    {item.status === "pending" ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void resend(item.id)}
                        >
                          Resend
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void revoke(item.id)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
