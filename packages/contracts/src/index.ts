export * from "./templates.js";

export type WorkMode = "onsite" | "hybrid" | "remote";
export type Seniority = "intern" | "junior" | "mid" | "senior" | "lead";
export type ApplicationMethod = "email" | "website" | "form" | "ats" | "unknown";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "industrial_attachment" | "trainee" | "freelance";

/**
 * Whether a candidate can actually hold a role, read off what the
 * posting says rather than off the country it happens to name.
 *
 * The question the product exists to answer is "is this role open to
 * someone in Kenya" — and the answer is on the page, or it is not there
 * at all. `unknown` means the posting said nothing about location or
 * authorisation, which is not a yes and not a no.
 */
export type Eligibility = "eligible" | "unlikely" | "ineligible" | "unknown";

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
  READY_TO_APPLY: ["APPLIED", "APPLICATION_PREPARATION", "WITHDRAWN"],
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
  phone?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  yearsExperience: number;
  seniority: Seniority;
  desiredRoles: string[];
  skills: string[];
  preferredCountries: string[];
  preferredLocations: string[];
  remotePreferred: boolean;
  /** Commitments the candidate is willing to accept. */
  employmentTypes: string[];
  willingToRelocate: boolean;
  notificationsEnabled: boolean;
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
  /** Where the employer published this role — the board, vendor or page. */
  sourceKind?: string;
  postedAt: string;
  expiresAt?: string;
  status: string;
  skills: string[];
  /** Can a candidate in Kenya hold this, as the posting states it. */
  eligibility?: Eligibility;
  /** Why the eligibility decision was what it was, for the user to read. */
  eligibilityReasons?: string[];
  /** What the trust engine made of the posting, 0–100. */
  riskScore?: number;
  /** What it decided: `publish`, `hold`, `reject`. */
  riskAction?: string;
  /** What it found, in its own words. */
  riskFlags?: string[];
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

/**
 * One of the five roles posted in the last 24 hours that the candidate is
 * actually qualified for. This is deliberately a separate contract from the
 * ranked catalogue: the dashboard asks "what can I apply to today", not
 * "what is the best thing on the board".
 */
export interface DailyMatchItem extends Opportunity {
  match: MatchResult;
}

export interface DailyMatchesResponse {
  /** UTC day the selection belongs to, `YYYY-MM-DD`. */
  date: string;
  items: DailyMatchItem[];
  total: number;
}

