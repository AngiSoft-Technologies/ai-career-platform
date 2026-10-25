"use client";

import { useState } from "react";
import { Github, Link2, Linkedin, Mail, MessageCircle, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
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
    <div className="stack" style={{ gap: "1.2rem" }}>
      <div>
        <div className="eyebrow">Channels</div>
        <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
          Connected accounts
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
          Connect the channels you already use. We read them to find roles. We never post as you.
        </p>
      </div>

      <Card style={{ padding: "1.2rem" }}>
        <SectionTitle eyebrow="Available" title="Add a channel" />
        <div className="grid-2" style={{ marginTop: "1rem" }}>
          {connections.loading && providers.length === 0 ? (
            <Skeleton height={120} />
          ) : null}
          {providers.map((provider) => {
            const Icon = ICONS[provider.key] ?? Link2;
            return (
              <div
                key={provider.key}
                className="surface"
                style={{ padding: "1rem", display: "flex", gap: "0.85rem", alignItems: "flex-start" }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    display: "grid",
                    placeItems: "center",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={17} />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="row row-wrap" style={{ gap: "0.4rem" }}>
                    <strong style={{ fontSize: "0.92rem" }}>{provider.label}</strong>
                    {provider.configured ? (
                      <Badge tone="success">ready</Badge>
                    ) : (
                      <Badge tone="warning">not configured</Badge>
                    )}
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 3 }}>
                    {(provider.features ?? []).join(" · ")}
                  </p>
                  <div style={{ marginTop: "0.7rem" }}>
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

      <Card style={{ padding: "1.2rem" }}>
        <SectionTitle eyebrow="Active" title="Your connections" />
        <div style={{ marginTop: "0.9rem" }}>
          {connections.loading && items.length === 0 ? (
            <Skeleton height={120} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Link2 size={26} />}
              title="No connections yet"
              description="Connect an email account so we can find the roles you already saved."
            />
          ) : (
            <div className="stack" style={{ gap: "0.5rem" }}>
              {items.map((connection) => {
                const Icon = ICONS[connection.provider] ?? Link2;
                return (
                  <div
                    key={connection.id}
                    className="row row-wrap"
                    style={{
                      gap: "0.8rem",
                      padding: "0.75rem 0.85rem",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <Icon size={16} style={{ color: "var(--accent)" }} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                        {connection.displayName ?? titleCase(connection.provider)}
                      </div>
                      <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                        {connection.accountEmail ?? "—"} · connected{" "}
                        {formatDateTime(connection.createdAt)}
                      </div>
                      <div className="row row-wrap" style={{ gap: "0.3rem", marginTop: "0.4rem" }}>
                        {connection.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="mono"
                            style={{
                              fontSize: "0.68rem",
                              padding: "0.1rem 0.35rem",
                              borderRadius: 4,
                              background: "var(--surface-2)",
                            }}
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
