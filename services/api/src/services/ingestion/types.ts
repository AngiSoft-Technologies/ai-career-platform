export interface RawJob {
  externalId: string;
  title: string;
  company: string;
  companyWebsite?: string;
  description: string;
  location?: string;
  country?: string;
  workMode?: "onsite" | "hybrid" | "remote";
  seniority?: "intern" | "junior" | "mid" | "senior" | "lead";
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  applyUrl: string;
  tags: string[];
  postedAt?: string;
  platform: string;
}

export interface JobSourceAdapter {
  name: string;
  type: string;
  url: string;
  fetchJobs: () => Promise<RawJob[]>;
}