export interface ProfessionFacet {
  id: string;
  name: string;
  slug: string;
  count: number;
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

export type ApplicationPreparationStatus =
  | "QUEUED"
  | "RUNNING"
  | "NEEDS_INPUT"
  | "AWAITING_REVIEW"
  | "READY"
  | "BLOCKED"
  | "FAILED"
  | "STALE";

export interface ApplicationMissingInput {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "number" | "date" | "select" | "textarea" | "file" | "boolean";
  reason: string;
  required: boolean;
  suggestedValue?: string;
  options?: string[];
  /**
   * True when the candidate must complete this step personally on the
   * employer's page. The server never stores or auto-fills the value.
   */
  requiresManualAction?: boolean;
}

export interface ApplicationPreparationDocumentIds {
  cv?: string;
  coverLetter?: string;
  email?: string;
  answers?: string;
}

export interface ApplicationPreparation {
  id: string;
  userId: string;
  opportunityId: string;
  applicationId?: string;
  status: ApplicationPreparationStatus;
  phase: string;
  version: number;
  sourceFingerprint: string;
  analysis: Record<string, unknown>;
  requirements: Record<string, unknown>;
  employerIntelligence: Record<string, unknown>;
  documentIds: ApplicationPreparationDocumentIds;
  missingInputs: ApplicationMissingInput[];
  userInputs: Record<string, string>;
  approvedAt?: string;
  approvedFingerprint?: string;
  preparedDocumentIds?: string[];
  preparedAt?: string;
  errorCode?: string;
  errorDetail?: string;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationSubmissionStatus =
  | "REQUESTED"
  | "CLAIMED"
  | "RUNNING"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_HUMAN"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type ApplicationSubmissionMethod = "browser" | "manual_email";

export interface ApplicationSubmissionField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  value?: string;
  options?: string[];
}

export interface ApplicationSubmissionRun {
  id: string;
  userId: string;
  applicationId: string;
  preparationId: string;
  status: ApplicationSubmissionStatus;
  method: ApplicationSubmissionMethod;
  currentStep: string;
  targetUrl: string;
  allowedHosts: string[];
  fields: ApplicationSubmissionField[];
  result: Record<string, unknown>;
  errorCode?: string;
  errorDetail?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * How the employer page is presented in the full-page application workspace.
 * `remote_browser` renders an isolated browser streamed into the route;
 * `companion_tab` keeps the workspace beside a page in the person's own
 * browser for sites that block embedding or require an existing login.
 */
export type GuidanceMode = "remote_browser" | "companion_tab" | "email_compose";

export type GuidanceSessionStatus =
  | "ACTIVE"
  | "WAITING_FOR_HUMAN"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export type GuidanceHintSeverity = "info" | "warning" | "action";

export type GuidanceSuggestedAction =
  | "fill"
  | "upload"
  | "click_next"
  | "wait_for_user"
  | "stop";

export interface GuidanceHint {
  id: string;
  title: string;
  body: string;
  severity: GuidanceHintSeverity;
  suggestedAction?: GuidanceSuggestedAction;
  targetFieldKey?: string;
  createdAt: string;
  acknowledgedAt?: string;
}

export interface GuidanceDetectedField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  value?: string;
  options?: string[];
  /** The server will never fill a field the candidate must complete. */
  manualOnly?: boolean;
}

export interface ApplicationGuidanceSession {
  id: string;
  applicationId: string;
  submissionRunId?: string;
  mode: GuidanceMode;
  status: GuidanceSessionStatus;
  targetUrl?: string;
  targetHost?: string;
  siteKey?: string;
  playbookVersion?: number;
  hints: GuidanceHint[];
  detectedFields: GuidanceDetectedField[];
  blockers: string[];
  consentAt: string;
  lastObservationAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SitePlaybookStep {
  label: string;
  action: GuidanceSuggestedAction;
  fieldKey?: string;
  note?: string;
}

export interface SitePlaybook {
  id: string;
  siteKey: string;
  host: string;
  platform?: string;
  version: number;
  status: "PROPOSED" | "PUBLISHED" | "REJECTED";
  steps: SitePlaybookStep[];
  blockerPatterns: string[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

/** A long-running browser assigned to one application guidance session. */
export interface BrowserWorkspace {
  id: string;
  applicationId: string;
  guidanceSessionId: string;
  status: "STARTING" | "READY" | "BUSY" | "FAILED" | "CLOSED";
  /** Same-origin path that streams screenshots/accessibility state. */
  streamPath?: string;
  targetUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserAgentDevice {
  id: string;
  name: string;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  lastSeenAt?: string;
  createdAt: string;
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
  /**
   * The candidate's original/base resume or cover letter. Tailored documents
   * are derived from this one; clients use it for role-fit analysis.
   */
  isBase?: boolean;
  type: "cv" | "cover_letter" | "application_email" | "answer";
  title: string;
  content: string;
}

export interface OpportunitySearch {
  country?: string;
  q?: string;
  workMode?: WorkMode;
  employmentType?: EmploymentType;
  seniority?: Seniority;
  /** Profession taxonomy slug (matches `profession_taxonomy.slug`). */
  profession?: string;
  eligibility?: Eligibility;
  semantic?: boolean;
  ranked?: boolean;
  limit?: number;
  offset?: number;
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
// The API owns identity. Clients exchange credentials for mboqara tokens at
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
  /** When the user last completed a step-up verification. */
  verifiedAt?: string | null;
  /** True when the session is due for a step-up verification. */
  requiresVerification?: boolean;
  mode: "live" | "demo";
}

export type VerificationMethodName =
  | "totp"
  | "email_link"
  | "email_otp"
  | "passkey"
  | "biometric";

export interface VerificationMethod {
  method: VerificationMethodName;
  destination: string;
  isDefault: boolean;
  enrolled: boolean;
  lastUsedAt?: string | null;
}

export interface VerificationMethodsResponse {
  methods: VerificationMethod[];
}

export interface TotpEnrollment {
  secret: string;
  otpauthUrl: string;
}

export interface VerificationRequest {
  method?: VerificationMethodName;
  redirectUri?: string;
  /** Picks which enrolled device a `biometric` challenge is bound to. */
  deviceId?: string;
}

export interface VerificationRequestResponse {
  method: VerificationMethodName;
  requiresCode: boolean;
  sent: boolean;
  /** Single-use challenge the client must sign for `biometric`. */
  challengeId?: string;
}

export interface BiometricEnrollment {
  deviceId: string;
  /** Returned exactly once — the client must store it in the keystore. */
  secret: string;
}

export interface BiometricVerification {
  method: "biometric";
  deviceId: string;
  challengeId: string;
  /** HMAC-SHA256(secret, challengeId), hex-encoded. */
  proof: string;
}

export type VerificationConfirm =
  | { method: "totp"; code: string }
  | BiometricVerification;

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
  | "METHOD_NOT_AVAILABLE"
  | "INVALID_CODE"
  | "VERIFICATION_RATE_LIMITED"
  | "VERIFICATION_REQUIRED"
  | "UNAUTHORIZED";

export interface AuthErrorResponse {
  error: string;
  code: AuthErrorCode;
}

/** Where the API may send the browser after a social sign-in completes. */
export const AUTH_CALLBACK_REDIRECT_ALLOWLIST = [
  "mboqara://auth/callback",
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

// ---------------------------------------------------------------------------
// Platform hardening contracts
// ---------------------------------------------------------------------------

export const PUSH_PROVIDERS = ["fcm", "apns", "huawei", "samsung"] as const;
export type PushProvider = (typeof PUSH_PROVIDERS)[number];

export interface DeviceRegistrationInput {
  provider: PushProvider;
  /** Never echoed back: the API stores only a hash and an optional ciphertext. */
  token: string;
  deviceId?: string;
  platform?: string;
  appVersion?: string;
  locale?: string;
  topics?: string[];
}

export interface DeviceSummary {
  id: string;
  provider: PushProvider;
  tokenHint: string;
  deviceId: string;
  platform: string;
  appVersion: string;
  locale: string;
  topics: string[];
  enabled: boolean;
  lastSeenAt: string | null;
  createdAt: string | null;
}

export interface QuietHours {
  /** 24-hour HH:MM strings, interpreted in UTC. */
  start: string;
  end: string;
}

export type SearchAlertCadence = "realtime" | "daily" | "weekly";
export type SearchAlertChannel = "in_app" | "push" | "email";

export interface SavedSearchInput {
  name: string;
  query?: Record<string, unknown>;
  alertEnabled?: boolean;
  cadence?: SearchAlertCadence;
  quietHours?: QuietHours | null;
  channels?: SearchAlertChannel[];
}

export interface SavedSearch extends Required<Omit<SavedSearchInput, "quietHours">> {
  id: string;
  quietHours: QuietHours | null;
  lastSeenAt: string | null;
  lastEvaluatedAt: string | null;
  newCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface JobAlertsSummary {
  items: SavedSearch[];
  total: number;
  activeCount: number;
  unreadCount: number;
}

export interface PrivacySettings {
  allowAnalytics: boolean;
  allowPersonalisation: boolean;
  screenshotProtection: boolean;
  updatedAt: string | null;
}

export interface UserExportBundle {
  generatedAt: string;
  user: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  applications: Record<string, unknown>[];
  followups: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  savedSearches: Record<string, unknown>[];
}

export type TimelineEntryKind =
  | "status"
  | "interview"
  | "note"
  | "attachment"
  | "followup";

export interface TimelineEntry {
  kind: TimelineEntryKind;
  at: string;
  title: string;
  body: string;
}

export interface InterviewInput {
  stage?: string;
  startsAt: string;
  location?: string;
  contact?: string;
  notes?: string;
}

export interface ApplicationNoteInput {
  body: string;
}

export interface ApplicationAttachmentInput {
  fileName: string;
  /** Must be inside the caller's storage prefix. */
  storageKey: string;
  mimeType?: string;
}

export interface FeedStateInput {
  opportunityId: string;
  seen?: boolean;
  saved?: boolean;
  applied?: boolean;
}

export interface FeedStateItem {
  opportunityId: string;
  seenAt: string | null;
  savedAt: string | null;
  appliedAt: string | null;
}

/** A wish-list row: the full role plus the moment it was saved. */
export interface SavedOpportunity {
  opportunity: Opportunity;
  savedAt: string;
}

export interface DocumentVersion {
  id: string;
  version: number;
  title: string;
  content: string;
  template: string | null;
  parentDocumentId: string | null;
  createdAt: string | null;
}

export interface ClientConfig {
  minSupportedVersion: string;
  forceUpdate: boolean;
  maintenanceMode: boolean;
  featureFlags: Record<string, boolean>;
  serverTime: string;
  apiVersion: string;
}

export const ANALYTICS_EVENTS = [
  "search",
  "view_job",
  "save_job",
  "match_view",
  "apply_start",
  "apply_submit",
  "doc_generate",
  "doc_export",
  "followup_set",
  "notification_open",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsEventInput {
  event: AnalyticsEventName;
  properties?: Record<string, string | number | boolean | null>;
  consent: boolean;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
