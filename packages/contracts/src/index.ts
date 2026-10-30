export type WorkMode = "onsite" | "hybrid" | "remote";
export type Seniority = "intern" | "junior" | "mid" | "senior" | "lead";
export type ApplicationMethod = "email" | "website" | "form" | "ats" | "unknown";

export type ApplicationStatus =
  | "DISCOVERED"
  | "SHORTLISTED"
  | "ANALYZED"
  | "APPLICATION_PREPARATION"
  | "READY_TO_APPLY"
  | "APPLIED"
  | "ACKNOWLEDGED"
  | "NO_RESPONSE"
  | "SCREENING"
  | "ASSESSMENT"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED"
  | "WITHDRAWN"
  | "EXPIRED"
  | "FAILED";

export const APPLICATION_STATUS_TRANSITIONS: Partial<
  Record<ApplicationStatus, ApplicationStatus[]>
> = {
  SHORTLISTED: ["ANALYZED", "WITHDRAWN"],
  ANALYZED: ["APPLICATION_PREPARATION", "WITHDRAWN"],
  APPLICATION_PREPARATION: ["READY_TO_APPLY", "WITHDRAWN"],
  READY_TO_APPLY: ["APPLIED", "WITHDRAWN"],
  APPLIED: ["ACKNOWLEDGED", "NO_RESPONSE", "REJECTED", "WITHDRAWN"],
  ACKNOWLEDGED: ["SCREENING", "REJECTED", "NO_RESPONSE", "WITHDRAWN"],
  SCREENING: ["ASSESSMENT", "INTERVIEW", "REJECTED", "WITHDRAWN"],
  ASSESSMENT: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["OFFER", "REJECTED", "WITHDRAWN"],
  OFFER: ["REJECTED", "WITHDRAWN"],
  NO_RESPONSE: ["ACKNOWLEDGED", "REJECTED", "WITHDRAWN"],
  DISCOVERED: ["SHORTLISTED", "WITHDRAWN"],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
  FAILED: [],
};

export interface CandidateProfile {
  id: string;
  userId: string;
  email?: string;
  name?: string | null;
  fullName: string;
  headline: string;
  summary: string;
  location: string;
  country: string;
  yearsExperience: number;
  seniority: Seniority;
  desiredRoles: string[];
  skills: string[];
  preferredCountries: string[];
  preferredLocations: string[];
  remotePreferred: boolean;
  updatedAt: string;
  version: number;
}

export interface Opportunity {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  companyWebsite?: string;
  title: string;
  description: string;
  country: string;
  city: string;
  workMode: WorkMode;
  seniority: Seniority;
  employmentType: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  applyUrl: string;
  applicationMethod: ApplicationMethod;
  platform: string;
  postedAt: string;
  expiresAt?: string;
  status: string;
  skills: string[];
}

export interface MatchFactors {
  skills: number;
  seniority: number;
  location: number;
  role: number;
  freshness: number;
}

export interface MatchResult {
  opportunityId: string;
  score: number;
  factors: MatchFactors;
  explanation: string;
  gaps: string[];
}

export interface ApplicationBlueprint {
  id: string;
  opportunityId: string;
  method: ApplicationMethod;
  platform: string;
  applicationUrl: string;
  requiredDocuments: string[];
  fields: string[];
  questions: string[];
  instructions: string;
  generatedAt: string;
}

