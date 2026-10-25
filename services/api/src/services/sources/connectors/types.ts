export type SourceKind = "ats" | "html" | "rss" | "sitemap" | "api";
export type SourceStatus = "pending_review" | "verified" | "rejected" | "disabled";

export type WorkMode = "onsite" | "hybrid" | "remote";
export type Seniority = "intern" | "junior" | "mid" | "senior" | "lead";

export interface ConnectorConfig {
  url: string;
  kind: SourceKind;
  adapter?: string;
  options?: Record<string, unknown>;
}

export interface ConnectorJob {
  externalId: string;
  title: string;
  company: string;
  companyWebsite?: string;
  description: string;
  location?: string;
  country?: string;
  workMode?: WorkMode;
  seniority?: Seniority;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  applyUrl: string;
  tags: string[];
  postedAt?: string;
  platform: string;
  sourceUrl?: string;
}

export interface HealthResult {
  ok: boolean;
  status?: number;
  error?: string;
  contentType?: string;
}

export interface Connector {
  name: string;
  kind: SourceKind;
  detect(url: string, options?: Record<string, unknown>): boolean;
  fetchJobs(config: ConnectorConfig): Promise<ConnectorJob[]>;
  healthCheck(config: ConnectorConfig): Promise<HealthResult>;
}

export interface VerificationResult {
  ok: boolean;
  status: SourceStatus;
  adapter: string;
  kind: SourceKind;
  httpStatus?: number;
  contentType?: string;
  jobLinksFound: number;
  sampleLinks: string[];
  reason?: string;
  checkedAt: string;
}
