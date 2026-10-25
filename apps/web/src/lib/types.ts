export type ThemeKey = "aurora" | "editorial" | "terminal" | "kinetic" | "atlas";

export type RoleKey =
  | "job_seeker"
  | "analyst"
  | "moderator"
  | "support_agent"
  | "source_curator"
  | "automation"
  | "admin"
  | "super_admin";

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
  workMode: string;
  seniority: string;
  employmentType: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  applyUrl: string;
  applicationMethod: string;
  platform: string;
  postedAt: string;
  expiresAt?: string;
  status: string;
  skills: string[];
  riskScore?: number | null;
  riskAction?: string | null;
  riskFlags?: string[];
  match?: MatchResult;
}

export interface MatchResult {
  opportunityId: string;
  score: number;
  factors: Record<string, number>;
  explanation: string;
  gaps: string[];
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  headline?: string;
  summary?: string;
  phone?: string;
  location?: string;
  skills: string[];
  yearsExperience?: number;
  seniority?: string;
  links?: string[];
}

export interface Preferences {
  preferredCountries: string[];
  preferredLocations: string[];
  preferredRoles: string[];
  desiredSeniority: string;
  minSalary: number | null;
  currency: string;
  remoteOnly: boolean;
  willingToRelocate: boolean;
  notificationsEnabled: boolean;
  updatedAt?: string | null;
}

export interface Application {
  id: string;
  userId: string;
  opportunityId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface JobDocument {
  id: string;
  opportunityId: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface FollowUp {
  id: string;
  applicationId: string;
  opportunityTitle: string;
  companyName: string;
  dueAt: string;
  status: string;
  channel: string;
  note: string;
  completedAt?: string | null;
  createdAt: string;
}

export interface JobSource {
  id: string;
  type: string;
  name: string;
  url: string;
  kind: string;
  adapter?: string | null;
  status: string;
  health: string;
  reliability: number;
  discoveredCount: number;
  checkFrequencyMinutes: number;
  nextCheckAt: string;
  lastCheckedAt?: string | null;
  createdAt: string;
  verification?: Record<string, unknown>;
}

export interface AtsIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  field?: string;
  hint?: string;
}

export interface AtsReport {
  score: number;
  grade: "poor" | "fair" | "good" | "excellent";
  passed: boolean;
  issues: AtsIssue[];
  sections: string[];
  metrics: {
    wordCount: number;
    characterCount: number;
    bulletCount: number;
    averageBulletLength: number;
    keywordCoverage: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    hasContactSection: boolean;
    hasExperienceSection: boolean;
    hasEducationSection: boolean;
    hasSkillsSection: boolean;
  };
}

export interface ApplicationAnalysis {
  platform: string;
  method: string;
  analysisUrl: string;
  fields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    suggestedValue?: string;
    options?: string[];
  }>;
  questions: Array<{ question: string; required: boolean }>;
  requiredDocuments: string[];
  instructions: string[];
  requiresUserInput: Array<{ field: string; reason: string }>;
  rawTitle?: string;
  emailRecipient?: string;
  emailSubject?: string;
}

export interface Connection {
  id: string;
  provider: string;
  providerAccountId?: string | null;
  accountEmail?: string | null;
  displayName?: string | null;
  scopes: string[];
  status: string;
  metadata: Record<string, unknown>;
  tokenExpiresAt?: string | null;
  createdAt: string;
}

export interface AdminStats {
  totals: {
    users: number;
    activeOpportunities: number;
    applications: number;
    sources: number;
    documents: number;
    aiTasks: number;
    events24h: number;
  };
  opportunitiesByCountry: Array<{ country: string; count: number }>;
  sourcesByType: Array<{ type: string; count: number; jobs: number }>;
  riskDistribution: Array<{ risk_action: string; count: number; avg_score: number }>;
  pipelineByStatus: Array<{ status: string; count: number }>;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
}

export interface PermissionDefinition {
  name: string;
  description: string;
  resource: string;
  action: string;
}
