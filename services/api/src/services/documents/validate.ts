import { z } from "zod";
import { query } from "../../db/pool.js";

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

const REQUIRED_SECTIONS = [
  { key: "contact", patterns: [/contact/i, /personal\s*details?/i, /personal\s*information/i] },
  { key: "experience", patterns: [/work\s*experience/i, /professional\s*experience/i, /employment/i, /experience/i] },
  { key: "education", patterns: [/education/i, /academic/i, /qualifications?/i] },
  { key: "skills", patterns: [/skills/i, /competenc/i, /technical\s*skills/i, /capabilities/i] },
];

const SENSITIVE_PATTERNS: Array<{ code: string; pattern: RegExp; message: string }> = [
  { code: "DATE_OF_BIRTH", pattern: /\b(date of birth|dob|birth ?date)\b/i, message: "Date of birth is present" },
  { code: "NATIONAL_ID", pattern: /\b(national id|nid|ssn|social security)\b/i, message: "National identifier is present" },
  { code: "MARITAL_STATUS", pattern: /\b(marital status|married|single|divorced)\b/i, message: "Marital status is present" },
  { code: "NATIONALITY", pattern: /\b(nationality|citizenship)\b/i, message: "Nationality is present" },
  { code: "RELIGION", pattern: /\b(religion|religious affiliation)\b/i, message: "Religion is present" },
  { code: "FULL_HOME_ADDRESS", pattern: /\b(residential address|home address|street address)\b/i, message: "Full home address is present" },
  { code: "CREDIT_SCORE", pattern: /\b(credit score|credit report)\b/i, message: "Credit score reference is present" },
];

const TABLE_MARKERS = [/<table/i, /<td/i, /<tr/i, /\bcolumn\s+\d+\s+of\s+\d+\b/i];

const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "that", "this", "will", "have", "your", "you",
  "our", "are", "using", "use", "used", "into", "role", "work", "team", "job", "jobs",
  "including", "such", "other", "years", "year", "new", "all", "must", "able", "etc",
]);

function extractKeywords(text: string, limit = 30): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && token.length <= 28 && !STOP_WORDS.has(token));

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([token]) => token);
}

