import type { CandidateProfile, Opportunity } from "@angisoft/job-radar-contracts";
import { aiChat, aiEmbed, isAiConfigured } from "./client.js";

export interface JobInsight {
  summary: string;
  highlights: string[];
  risks: string[];
}

export interface ProfileAnalysis {
  strengths: string[];
  gaps: string[];
  recommendations: string[];
}

function opportunityText(opportunity: Opportunity): string {
  return [
    `${opportunity.title} at ${opportunity.companyName}`,
    `${opportunity.city}, ${opportunity.country} (${opportunity.workMode})`,
    `Skills: ${opportunity.skills.join(", ") || "not specified"}`,
    opportunity.description,
  ].join("\n");
}

export function profileText(profile: CandidateProfile): string {
  return [
    `${profile.fullName} - ${profile.headline}`,
    `${profile.yearsExperience} years experience, ${profile.seniority} level`,
    `Location: ${profile.location}, ${profile.country}`,
    `Desired roles: ${profile.desiredRoles.join(", ") || "not specified"}`,
    `Skills: ${profile.skills.join(", ") || "not specified"}`,
    profile.summary,
  ].join("\n");
}

export async function embedOpportunity(
  opportunity: Opportunity,
): Promise<number[]> {
  const [embedding] = await aiEmbed([opportunityText(opportunity)]);
  if (!embedding) throw new Error("AI_EMPTY_EMBEDDINGS");
  return embedding;
}

export async function embedProfile(
  profile: CandidateProfile,
): Promise<number[]> {
  const [embedding] = await aiEmbed([profileText(profile)]);
  if (!embedding) throw new Error("AI_EMPTY_EMBEDDINGS");
  return embedding;
}

function parseJson<T>(raw: string, fallback: T): T {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return fallback;
  }
}

export async function summariseOpportunity(
  opportunity: Opportunity,
): Promise<JobInsight> {
  if (!isAiConfigured()) {
    return {
      summary: opportunity.description.slice(0, 280),
      highlights: opportunity.skills.slice(0, 5),
      risks: [],
    };
  }

  const raw = await aiChat(
    [
      {
        role: "system",
        content:
          "You are a career analyst for African job seekers. Reply with strict JSON only.",
      },
      {
        role: "user",
        content: `Analyse this job posting and reply with JSON of the shape {"summary": string (max 2 sentences), "highlights": string[] (3 items), "risks": string[] (0-3 items about missing requirements or red flags)}.\n\n${opportunityText(opportunity)}`,
      },
    ],
    { temperature: 0.2 },
  );

  return parseJson<JobInsight>(raw, {
    summary: opportunity.description.slice(0, 280),
    highlights: opportunity.skills.slice(0, 5),
    risks: [],
  });
}

export async function writeCoverLetter(
  profile: CandidateProfile,
  opportunity: Opportunity,
  tone: "professional" | "enthusiastic" | "concise" = "professional",
): Promise<string> {
  if (!isAiConfigured()) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const raw = await aiChat(
    [
      {
        role: "system",
        content:
          "You write honest, specific, ATS-friendly cover letters for African job seekers. Never invent employers, dates, degrees or metrics that the candidate did not provide. Plain text only, no markdown headings, no placeholders.",
      },
      {
        role: "user",
        content: `Write a ${tone} cover letter of at most 300 words for the role below. Candidate facts:\n${profileText(profile)}\n\nJob facts:\n${opportunityText(opportunity)}\n\nEnd with the candidate's full name.`,
      },
    ],
    { temperature: 0.5, maxTokens: 700 },
  );

  return raw.replace(/\s{3,}/g, "\n\n").trim();
}

export async function analyseProfile(
  profile: CandidateProfile,
  opportunities: Opportunity[],
): Promise<ProfileAnalysis> {
  if (!isAiConfigured()) {
    const skillCounts = new Map<string, number>();
    for (const opportunity of opportunities) {
      for (const skill of opportunity.skills) {
        skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
      }
    }
    const top = [...skillCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skill]) => skill);
    return {
      strengths: profile.skills.slice(0, 5),
      gaps: top.filter((skill) => !profile.skills.includes(skill)).slice(0, 5),
      recommendations: [
        "Complete your profile so matches improve.",
        "Review shortlisted roles in the application workspace.",
      ],
    };
  }

  const sample = opportunities
    .slice(0, 12)
    .map(
      (opportunity) =>
        `${opportunity.title} (${opportunity.skills.join(", ") || "no skills listed"})`,
    )
    .join("\n");

  const raw = await aiChat(
    [
      {
        role: "system",
        content:
          "You are a career coach for African job seekers. Reply with strict JSON only.",
      },
      {
        role: "user",
        content: `Given this candidate and a sample of the roles they can see, reply with JSON of the shape {"strengths": string[] (max 4), "gaps": string[] (max 4), "recommendations": string[] (max 3, actionable)}.\n\nCandidate:\n${profileText(profile)}\n\nSample roles:\n${sample}`,
      },
    ],
    { temperature: 0.3 },
  );

  return parseJson<ProfileAnalysis>(raw, {
    strengths: profile.skills.slice(0, 5),
    gaps: [],
    recommendations: [],
  });
}
