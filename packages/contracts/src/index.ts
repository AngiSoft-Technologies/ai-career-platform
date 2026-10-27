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
