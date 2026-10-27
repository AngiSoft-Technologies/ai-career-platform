"use client";

import { useState } from "react";
import { LogOut, Palette, ShieldCheck, UserCog } from "lucide-react";
import { linkGoogle } from "@/lib/auth";
import {
  Badge,
  Button,
  Card,
  SectionTitle,
  useToast,
} from "@/components/ui";
import { ROLE_LABELS, THEMES, ThemePicker, useTheme } from "@/components/theme";
import { useSession } from "@/components/session";
import { outboxItems } from "@/lib/api";
import type { RoleKey } from "@/lib/types";

export default function SettingsPage() {
  const { role, setTheme } = useTheme();
  const { session, roles, permissions, signOut } = useSession();
  const toast = useToast();
  const [outbox, setOutbox] = useState(outboxItems());
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const isStaff = roles.some((item) =>
    ["admin", "super_admin", "moderator", "support_agent", "source_curator", "automation", "analyst"].includes(item),
  );

  return (
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div>
        <div className="eyebrow">Settings</div>
        <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
          Preferences
        </h1>
      </div>

      <Card style={{ padding: "1.2rem" }}>
        <SectionTitle
          eyebrow="Appearance"
          title="Theme"
          description="Five layouts. Pick the one you like and it stays on this device."
          action={<Palette size={17} style={{ color: "var(--text-muted)" }} />}
        />
        <div style={{ marginTop: "1rem" }}>
          <ThemePicker />
        </div>
      </Card>

      {isStaff ? (
      <Card style={{ padding: "1.2rem" }}>
        <SectionTitle
          eyebrow="Access"
          title="Your roles and permissions"
          description="Roles are assigned by administrators. You cannot change them yourself."
          action={<UserCog size={17} style={{ color: "var(--text-muted)" }} />}
        />
        <div style={{ marginTop: "1rem" }}>
          <label className="field" style={{ maxWidth: 320 }}>
            <span className="label">Your role</span>
            <div style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
              color: "var(--text-muted)",
            }}>
              {ROLE_LABELS[role] ?? role}
            </div>
          </label>

          <div className="row row-wrap" style={{ gap: "0.35rem", marginTop: "1rem" }}>
            {roles.length === 0 ? <Badge tone="neutral">no roles assigned</Badge> : null}
            {roles.map((item) => (
              <Badge key={item} tone="accent">
                {ROLE_LABELS[item]}
              </Badge>
            ))}
          </div>

          <details style={{ marginTop: "1rem" }}>
            <summary style={{ cursor: "pointer", fontSize: "0.86rem", color: "var(--text-muted)" }}>
              {permissions.length} granted permissions
            </summary>
            <div className="row row-wrap" style={{ gap: "0.3rem", marginTop: "0.6rem" }}>
              {permissions.map((permission) => (
                <span
                  key={permission}
                  className="mono"
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.14rem 0.45rem",
                    borderRadius: 5,
                    background: "var(--surface-2)",
                    color: "var(--text-soft)",
                  }}
                >
                  {permission}
                </span>
              ))}
            </div>
          </details>
        </div>
      </Card>
      ) : null}

      <Card style={{ padding: "1.2rem" }}>
        <SectionTitle eyebrow="Offline" title="Changes waiting to send" />
        <div style={{ marginTop: "0.9rem" }}>
          {outbox.length === 0 ? (
            <p style={{ fontSize: "0.86rem", color: "var(--text-muted)" }}>
              Nothing queued. Changes you make without a connection are stored locally and replayed
              automatically.
            </p>
          ) : (
            <div className="stack" style={{ gap: "0.4rem" }}>
              {outbox.map((item) => (
                <div
                  key={item.id}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    padding: "0.5rem 0.65rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.8rem",
                  }}
                >
                  <span className="mono">
                    {item.method} {item.path}
                  </span>
                  <Badge tone="warning">{item.attempts} attempts</Badge>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOutbox(outboxItems());
                  toast.push("Queue refreshed", "accent");
                }}
              >
                Refresh queue
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card style={{ padding: "1.2rem" }}>
        <SectionTitle eyebrow="Account" title="Session" />
        <div className="row row-wrap" style={{ gap: "1rem", marginTop: "0.9rem", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              {session?.user.name ?? session?.user.email ?? "Not signed in"}
            </div>
            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
              {session?.user.email}
            </div>
          </div>
          <div className="row row-wrap" style={{ gap: "0.6rem" }}>
            <Button
              variant="outline"
              onClick={async () => {
                setLinkingGoogle(true);
                try {
                  const started = await linkGoogle("/settings");
                  if (!started) toast.push("Google is not available right now", "danger");
                } catch {
                  toast.push("Google is not available right now", "danger");
                } finally {
                  setLinkingGoogle(false);
                }
              }}
              loading={linkingGoogle}
            >
              Connect Google
            </Button>
            <Button
              variant="danger"
              icon={<LogOut size={15} />}
              onClick={() => {
                void signOut();
                window.location.href = "/";
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </Card>

      <Card style={{ padding: "1.2rem" }}>
        <SectionTitle eyebrow="Trust" title="How Job Radar treats your data" />
        <ul style={{ paddingLeft: "1.1rem", marginTop: "0.9rem", lineHeight: 1.9, fontSize: "0.88rem" }}>
          <li>Your CV and personal documents are private. They are never public files.</li>
          <li>The AI never invents facts about you. It only rearranges what you wrote.</li>
          <li>We never submit an application without you pressing submit.</li>
          <li>You can disconnect any channel and revoke its access immediately.</li>
        </ul>
        <div
          className="row"
          style={{
            gap: "0.5rem",
            marginTop: "1rem",
            padding: "0.8rem",
            borderRadius: "var(--radius-md)",
            background: "var(--accent-soft)",
            fontSize: "0.84rem",
          }}
        >
          <ShieldCheck size={15} style={{ color: "var(--accent)" }} />
          Your documents stay private and are only shared through time-limited links.
        </div>
      </Card>
    </div>
  );
}