export async function validateDocumentForAts(
  userId: string,
  content: string,
  targetKeywords: string[],
): Promise<AtsReport> {
  const issues: AtsIssue[] = [];
  const text = content.trim();

  const words = text ? text.split(/\s+/) : [];
  const wordCount = words.length;
  const characterCount = text.length;
  const bullets = text.split(/\n\s*(?:[-*•·]|\d+[.)])\s+/).filter((line) => line.trim().length > 0);
  const bulletLengths = bullets.map((bullet) => bullet.split(/\s+/).length);
  const averageBulletLength = bulletLengths.length
    ? Math.round((bulletLengths.reduce((sum, value) => sum + value, 0) / bulletLengths.length) * 10) / 10
    : 0;

  const headingMatches = REQUIRED_SECTIONS.map((section) => ({
    key: section.key,
    found: section.patterns.some((pattern) => pattern.test(text)),
  }));
  const foundSections = headingMatches.filter((match) => match.found).map((match) => match.key);

  const hasContact = foundSections.includes("contact");
  const hasExperience = foundSections.includes("experience");
  const hasEducation = foundSections.includes("education");
  const hasSkills = foundSections.includes("skills");

  if (!hasContact) {
    issues.push({
      code: "MISSING_CONTACT_SECTION",
      severity: "error",
      message: "No contact section found.",
      hint: "Add a header with your name, email, phone and location.",
    });
  }
  if (!hasExperience) {
    issues.push({
      code: "MISSING_EXPERIENCE_SECTION",
      severity: "error",
      message: "No work experience section found.",
      hint: "Most ATS parsers look for 'Work Experience' or 'Professional Experience'.",
    });
  }
  if (!hasEducation) {
    issues.push({
      code: "MISSING_EDUCATION_SECTION",
      severity: "warning",
      message: "No education section found.",
      hint: "Include education even for candidates who are self-taught.",
    });
  }
  if (!hasSkills) {
    issues.push({
      code: "MISSING_SKILLS_SECTION",
      severity: "warning",
      message: "No skills section found.",
      hint: "ATS keyword matching reads skills as a flat list.",
    });
  }

  for (const marker of TABLE_MARKERS) {
    if (marker.test(text)) {
      issues.push({
        code: "TABLE_STRUCTURE",
        severity: "error",
        message: "Table-like structure detected.",
        hint: "Most ATS parsers flatten tables badly. Use plain lines instead.",
      });
      break;
    }
  }

  for (const sensitive of SENSITIVE_PATTERNS) {
    if (sensitive.pattern.test(text)) {
      issues.push({
        code: sensitive.code,
        severity: "warning",
        message: sensitive.message,
        hint: "Remove details that employers do not need and that can trigger bias filters.",
      });
    }
  }

  if (wordCount > 0 && wordCount < 120) {
    issues.push({
      code: "TOO_SHORT",
      severity: "warning",
      message: `Document has only ${wordCount} words.`,
      hint: "Thin resumes score poorly with both ATS and recruiters.",
    });
  }
  if (wordCount > 1200) {
    issues.push({
      code: "TOO_LONG",
      severity: "warning",
      message: `Document has ${wordCount} words.`,
      hint: "Keep a resume under two pages. Move detail into a cover letter.",
    });
  }
  if (bullets.length === 0) {
    issues.push({
      code: "NO_BULLETS",
      severity: "warning",
      message: "No bullet points detected.",
      hint: "Achievements are parsed far better as bullets with action verbs and measurable results.",
    });
  }
  if (averageBulletLength > 40) {
    issues.push({
      code: "LONG_BULLETS",
      severity: "info",
      message: `Average bullet is ${averageBulletLength} words.`,
      hint: "Aim for 15-30 words per bullet.",
    });
  }

  const email = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/.exec(text);
  const phone = /(\+?\d[\d\s().-]{7,}\d)/.exec(text);
  if (!email) {
    issues.push({
      code: "MISSING_EMAIL",
      severity: "error",
      message: "No email address found.",
      hint: "Without an email the recruiter cannot reply.",
    });
  }
  if (!phone) {
    issues.push({
      code: "MISSING_PHONE",
      severity: "warning",
      message: "No phone number found.",
    });
  }

  const documentKeywords = new Set(extractKeywords(text, 80));
  const wanted = targetKeywords
    .map((keyword) => keyword.toLowerCase().trim())
    .filter(Boolean);
  const matchedKeywords = wanted.filter((keyword) => documentKeywords.has(keyword));
  const missingKeywords = wanted.filter((keyword) => !documentKeywords.has(keyword));
  const keywordCoverage = wanted.length === 0 ? 1 : matchedKeywords.length / wanted.length;

  if (keywordCoverage < 0.4 && wanted.length > 0) {
    issues.push({
      code: "LOW_KEYWORD_COVERAGE",
      severity: "warning",
      message: `Only ${Math.round(keywordCoverage * 100)}% of target role keywords appear in the document.`,
      hint: `Consider naturally including: ${missingKeywords.slice(0, 6).join(", ")}.`,
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(
    0,
    Math.min(100, 100 - errors * 18 - warnings * 7 - issues.filter((i) => i.severity === "info").length * 2),
  );
  const grade = score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "poor";

  await query(
    `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
     VALUES ('document.validated', 'user', $1, $2)`,
    [userId, JSON.stringify({ score, grade, errors, warnings })],
  );

  return {
    score,
    grade,
    passed: errors === 0,
    issues,
    sections: foundSections,
    metrics: {
      wordCount,
      characterCount,
      bulletCount: bullets.length,
      averageBulletLength,
      keywordCoverage: Math.round(keywordCoverage * 100) / 100,
      matchedKeywords,
      missingKeywords,
      hasContactSection: hasContact,
      hasExperienceSection: hasExperience,
      hasEducationSection: hasEducation,
      hasSkillsSection: hasSkills,
    },
  };
}

export const validateRequestSchema = z.object({
  documentId: z.string().uuid().optional(),
  content: z.string().max(200_000).optional(),
  opportunityId: z.string().uuid().optional(),
  keywords: z.array(z.string().max(80)).max(60).optional(),
});