export interface Application {
  id: string;
  userId: string;
  opportunityId: string;
  status: ApplicationStatus;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DocumentDraft {
  id: string;
  applicationId?: string;
  opportunityId: string;
  parentDocumentId?: string;
  type: "cv" | "cover_letter" | "application_email" | "answer";
  title: string;
  content: string;
}

export interface OpportunitySearch {
  country?: string;
  q?: string;
  workMode?: WorkMode;
  seniority?: Seniority;
  limit?: number;
}

export interface EventEnvelope<T = unknown> {
  id: string;
  type: string;
  occurredAt: string;
  data: T;
}

export type RealtimeEvent =
  | EventEnvelope<{ applicationId: string; status: ApplicationStatus }>
  | EventEnvelope<{ opportunityId: string; score: number }>
  | EventEnvelope<{ documentId: string; type: string }>;

export const API_VERSION = "v1" as const;
export const API_BASE_PATH = "/v1" as const;

// ============================================================================
// n8n Workflow Schemas
// ============================================================================

export interface N8nNodeParameter {
  [key: string]: unknown;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string; // e.g. 'n8n-nodes-base.httpRequest'
  typeVersion: number;
  position: [number, number];
  parameters: N8nNodeParameter;
  credentials?: Record<string, string>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  executeOnce?: boolean;
  alwaysOutputData?: boolean;
  continueOnFail?: boolean;
}

export interface N8nConnection {
  node: string;
  type: "main" | "branch";
  index: number;
}

export interface N8nConnections {
  [nodeName: string]: {
    main?: N8nConnection[][];
    branch?: N8nConnection[][];
  };
}

export interface N8nWorkflowSettings {
  executionOrder?: "v1" | "v2";
  saveManualExecutions?: boolean;
  saveDataErrorExecution?: "all" | "first" | "none";
  saveDataSuccessExecution?: "all" | "first" | "none";
  executionTimeout?: number;
  errorWorkflow?: string;
  timezone?: string;
}

export interface N8nWorkflow {
  id?: string;
  name: string;
  displayName?: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  active?: boolean;
  settings?: N8nWorkflowSettings;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface N8nWorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  definition: N8nWorkflow;
  changelog?: string;
  createdAt: string;
  createdBy?: string;
  deployedAt?: string;
  deployedBy?: string;
}

export interface N8nWorkflowDeployment {
  id: string;
  workflowId: string;
  version: number;
  n8nWorkflowId?: string;
  n8nVersionId?: string;
  status: "pending" | "success" | "failed" | "rolled_back";
  errorMessage?: string;
  deployedBy?: string;
  deployedAt: string;
  completedAt?: string;
}

export interface N8nWebhook {
  id: string;
  workflowId: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  isActive: boolean;
  createdAt: string;
}

export interface N8nExecutionResult {
  executionId: string;
  workflowId: string;
  status: "success" | "error" | "running" | "waiting" | "crashed";
  data?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  mode?: "manual" | "trigger" | "webhook" | "cli" | "api";
}

export interface N8nWorkflowTrigger {
  workflowId: string;
  data: Record<string, unknown>;
  options?: {
    waitForCompletion?: boolean;
    timeoutMs?: number;
  };
}

export interface N8nWorkflowTriggerResult {
  executionId: string;
  status: "success" | "error" | "running" | "waiting";
  data?: Record<string, unknown>;
  error?: string;
}

export type N8nWorkflowCategory = 
  | "job-processing"
  | "candidate-processing"
  | "document-generation"
  | "enrichment"
  | "monitoring"
  | "automation"
  | "notification"
  | "integration"
  | "other";

export interface N8nWorkflowMetadata {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: N8nWorkflowCategory;
  tags: string[];
  definition: N8nWorkflow;
  n8nWorkflowId?: string;
  n8nVersionId?: string;
  deployedAt?: string;
  deployedBy?: string;
  version: number;
  changelog?: string;
  previousVersionId?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface N8nWorkflowListItem {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: N8nWorkflowCategory;
  tags: string[];
  isActive: boolean;
  version: number;
  deployedAt?: string;
  deployedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface N8nWorkflowCreateInput {
  name: string;
  displayName: string;
  description?: string;
  category: N8nWorkflowCategory;
  tags?: string[];
  definition: N8nWorkflow;
  changelog?: string;
}

export interface N8nWorkflowUpdateInput {
  displayName?: string;
  description?: string;
  category?: N8nWorkflowCategory;
  tags?: string[];
  definition?: N8nWorkflow;
  isActive?: boolean;
  changelog?: string;
}

export interface N8nDeployInput {
  workflowId: string;
  version?: number;
  changelog?: string;
  force?: boolean;
}

export interface N8nDeployResult {
  id: string;
  workflowId: string;
  version: number;
  n8nWorkflowId?: string;
  n8nVersionId?: string;
  status: "pending" | "success" | "failed" | "rolled_back";
  errorMessage?: string;
  deployedAt: string;
  completedAt?: string;
}

export interface N8nExecutionStatus {
  executionId: string;
  workflowId: string;
  status: "success" | "error" | "running" | "waiting" | "crashed";
  data?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  mode?: string;
}

export interface N8nWorkflowListResponse {
  items: N8nWorkflowListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface N8nApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface N8nWebhookRegistration {
  workflowId: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  isActive: boolean;
}

export const N8N_WORKFLOW_CATEGORIES: readonly N8nWorkflowCategory[] = [
  "job-processing",
  "candidate-processing",
  "document-generation",
  "enrichment",
  "monitoring",
  "automation",
  "notification",
  "integration",
  "other",
] as const;

// ---------------------------------------------------------------------------
// Auth contract
//
// The API owns identity. Clients exchange credentials for Job Radar tokens at
// /v1/auth/* and never contact the identity provider directly.
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  /** Short-lived access token. Send as `Authorization: Bearer <token>`. */
  token: string;
  tokenType: "Bearer";
  expiresAt: string;
  /** Single-use refresh token. Rotated on every /v1/auth/refresh call. */
  refreshToken: string;
  refreshExpiresAt: string;
  user?: AuthUser | null;
  roles?: string[];
  permissions?: string[];
}

export interface AuthSessionState {
  authenticated: boolean;
  user?: AuthUser | null;
  roles?: string[];
  permissions?: string[];
  mode: "live" | "demo";
}

export interface SignUpRequest {
  email: string;
  password: string;
  name: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface GoogleSignInRequest {
  idToken: string;
  nonce?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface SignOutRequest {
  refreshToken?: string;
}

/** Stable error codes returned by /v1/auth/*. */
export type AuthErrorCode =
  | "INVALID_EMAIL"
  | "INVALID_CREDENTIALS"
  | "EMAIL_IN_USE"
  | "WEAK_PASSWORD"
  | "EMAIL_NOT_VERIFIED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "GOOGLE_EMAIL_UNVERIFIED"
  | "PROVIDER_REJECTED"
  | "AUTH_NOT_CONFIGURED"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_REUSED"
  | "ACCOUNT_DISABLED"
  | "INVALID_REDIRECT"
  | "INVALID_STATE"
  | "IDENTITY_ALREADY_LINKED"
  | "UNAUTHORIZED";

export interface AuthErrorResponse {
  error: string;
  code: AuthErrorCode;
}

/** Where the API may send the browser after a social sign-in completes. */
export const AUTH_CALLBACK_REDIRECT_ALLOWLIST = [
  "jobradar://auth/callback",
] as const;

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetRequestResponse {
  message: string;
}

export interface PasswordResetConfirm {
  token: string;
  password: string;
}

export interface GoogleLinkTicket {
  ticket: string;
}

/**
 * The session the API hands back after a social sign-in.
 *
 * The values travel in the URL fragment so they never reach a server.
 */
export interface AuthCallbackFragment {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  refresh_expires_at?: string;
  /** Set when the flow only linked a provider account. */
  linked?: "1";
}
