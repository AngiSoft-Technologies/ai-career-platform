import type {
  ApplicationBlueprint,
  ApplicationGuidanceSession,
  ApplicationPreparation,
  ApplicationSubmissionRun,
  GuidanceDetectedField,
  GuidanceHint,
  SitePlaybook,
} from "@angisoft/mboqara-contracts";

export type {
  ApplicationGuidanceSession,
  ApplicationPreparation,
  ApplicationSubmissionRun,
  GuidanceDetectedField,
  GuidanceHint,
  SitePlaybook,
};

export interface OpportunitySummary {
  id: string;
  title: string;
  /** The workspace endpoint returns raw SQL aliases; the camel cases are kept for callers with mapped data. */
  companyName?: string;
  company_name?: string;
  applyUrl?: string;
  apply_url?: string;
  platform?: string;
}

export interface WorkspaceDocument {
  id: string;
  title: string;
  type: string;
  createdAt?: string;
}

/** The response from `GET /applications/:id/workspace`. */
export interface ApplicationWorkspacePayload {
  applicationId: string;
  opportunityId: string;
  opportunity: OpportunitySummary | null;
  blueprint: ApplicationBlueprint;
  preparation: ApplicationPreparation | null;
  submission: ApplicationSubmissionRun | null;
  documents: WorkspaceDocument[];
  status: string;
  version: number;
}

export interface BrowserState {
  url: string;
  title: string;
  fields: GuidanceDetectedField[];
  visibleText: string;
  blockers: string[];
}

export interface BrowserSessionInfo {
  id: string;
  applicationId: string;
  guidanceSessionId: string;
  targetUrl: string;
  status: string;
  streamPath: string;
  statePath: string;
  createdAt: string;
}

export interface BrowserCommand {
  type: "navigate" | "click" | "fill" | "select" | "upload" | "submit";
  url?: string;
  selector?: string;
  key?: string;
  value?: string;
  filename?: string;
  confirm?: true;
}

export interface WorkspaceContext {
  applicationId: string;
  guidanceSessionId: string;
}
