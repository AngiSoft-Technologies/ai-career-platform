"use client";

import { useState } from "react";
import { Github, Link2, Linkedin, Mail, MessageCircle, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Skeleton,
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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Channels"
        title="Connected accounts"
        description="Connect the channels you already use. We read them to find roles. We never post as you."
      />

      <Card className="p-4 sm:p-5">
        <SectionTitle eyebrow="Available" title="Add a channel" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {connections.loading && providers.length === 0 ? (
            <>
              <Skeleton height={128} />
              <Skeleton height={128} />
            </>
          ) : null}
          {providers.map((provider) => {
            const Icon = ICONS[provider.key] ?? Link2;
            return (
              <div
                key={provider.key}
                className="flex items-start gap-3 rounded-app-md border border-app-border bg-app-surface-2/40 p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-app-md bg-app-accent-soft text-app-accent">
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-[0.92rem] text-app-text">{provider.label}</strong>
                    {provider.configured ? (
                      <Badge tone="success">ready</Badge>
                    ) : (
                      <Badge tone="warning">not configured</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[0.77rem] text-app-muted">
                    {(provider.features ?? []).join(" · ")}
                  </p>
                  <div className="mt-2.5">
                    <Button
                      size="sm"
                      variant={provider.configured ? "primary" : "outline"}
                      disabled={!provider.configured}
                      loading={busy === provider.key}
                      onClick={() => void connect(provider.key)}
                    >
                      {provider.configured ? "Connect" : "Unavailable"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle eyebrow="Active" title="Your connections" />
        <div className="mt-4">
          {connections.loading && items.length === 0 ? (
            <Skeleton height={120} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Link2 size={26} />}
              title="No connections yet"
              description="Connect an email account so we can find the roles you already saved."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((connection) => {
                const Icon = ICONS[connection.provider] ?? Link2;
                return (
                  <li
                    key={connection.id}
                    className="flex flex-wrap items-center gap-3 rounded-app-md border border-app-border px-3 py-2.5"
                  >
                    <Icon size={16} className="shrink-0 text-app-accent" />
                    <div className="min-w-[200px] flex-1">
                      <p className="text-[0.87rem] font-semibold text-app-text">
                        {connection.displayName ?? titleCase(connection.provider)}
                      </p>
                      <p className="text-[0.74rem] text-app-muted">
                        {connection.accountEmail ?? "—"} · connected{" "}
                        {formatDateTime(connection.createdAt)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {connection.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded bg-app-surface-2 px-1 py-0.5 font-mono text-[0.66rem] text-app-soft"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Badge tone={connection.status === "active" ? "success" : "neutral"}>
                      {connection.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      loading={busy === connection.id}
                      onClick={() => void disconnect(connection)}
                    >
                      Revoke
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
