"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Meta, Page, PageHeader, Panel, PanelHead, Skeleton } from "@/components/ui";
import { EmailApplyPanel, GuidedApplyWorkspace } from "@/components/guided-apply";
import type { ApplicationWorkspacePayload } from "@/components/guided-apply/types";
import { useApi } from "@/lib/hooks";

/** Stage 2: a full-page workspace around the employer's application flow. */
export default function ApplyPage() {
  const params = useParams<{ id: string }>();
  const workspaceQuery = useApi<{ workspace: ApplicationWorkspacePayload }>(
    `/applications/${params.id}/workspace`,
  );
  const workspace = workspaceQuery.data?.workspace;
  const emailSubmission =
    workspace?.blueprint.method === "email" ||
    workspace?.preparation?.analysis?.method === "email";

  return (
    <Page className="gap-5 lg:gap-6">
      <PageHeader
        eyebrow="Stage 2 · Guided apply"
        title={emailSubmission ? "Apply by email, with your package ready" : "Apply, with the page in front of you"}
        description={
          emailSubmission
            ? "We open the employer's message in your own Gmail and keep the approved PDFs close. Nothing is sent until you send it."
            : "A private browser opens the employer site while our guidance rail reads the form, surfaces blockers and keeps your approved PDFs close. You confirm every submission."
        }
        actions={
          <Link
            href={`/applications/${params.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-app-md border border-white/25 px-3 text-[0.8rem] font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ArrowLeft size={14} aria-hidden />
            Back to application
          </Link>
        }
        meta={
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <Meta label="Role" value={workspace?.opportunity?.title ?? "Loading role"} />
            <Meta
              label="Employer"
              value={workspace?.opportunity?.companyName ?? workspace?.opportunity?.company_name ?? "—"}
            />
            <Meta label="Platform" value={workspace?.blueprint.platform ?? "Employer site"} />
          </dl>
        }
      />

      {workspaceQuery.loading ? (
        <Panel>
          <PanelHead title="Preparing the workspace" description="Loading your approved preparation and submission history." />
          <div className="space-y-3 border-t border-app-border px-5 py-5">
            <Skeleton height={18} width="70%" />
            <Skeleton height={18} width="52%" />
            <Skeleton height={140} />
          </div>
        </Panel>
      ) : workspaceQuery.error || !workspace ? (
        <Panel>
          <PanelHead
            title="The application workspace could not be loaded"
            description={workspaceQuery.error ?? "This application was not found for your account."}
          />
          <div className="border-t border-app-border px-5 py-4">
            <Link
              href={`/applications/${params.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-app-md border border-app-accent/50 bg-app-accent/12 px-3 text-[0.8rem] font-semibold text-app-accent"
            >
              <ArrowLeft size={14} aria-hidden />
              Return to stage 1
            </Link>
          </div>
        </Panel>
      ) : (
        emailSubmission ? (
          <EmailApplyPanel
            applicationId={params.id}
            workspace={workspace}
            onComplete={workspaceQuery.refresh}
          />
        ) : (
          <GuidedApplyWorkspace
            applicationId={params.id}
            workspace={workspace}
            onWorkspaceChange={workspaceQuery.refresh}
          />
        )
      )}
    </Page>
  );
}
