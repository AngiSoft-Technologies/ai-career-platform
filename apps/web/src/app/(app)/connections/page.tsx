"use client";

import { useState } from "react";
import { Github, Link2, Linkedin, Mail, MessageCircle, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Page,
  PageHeader,
  Panel,
  PanelHead,
  Rows,
  Row,
  Skeleton,
  StatStrip,
  cx,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";

interface Connection {
  id: string;
  provider: string;
  accountEmail?: string | null;
  displayName?: string | null;
  scopes: string[];
  status: string;
  createdAt: string;
}

interface ConnectionsResponse {
  items: Connection[];
  providers: {
    key: string;
    label: string;
    configured: boolean;
    features: string[];
  }[];
}

const ICONS: Record<string, typeof Mail> = {
  gmail: Mail,
  email: Mail,
  whatsapp: MessageCircle,
  github: Github,
  linkedin: Linkedin,
};

export default function ConnectionsPage() {
  const toast = useToast();
  const connections = useApi<ConnectionsResponse>("/connections");
  const [busy, setBusy] = useState<string | null>(null);

  const connect = async (provider: string) => {
    setBusy(provider);
    try {
      const result = await api.get<{ authorizationUrl: string }>(
        `/connections/${provider}/start`,
      );
      window.location.href = result.authorizationUrl;
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not start the connection",
        "danger",
      );
      setBusy(null);
    }
  };

  const disconnect = async (connection: Connection) => {
    setBusy(connection.id);
    try {
      await api.delete(`/connections/${connection.id}`);
      toast.push(`${titleCase(connection.provider)} disconnected`, "success");
      connections.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not disconnect",
        "danger",
      );
    } finally {
      setBusy(null);
    }
  };

  const items = connections.data?.items ?? [];
  const providers = connections.data?.providers ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow="Channels"
        title="Connected accounts"
        description="Connect the channels you already use. We read them to find roles you saved or were sent. We never post as you, and revoking a channel takes effect immediately."
        art={{
          src: "https://cdn.angisoft.co.ke/public/images/mboqara/handshake.webp",
          alt: "A handshake painted on a sign",
          caption: "Read-only access",
        }}
      />

      <StatStrip
        items={[
          {
            label: "Connected",
            value: items.length.toLocaleString(),
            hint: "channels linked",
          },
          {
            label: "Available",
            value: providers.filter((item) => item.configured).length.toLocaleString(),
            hint: "ready to connect",
          },
          {
            label: "Scope",
            value: items.reduce((sum, item) => sum + item.scopes.length, 0).toLocaleString(),
            hint: "permissions granted",
          },
        ]}
      />

      {connections.error && items.length === 0 ? (
        <EmptyState
          icon={<Link2 size={22} />}
          title="Could not load your channels"
          description={connections.error}
          action={
            <Button variant="outline" onClick={() => connections.refresh()}>
              Try again
            </Button>
          }
        />
      ) : null}

      <Panel>
        <PanelHead
          eyebrow="Active"
          title="Your connections"
          description="Each channel is read-only. Removing one deletes its stored tokens."
        />
        {connections.loading && items.length === 0 ? (
          <div className="border-t border-app-border">
            <Skeleton height={84} />
            <Skeleton height={84} />
          </div>
        ) : items.length === 0 ? (
          <div className="border-t border-app-border px-5 py-10 text-center">
            <p className="text-[0.95rem] font-medium text-app-text">No connections yet</p>
            <p className="mx-auto mt-1 max-w-md text-[0.84rem] leading-relaxed text-app-muted">
              Connect an email account below so we can find the roles you already saved.
            </p>
          </div>
        ) : (
          <Rows className="border-t border-app-border">
            {items.map((connection) => {
              const Icon = ICONS[connection.provider] ?? Link2;
              const active = connection.status === "active";
              return (
                <Row key={connection.id} className="flex-wrap items-start gap-4">
                  <span
                    className={cx(
                      "grid size-10 shrink-0 place-items-center rounded-app-sm border",
                      active
                        ? "border-app-success/30 bg-app-success/10 text-app-success"
                        : "border-app-border bg-app-surface-2 text-app-muted",
                    )}
                  >
                    <Icon size={17} aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[0.92rem] font-medium text-app-text">
                        {connection.displayName ?? titleCase(connection.provider)}
                      </p>
                      <Badge tone={active ? "success" : "neutral"} dot>
                        {connection.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[0.75rem] text-app-muted">
                      {connection.accountEmail ?? "—"} · connected{" "}
                      {formatDateTime(connection.createdAt)}
                    </p>
                    {connection.scopes.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {connection.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded-app-sm border border-app-border px-1.5 py-0.5 font-mono text-[0.66rem] text-app-soft"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={13} />}
                    loading={busy === connection.id}
                    onClick={() => void disconnect(connection)}
                    className="shrink-0 text-app-muted hover:text-app-danger"
                  >
                    Revoke
                  </Button>
                </Row>
              );
            })}
          </Rows>
        )}
      </Panel>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-app-border pb-3">
          <div>
            <p className="font-mono text-[0.6rem] tracking-[0.18em] text-app-muted uppercase">
              Available
            </p>
            <h2 className="mt-1 text-[1.15rem] leading-tight font-semibold tracking-[-0.015em] text-app-text">
              Add a channel
            </h2>
          </div>
          <p className="max-w-md text-[0.8rem] leading-relaxed text-app-muted">
            Features listed are the only things a channel can do once connected.
          </p>
        </div>

        {connections.loading && providers.length === 0 ? (
          <div className="grid gap-px overflow-hidden rounded-app-lg border border-app-border bg-app-border/60 sm:grid-cols-2">
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-app-lg border border-app-border bg-app-border/60 sm:grid-cols-2">
            {providers.map((provider) => {
              const Icon = ICONS[provider.key] ?? Link2;
              const connected = items.some((item) => item.provider === provider.key);
              return (
                <li key={provider.key} className="flex flex-col gap-3 bg-app-elevated p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-app-sm border border-app-border bg-app-surface-2 text-app-accent">
                      <Icon size={17} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="text-[0.94rem] font-medium text-app-text">
                          {provider.label}
                        </strong>
                        {connected ? (
                          <Badge tone="success" dot>
                            connected
                          </Badge>
                        ) : provider.configured ? (
                          <Badge tone="neutral">ready</Badge>
                        ) : (
                          <Badge tone="warning">not configured</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-[0.76rem] leading-relaxed text-app-muted">
                        {(provider.features ?? []).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <Button
                      size="sm"
                      variant={connected ? "outline" : provider.configured ? "primary" : "outline"}
                      disabled={!provider.configured || connected}
                      loading={busy === provider.key}
                      onClick={() => void connect(provider.key)}
                    >
                      {connected ? "Already connected" : provider.configured ? "Connect" : "Unavailable"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Page>
  );
}
