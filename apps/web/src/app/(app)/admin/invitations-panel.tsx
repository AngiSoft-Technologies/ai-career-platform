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

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle
          eyebrow="People"
          title="Invite someone to Job Radar"
          action={<UserPlus size={15} style={{ color: "var(--accent)" }} />}
        />
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.84rem",
            marginTop: 6,
          }}
        >
          They receive an email with a link to set their own password, and join with
          the role you choose here.
        </p>

        <div
          className="row row-wrap"
          style={{ gap: "0.7rem", marginTop: "1rem", alignItems: "flex-end" }}
        >
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
            style={{ justifyContent: "center" }}
          >
            <Mail size={14} /> Send invite
          </Button>
        </div>

        {lastLink ? (
          <div
            className="row"
            style={{
              gap: "0.6rem",
              marginTop: "0.9rem",
              padding: "0.7rem 0.8rem",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-soft)",
              fontSize: "0.8rem",
            }}
          >
            <Link2 size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span style={{ wordBreak: "break-all", flex: 1 }}>{lastLink}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void copy(lastLink)}
            >
              <Copy size={13} /> Copy
            </button>
          </div>
        ) : null}
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionTitle eyebrow="History" title="Invitations" />
        <div style={{ marginTop: "0.8rem" }}>
          {(invitations.data?.items ?? []).length === 0 ? (
            <EmptyState
              title="No invitations yet"
              description="Invite someone above and it will show up here."
              icon={<UserPlus size={18} />}
            />
          ) : (
            <div className="stack" style={{ gap: "0.55rem" }}>
              {(invitations.data?.items ?? []).map((item) => (
                <div
                  key={item.id}
                  className="row row-wrap"
                  style={{
                    justifyContent: "space-between",
                    gap: "0.6rem",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                      {item.email}
                    </div>
                    <div
                      style={{
                        fontSize: "0.74rem",
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {titleCase(item.role)} - invited{" "}
                      {formatDateTime(item.createdAt)}
                      {item.invitedByEmail ? ` by ${item.invitedByEmail}` : ""}
                      {item.status === "pending"
                        ? ` - expires ${formatDateTime(item.expiresAt)}`
                        : ""}
                    </div>
                  </div>
                  <div className="row" style={{ gap: "0.45rem" }}>
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                    {item.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => void resend(item.id)}
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => void revoke(item.id)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
