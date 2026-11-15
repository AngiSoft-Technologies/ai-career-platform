"use client";

import { useEffect, useState } from "react";
import { LogOut, Palette, ShieldCheck, UserCog } from "lucide-react";
import { linkGoogle } from "@/lib/auth";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  SectionTitle,
  useToast,
} from "@/components/ui";
import { ROLE_LABELS, ThemePicker, useTheme } from "@/components/theme";
import { useSession } from "@/components/session";
import { outboxItems, replayOutbox } from "@/lib/api";

export default function SettingsPage() {
  const { role } = useTheme();
  const { session, roles, permissions, signOut } = useSession();
  const toast = useToast();
  // The queue lives in localStorage, and reading it during render made the
  // server's empty card disagree with the client's real one. It is read
  // after hydration instead, and the page then follows the same event the
  // shell's replay listens to, so a queue that drains updates itself.
  const [outbox, setOutbox] = useState<ReturnType<typeof outboxItems>>([]);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const sync = () => setOutbox(outboxItems());
    sync();
    window.addEventListener("jr:outbox", sync);
    window.addEventListener("online", sync);
    return () => {
      window.removeEventListener("jr:outbox", sync);
      window.removeEventListener("online", sync);
    };
  }, []);
  const isStaff = roles.some((item) =>
    ["admin", "super_admin", "moderator", "support_agent", "source_curator", "automation", "analyst"].includes(item),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Preferences"
        description="Appearance, access and the account this device is signed in with."
      />

      <Card className="p-4 sm:p-5">
        <SectionTitle
          eyebrow="Appearance"
          title="Theme"
          description="Five themes. Pick the one you like and it stays on this device."
          action={<Palette size={17} className="text-app-muted" />}
        />
        <div className="mt-4">
          <ThemePicker />
        </div>
      </Card>

      {isStaff ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle
            eyebrow="Access"
            title="Your roles and permissions"
            description="Roles are assigned by administrators. You cannot change them yourself."
            action={<UserCog size={17} className="text-app-muted" />}
          />
          <div className="mt-4">
            <div className="flex max-w-xs flex-col gap-1.5">
              <span className="text-[0.78rem] font-semibold text-app-soft">Your role</span>
              <div className="rounded-app-sm border border-app-border bg-app-surface-2/50 px-3 py-2 text-[0.86rem] text-app-muted">
                {ROLE_LABELS[role] ?? role}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {roles.length === 0 ? <Badge tone="neutral">no roles assigned</Badge> : null}
              {roles.map((item) => (
                <Badge key={item} tone="accent">
                  {ROLE_LABELS[item]}
                </Badge>
              ))}
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-[0.84rem] text-app-muted">
                {permissions.length} granted permissions
              </summary>
              <div className="mt-2 flex flex-wrap gap-1">
                {permissions.map((permission) => (
                  <span
                    key={permission}
                    className="rounded-[5px] bg-app-surface-2 px-1.5 py-0.5 font-mono text-[0.68rem] text-app-soft"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            </details>
          </div>
        </Card>
      ) : null}

      <Card className="p-4 sm:p-5">
        <SectionTitle eyebrow="Offline" title="Changes waiting to send" />
        <div className="mt-4">
          {outbox.length === 0 ? (
            <p className="text-[0.84rem] leading-relaxed text-app-muted">
              Nothing queued. Changes you make without a connection are stored locally and replayed
              automatically.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {outbox.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-app-sm border border-app-border px-3 py-2 text-[0.78rem]"
                >
                  <span className="truncate font-mono text-app-soft">
                    {item.method} {item.path}
                  </span>
                  <Badge tone="warning">{item.attempts} attempts</Badge>
                </div>
              ))}
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOutbox(outboxItems());
                    void replayOutbox();
                    toast.push("Queue refreshed", "accent");
                  }}
                >
                  Refresh queue
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle eyebrow="Account" title="Session" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[0.9rem] font-semibold text-app-text">
              {session?.user.name ?? session?.user.email ?? "Not signed in"}
            </p>
            <p className="truncate text-[0.76rem] text-app-muted">{session?.user.email}</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
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
              loading={signingOut}
              onClick={() => {
                // The redirect waits for the sign-out: it used to fire in
                // the same tick, so a failed sign-out still left the
                // person on the public site with a live session.
                setSigningOut(true);
                void signOut()
                  .then(() => {
                    window.location.href = "/";
                  })
                  .catch(() => {
                    toast.push("Could not sign out. Try again.", "danger");
                  })
                  .finally(() => setSigningOut(false));
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle eyebrow="Trust" title="How MboQara treats your data" />
        <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.86rem] leading-relaxed text-app-soft">
          <li>Your CV and personal documents are private. They are never public files.</li>
          <li>The AI never invents facts about you. It only rearranges what you wrote.</li>
          <li>We never submit an application without you pressing submit.</li>
          <li>You can disconnect any channel and revoke its access immediately.</li>
        </ul>
        <div className="mt-4 flex items-start gap-2 rounded-app-md bg-app-accent-soft px-3 py-2.5 text-[0.83rem] text-app-soft">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-app-accent" />
          Your documents stay private and are only shared through time-limited links.
        </div>
      </Card>
    </div>
  );
}
