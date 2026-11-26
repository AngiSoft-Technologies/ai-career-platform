import type { ApplicationPreparation, JobDocument, Opportunity, Profile } from "@/lib/types";

/**
 * Reading helpers for the discovery detail view.
 *
 * The posting is the only source of facts about the job. Where a section is
 * absent, the durable preparation record is allowed to supply one, but the
 * UI says so explicitly. Nothing here turns a skill guess into a candidate
 * claim.
 */

export interface RoleCriteria {
  responsibilities: string[];
  requirements: string[];
  /** True when a section came from the preparation agent rather than the text. */
  prepared: {
    responsibilities: boolean;
    requirements: boolean;
  };
}

const RESPONSIBILITY_HEADING = /^(what you(?:'|’)?ll do|responsibilities|responsibility|duties|key duties|key responsibilities|day[- ]to[- ]day)\b/i;
const REQUIREMENT_HEADING = /^(requirements?|qualifications?|what you(?:'|’)?ll bring|what we(?:'|’)?re looking for|about you|skills(?: and experience)?|must[- ]have|you have|minimum requirements?|preferred qualifications?)\b/i;

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function cleanLine(value: string): string {
  return value
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headingKind(value: string): "responsibilities" | "requirements" | "other" | null {
  const line = cleanLine(value).replace(/:$/, "");
  if (!line || line.length > 70) return null;
  if (RESPONSIBILITY_HEADING.test(line)) return "responsibilities";
  if (REQUIREMENT_HEADING.test(line)) return "requirements";
  if (/^#{1,6}\s/.test(value) || /^[A-Z][^.!?]{2,60}:$/.test(value)) return "other";
  return null;
}

function sectionFromDescription(
  description: string,
  target: "responsibilities" | "requirements",
): string[] {
  const lines = (description || "").split(/\r?\n/);
  const found: string[] = [];
  let collecting = false;

  for (const raw of lines) {
    const kind = headingKind(raw);
    if (kind) {
      if (collecting) break;
      collecting = kind === target;
      continue;
    }
    if (!collecting) continue;

    const line = cleanLine(raw);
    if (line.length >= 12 && !/^https?:\/\//i.test(line)) found.push(line);
    if (found.length >= 16) break;
  }

  return unique(found).slice(0, 12);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return unique(
    value.filter((item): item is string => typeof item === "string"),
  );
}

function stringsFromKeys(value: unknown, keys: string[]): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const found: string[] = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[_-]+/g, "");
    if (!keys.some((wanted) => normalized.includes(wanted))) continue;
    if (typeof item === "string") {
      found.push(item);
    } else if (Array.isArray(item)) {
      found.push(...item.filter((entry): entry is string => typeof entry === "string"));
    }
  }
  return unique(found);
}

function preparationRequirements(preparation: ApplicationPreparation | null) {
  if (!preparation) return { matched: [], uncovered: [], responsibilities: [] };
  const requirements = preparation.requirements as Record<string, unknown>;
  return {
    matched: stringArray(requirements.matched ?? requirements.matchedRequirements),
    uncovered: stringArray(requirements.uncovered ?? requirements.uncoveredRequirements),
    responsibilities: unique([
      ...stringArray(requirements.responsibilities),
      ...stringsFromKeys(preparation.analysis, [
        "responsibilities",
        "extractedresponsibilities",
        "jobresponsibilities",
      ]),
      ...stringsFromKeys(requirements, ["responsibilities"]),
    ]),
  };
}

export function roleCriteria(
  opportunity: Opportunity,
  preparation: ApplicationPreparation | null,
): RoleCriteria {
  const prepared = preparationRequirements(preparation);
  const fromPosting = {
    responsibilities: sectionFromDescription(opportunity.description, "responsibilities"),
    requirements: sectionFromDescription(opportunity.description, "requirements"),
  };

  const responsibilities = fromPosting.responsibilities.length
    ? fromPosting.responsibilities
    : prepared.responsibilities;

  // The skills array is attached to the posting by the source, so it is
  // posting evidence even when no explicit requirements heading exists.
  const requirements = fromPosting.requirements.length
    ? fromPosting.requirements
    : unique([
        ...(opportunity.skills ?? []),
        ...prepared.matched,
        ...prepared.uncovered,
      ]);

  return {
    responsibilities: responsibilities.slice(0, 12),
    requirements: requirements.slice(0, 12),
    prepared: {
      responsibilities:
        fromPosting.responsibilities.length === 0 && prepared.responsibilities.length > 0,
      requirements:
        fromPosting.requirements.length === 0 &&
        (opportunity.skills ?? []).length === 0 &&
        [...prepared.matched, ...prepared.uncovered].length > 0,
    },
  };
}

export interface FitSummary {
  strengths: string[];
  weaknesses: string[];
  resume: JobDocument | null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function mentioned(value: string, text: string): boolean {
  const needle = normalize(value);
  return needle.length > 1 && normalize(text).includes(needle);
}

export function findDefaultResume(documents: JobDocument[]): JobDocument | null {
  const resumes = documents.filter(
    (document) =>
      (document.type === "cv" || normalize(document.type).includes("resume")) &&
      !document.opportunityId &&
      !document.parentDocumentId,
  );
  // The explicit base flag wins: a person can mark the resume they actually
  // want used, and that choice must survive having other CVs in the library.
  return (
    resumes.find((document) => document.isBase) ??
    resumes[0] ??
    documents.find((document) => document.type === "cv" && document.isBase) ??
    documents.find((document) => document.type === "cv") ??
    null
  );
}

function profileEvidence(profile: Profile | null): string {
  if (!profile) return "";
  return [
    profile.headline,
    profile.summary,
    profile.location,
    profile.country,
    String(profile.yearsExperience ?? ""),
    profile.seniority,
    ...(profile.skills ?? []),
    ...(profile.desiredRoles ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Strengths and weaknesses are read from evidence only. A missing skill is
 * reported as "not yet evidenced", never as a fact about the person.
 */
export function fitSummary({
  profile,
  resume,
  opportunity,
  preparation,
}: {
  profile: Profile | null;
  resume: JobDocument | null;
  opportunity: Opportunity;
  preparation: ApplicationPreparation | null;
}): FitSummary {
  const prepared = preparationRequirements(preparation);
  const evidence = [resume?.content ?? "", profileEvidence(profile)].filter(Boolean).join(" ");
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const match of prepared.matched.slice(0, 4)) {
    strengths.push(`Supported: ${match}`);
  }

  const sharedSkills = (opportunity.skills ?? []).filter(
    (skill) => mentioned(skill, evidence),
  );
  if (sharedSkills.length && strengths.length < 5) {
    strengths.push(`Your evidence mentions ${sharedSkills.slice(0, 4).join(", ")}.`);
  }

  if (
    profile?.seniority &&
    opportunity.seniority &&
    normalize(profile.seniority) === normalize(opportunity.seniority)
  ) {
    strengths.push(`Your level matches the posting's ${opportunity.seniority}.`);
  }
  if (profile?.remotePreferred && opportunity.workMode === "remote") {
    strengths.push("You prefer remote; this role is remote.");
  }
  if (profile?.country && opportunity.country && mentioned(profile.country, opportunity.country)) {
    strengths.push(`Based in ${profile.country}, the posting's country.`);
  }

  for (const gap of prepared.uncovered.slice(0, 4)) {
    weaknesses.push(`Not yet evidenced: ${gap}`);
  }

  const unmatched = (opportunity.skills ?? []).filter(
    (skill) => !mentioned(skill, evidence),
  );
  if (unmatched.length && weaknesses.length < 5) {
    weaknesses.push(
      `No evidence yet for ${unmatched.slice(0, 4).join(", ")}.`,
    );
  }

  if (preparation?.missingInputs?.length) {
    weaknesses.push(
      `Missing: ${preparation.missingInputs.slice(0, 4).map((input) => input.label).join(", ")}.`,
    );
  }
  if (!resume) {
    weaknesses.push("No default resume yet.");
  }

  return {
    strengths: unique(strengths).slice(0, 5),
    weaknesses: unique(weaknesses).slice(0, 5),
    resume,
  };
}

export interface ResumeSuggestion {
  title: string;
  detail: string;
  href: string;
}

export function resumeSuggestions({
  profile,
  resume,
  opportunity,
  preparation,
}: {
  profile: Profile | null;
  resume: JobDocument | null;
  opportunity: Opportunity;
  preparation: ApplicationPreparation | null;
}): ResumeSuggestion[] {
  const prepared = preparationRequirements(preparation);
  const suggestions: ResumeSuggestion[] = [];

  if (!resume) {
    suggestions.push({
      title: "Add a default resume",
      detail: "Upload or generate a resume so requirements can be checked against real experience.",
      href: "/documents",
    });
  } else {
    for (const criterion of prepared.uncovered.slice(0, 4)) {
      suggestions.push({
        title: `Evidence ${criterion}`,
        detail: `Add a truthful bullet in “${resume.title}” only if you have used this.`,
        href: `/documents/${resume.id}`,
      });
    }

    const titleMissing = !profile?.headline || !mentioned(profile.headline, resume.content);
    if (titleMissing && suggestions.length < 4) {
      suggestions.push({
        title: "Align the resume headline with the role",
        detail: `Use the closest true title to “${opportunity.title}” in your headline. Only if you have held it.`,
        href: `/documents/${resume.id}`,
      });
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: "Review the resume against the posting",
      detail: "Check that each listed skill has an accurate line in your resume.",
      href: resume ? `/documents/${resume.id}` : "/documents",
    });
  }

  return suggestions.slice(0, 5);
}
