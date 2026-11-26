"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { Badge, Button, Panel, PanelHead } from "@/components/ui";
import { LiveFrame } from "./LiveFrame";
import { GuidanceRail } from "./GuidanceRail";
import { useGuidedApply } from "./useGuidedApply";
import type { ApplicationWorkspacePayload } from "./types";

interface Props {
  applicationId: string;
  workspace: ApplicationWorkspacePayload;
  onWorkspaceChange?: () => void;
}

export function GuidedApplyWorkspace({ applicationId, workspace, onWorkspaceChange }: Props) {
  const guided = useGuidedApply({ applicationId, workspace, onWorkspaceChange });
  const [consent, setConsent] = useState(false);

  if (!guided.preparationReady) {
    return (
      <Panel>
        <PanelHead
          eyebrow="Preparation first"
          title="Finish stage 1 before opening the browser"
          description="The guided browser can only use an approved preparation. Review the role, answer missing inputs and approve your documents first."
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-app-border px-5 py-5">
          <Badge tone="warning">
            {workspace.preparation?.status?.replaceAll("_", " ").toLowerCase() ?? "not prepared"}
          </Badge>
          <Link
            href={`/applications/${applicationId}`}
            className="inline-flex h-9 items-center gap-2 rounded-app-md border border-app-accent/50 bg-app-accent/12 px-3 text-[0.8rem] font-semibold text-app-accent hover:bg-app-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            <ArrowLeft size={14} aria-hidden />
            Back to application preparation
          </Link>
        </div>
      </Panel>
    );
  }

  if (!guided.targetUrl) {
    return (
      <Panel>
        <PanelHead
          title="This role has no employer application URL"
          description="We cannot open a browser workspace without a public apply link. Add one in stage 1 or apply by email."
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <a
        href="#guided-frame"
        className="sr-only rounded-app-sm bg-app-accent px-3 py-2 text-app-accent-contrast focus:not-sr-only focus:absolute focus:z-50"
      >
        Skip to the live browser view
      </a>

      {guided.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-app-md border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-[0.82rem] text-app-danger"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>{guided.error}</span>
        </div>
      ) : null}

      {!guided.session ? (
        <Panel>
          <PanelHead
            eyebrow="Consent"
            title="Open this employer site in a private browser"
            description="A fresh, isolated browser will load the employer page. It has none of your logins or saved passwords, and it closes when you end the session."
            action={<Badge tone="accent" dot>Remote browser</Badge>}
          />
          <div className="grid gap-4 border-t border-app-border px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-3 text-[0.82rem] leading-relaxed text-app-muted">
              <p className="flex items-start gap-2">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-app-success" aria-hidden />
                Passwords, OTPs, card numbers and legal-consent values stay with you. The agent
                never fills or reads them.
              </p>
              <p className="flex items-start gap-2">
                <ExternalLink size={15} className="mt-0.5 shrink-0 text-app-warning" aria-hidden />
                Some employers block automated browsers. If that happens, switch to companion-tab
                mode and we will guide you beside your own browser.
              </p>
              <p className="truncate font-mono text-[0.7rem] text-app-soft" title={guided.targetUrl}>
                {guided.targetUrl}
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-app-md border border-app-border bg-app-surface-2/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--app-accent)]"
                />
                <span>
                  I understand this is a separate browser with no access to my accounts, and that I
                  must confirm any submission myself.
                </span>
              </label>
            </div>
            <Button
              type="button"
              disabled={!consent || guided.busy}
              loading={guided.busy}
              onClick={() => void guided.start()}
            >
              Open private workspace
            </Button>
          </div>
        </Panel>
      ) : null}

      {guided.session ? (
        <div className="flex min-h-[34rem] flex-col gap-4 lg:h-[calc(100vh-15rem)] lg:min-h-[34rem] lg:flex-row">
          <LiveFrame
            frameUrl={guided.frameUrl}
            url={guided.state?.url ?? guided.session.targetUrl ?? guided.targetUrl}
            title={guided.state?.title ?? "the employer application page"}
            mode={guided.mode}
            busy={guided.busy}
            onRefresh={() => void guided.refreshFrame()}
            onReturnToStart={() => void guided.returnToStart()}
          />
          <GuidanceRail guided={guided} />
        </div>
      ) : null}
    </div>
  );
}
