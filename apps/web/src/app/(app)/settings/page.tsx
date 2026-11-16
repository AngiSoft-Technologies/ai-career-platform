"use client";

import { useEffect, useState } from "react";
import { LogOut, Palette, ShieldCheck, UserCog } from "lucide-react";
import { linkGoogle } from "@/lib/auth";
import { Badge, Button, Page, PageHeader, Panel, PanelHead, useToast } from "@/components/ui";
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
    <Page>
      <PageHeader
        eyebrow="Settings"
        title="How the workspace behaves"
        description="Appearance, access and the account this device is signed in with. Everything here is per-device unless it says otherwise."
        art={{
          src: "https://cdn.angisoft.co.ke/public/images/mboqara/careers/technology-professional.webp",
          alt: "A professional working at a laptop",
          caption: "Five themes, one workspace",
        }}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* The section nav. Settings with five groups is a document, and a
              document needs a way to find the part you want. */}
          <nav
            aria-label="Settings sections"
            className="hidden lg:block lg:sticky lg:top-[92px] lg:self-start"
          >
            <p className="mb-2 font-mono text-[0.58rem] font-semibold tracking-[0.2em] text-app-muted uppercase">
              On this page
            </p>
            <ul className="flex flex-col gap-0.5 border-l border-app-border">
              {[
                { href: "#appearance", label: "Appearance" },
                ...(isStaff ? [{ href: "#access", label: "Access" }] : []),
                { href: "#offline", label: "Offline queue" },
                { href: "#trust", label: "Your data" },
                { href: "#account", label: "This device" },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="-ml-px block border-l border-transparent py-1.5 pl-3 text-[0.84rem] text-app-muted transition-colors duration-150 hover:border-app-accent hover:text-app-text"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section id="appearance" className="flex scroll-mt-24 flex-col gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-app-border pb-3">
              <div>
                <p className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
                  Appearance
                </p>
                <h2 className="mt-1 text-[1.15rem] leading-tight font-semibold tracking-[-0.015em] text-app-text">
                  Theme
                </h2>
                <p className="mt-1 max-w-prose text-[0.84rem] leading-relaxed text-app-muted">
                  Five themes, one component kit. Pick the one you like and it stays on this device.
                </p>
              </div>
              <Palette size={17} className="text-app-muted" aria-hidden />
            </div>
            <ThemePicker />
          </section>

          {isStaff ? (
            <Panel id="access" className="scroll-mt-24">
              <PanelHead
                eyebrow="Access"
                title="Your roles and permissions"
                description="Roles are assigned by administrators. You cannot change them yourself."
                action={<UserCog size={16} className="text-app-muted" />}
              />
              <div className="border-t border-app-border px-5 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent" dot>
                    {ROLE_LABELS[role] ?? role}
                  </Badge>
                  {roles.length === 0 ? <Badge tone="neutral">no roles assigned</Badge> : null}
                  {roles.map((item) => (
                    <Badge key={item} tone="neutral">
                      {ROLE_LABELS[item]}
                    </Badge>
                  ))}
                </div>

                <details className="group mt-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-[0.82rem] text-app-muted transition-colors hover:text-app-soft">
                    <span className="font-mono text-[0.7rem] tabular-nums">{permissions.length}</span>
                    granted permissions
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-app-sm border border-app-border bg-app-surface-2 px-1.5 py-0.5 font-mono text-[0.68rem] text-app-soft"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                </details>
              </div>
            </Panel>
          ) : null}

          <Panel id="offline" className="scroll-mt-24">
            <PanelHead
              eyebrow="Offline"
              title="Changes waiting to send"
              description="Work you did without a connection, queued for replay."
            />
            <div className="border-t border-app-border px-5 py-5">
              {outbox.length === 0 ? (
                <p className="max-w-prose text-[0.84rem] leading-relaxed text-app-muted">
                  Nothing queued. Changes you make without a connection are stored locally and
                  replayed automatically.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {outbox.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-app-sm border border-app-border bg-app-surface-2/40 px-3 py-2 text-[0.78rem]"
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
          </Panel>

          <Panel id="trust" className="scroll-mt-24">
            <PanelHead eyebrow="Trust" title="How MboQara treats your data" />
            <ul className="divide-y divide-app-border border-t border-app-border">
              {[
                "Your CV and personal documents are private. They are never public files.",
                "The AI never invents facts about you. It only rearranges what you wrote.",
                "We never submit an application without you pressing submit.",
                "You can disconnect any channel and revoke its access immediately.",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 px-5 py-3.5 text-[0.85rem] leading-relaxed text-app-soft"
                >
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-app-success" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-[92px]">
          <Panel id="account" className="scroll-mt-24">
            <PanelHead eyebrow="Account" title="This device" />
            <div className="border-t border-app-border px-5 py-5">
              <p className="truncate text-[0.95rem] font-medium text-app-text">
                {session?.user.name ?? session?.user.email ?? "Not signed in"}
              </p>
              <p className="truncate text-[0.76rem] text-app-muted">{session?.user.email}</p>

              <div className="mt-5 flex flex-col gap-2">
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
                  className="w-full"
                >
                  Connect Google
                </Button>
                <Button
                  variant="danger"
                  icon={<LogOut size={15} />}
                  loading={signingOut}
                  className="w-full"
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
              <p className="mt-4 text-[0.72rem] leading-relaxed text-app-muted">
                Signing out clears this device only. Your documents stay private and are shared
                through time-limited links.
              </p>
            </div>
          </Panel>
        </aside>
      </div>
    </Page>
  );
}
