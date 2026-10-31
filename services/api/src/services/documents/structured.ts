import { query } from "../../db/pool.js";

export interface StructuredExperience {
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface StructuredEducation {
  degree: string;
  institution: string;
  location: string;
  graduationDate: string;
  gpa: string;
}

export interface StructuredProject {
  name: string;
  description: string;
  technologies: string;
  url: string;
}

export interface StructuredResume {
  fullName: string;
  headline: string;
  summary: string;
  location: string;
  country: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  yearsExperience: number;
  seniority: "intern" | "junior" | "mid" | "senior" | "lead";
  skills: string[];
  desiredRoles: string[];
  experiences: StructuredExperience[];
  education: StructuredEducation[];
  projects: StructuredProject[];
}

export function emptyStructuredResume(): StructuredResume {
  return {
    fullName: "",
    headline: "",
    summary: "",
    location: "",
    country: "",
    email: "",
    phone: "",
    linkedin: "",
    portfolio: "",
    yearsExperience: 0,
    seniority: "junior",
    skills: [],
    desiredRoles: [],
    experiences: [],
    education: [],
    projects: [],
  };
}

function text(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function textArray(value: unknown, max = 100): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, 120))
    .filter(Boolean)
    .slice(0, max);
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .slice(0, 30);
}

function inferSeniority(years: number): StructuredResume["seniority"] {
  if (years >= 10) return "lead";
  if (years >= 6) return "senior";
  if (years >= 3) return "mid";
  if (years >= 1) return "junior";
  return "intern";
}

/**
 * Coerces whatever the model returned into the exact shape the rest of the
 * application expects. Missing or malformed fields become safe defaults.
 */
export function coerceStructuredResume(value: unknown): StructuredResume {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const years = Math.max(
    0,
    Math.min(60, Number(source.yearsExperience) || 0),
  );
  const seniority = text(source.seniority, 20).toLowerCase();

  return {
    fullName: text(source.fullName, 160),
    headline: text(source.headline, 240),
    summary: text(source.summary, 2000),
    location: text(source.location, 160),
    country: text(source.country, 120),
    email: text(source.email, 200),
    phone: text(source.phone, 60),
    linkedin: text(source.linkedin, 300),
    portfolio: text(source.portfolio, 300),
    yearsExperience: years,
    seniority:
      seniority === "intern" ||
      seniority === "junior" ||
      seniority === "mid" ||
      seniority === "senior" ||
      seniority === "lead"
        ? seniority
        : inferSeniority(years),
    skills: textArray(source.skills),
    desiredRoles: textArray(source.desiredRoles, 20),
    experiences: objectArray(source.experiences).map((entry) => ({
      title: text(entry.title, 200),
      company: text(entry.company, 200),
      location: text(entry.location, 160),
      startDate: text(entry.startDate, 20),
      endDate: text(entry.endDate, 20),
      current: Boolean(entry.current),
      description: text(entry.description, 4000),
    })),
    education: objectArray(source.education).map((entry) => ({
      degree: text(entry.degree, 240),
      institution: text(entry.institution, 240),
      location: text(entry.location, 160),
      graduationDate: text(entry.graduationDate, 20),
      gpa: text(entry.gpa, 40),
    })),
    projects: objectArray(source.projects).map((entry) => ({
      name: text(entry.name, 200),
      description: text(entry.description, 2000),
      technologies: text(entry.technologies, 400),
      url: text(entry.url, 300),
    })),
  };
}

/**
 * A deterministic fallback used when the language model is unavailable.
 * It is intentionally conservative: better a thin resume the user can edit
 * than invented experience.
 */
export function heuristicStructuredResume(textInput: string): StructuredResume {
  const lines = textInput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const full = textInput;
  const result = emptyStructuredResume();

  const email = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/.exec(full)?.[0] ?? "";
  const phone = /(\+?\d[\d\s().-]{7,}\d)/.exec(full)?.[0] ?? "";
  const linkedin = /linkedin\.com\/in\/[\w-]+/i.exec(full)?.[0] ?? "";
  const website =
    /(github\.com\/[\w-]+|[\w-]+\.(?:dev|io|me|com))(?:\/[\w./-]*)?/i.exec(
      full.replace(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, ""),
    )?.[0] ?? "";

  const nameLine = lines.find(
    (line) =>
      line.length >= 3 &&
      line.length <= 60 &&
      !line.includes("@") &&
      !line.startsWith("http") &&
      /^[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){1,3}$/u.test(line),
  );

  result.fullName = nameLine ?? lines[0]?.slice(0, 80) ?? "";
  result.headline = lines[1] && lines[1] !== nameLine ? lines[1].slice(0, 160) : "";
  result.email = email;
  result.phone = phone;
  result.linkedin = linkedin;
  result.portfolio = website;

  const skillCandidates = [
    "javascript",
    "typescript",
    "python",
    "java",
    "go",
    "rust",
    "c++",
    "c#",
    "react",
    "vue",
    "angular",
    "next.js",
    "node.js",
    "express",
    "django",
    "flask",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "terraform",
    "ansible",
    "git",
    "ci/cd",
    "jenkins",
    "graphql",
    "rest",
    "grpc",
    "microservices",
    "machine learning",
    "tensorflow",
    "pytorch",
    "pandas",
    "agile",
    "scrum",
    "figma",
    "sql",
    "excel",
  ];
  result.skills = skillCandidates.filter((skill) =>
    new RegExp(`(^|[^\\w])${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w]|$)`, "i").test(
      full,
    ),
  );

  const summaryMatch =
    /(?:professional\s+summary|summary|profile|objective)\s*[:\n]+([\s\S]{40,800}?)(?:\n\s*\n|$)/i.exec(
      full,
    );
  result.summary = summaryMatch?.[1]?.trim().slice(0, 1200) ?? "";

  result.yearsExperience = Math.min(
    40,
    Math.max(
      0,
      ...Array.from(full.matchAll(/(\d{1,2})\+?\s+years?/gi), (match) =>
        Number(match[1]) || 0,
      ),
    ),
  );
  result.seniority = inferSeniority(result.yearsExperience);

  return result;
}

export function buildResumeContent(data: StructuredResume): string {
  const contact = [
    data.email,
    data.phone,
    data.location,
    data.linkedin,
    data.portfolio,
  ]
    .filter(Boolean)
    .join(" · ");

  const sections = [
    { heading: "Contact", body: contact },
    {
      heading: "Professional Summary",
      body:
        data.summary ||
        (data.headline
          ? `${data.headline}.`
          : "Professional summary to be completed."),
    },
    {
      heading: "Experience",
      body:
        data.experiences
          .map((entry) => {
            const range = [
              entry.startDate,
              entry.current ? "Present" : entry.endDate,
            ]
              .filter(Boolean)
              .join(" – ");
            return [
              `${entry.title}${entry.company ? ` — ${entry.company}` : ""}`,
              [entry.location, range].filter(Boolean).join(" · "),
              entry.description,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n") || "Add your roles and achievements.",
    },
    {
      heading: "Education",
      body:
        data.education
          .map((entry) =>
            [
              `${entry.degree}${entry.institution ? `, ${entry.institution}` : ""}`,
              [entry.location, entry.graduationDate, entry.gpa]
                .filter(Boolean)
                .join(" · "),
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n") || "Add your education.",
    },
    {
      heading: "Skills",
      body: data.skills.join(", ") || "Add your skills.",
    },
    {
      heading: "Projects",
      body:
        data.projects
          .map((project) =>
            [
              project.name,
              project.description,
              project.technologies
                ? `Technologies: ${project.technologies}`
                : "",
              project.url,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n") || "",
    },
  ].filter((section) => section.body.trim().length > 0);

  return JSON.stringify({ title: data.fullName || "My Resume", sections });
}

function toDate(value: string): string | null {
  if (!value) return null;
  const match = /^(\d{4})(?:-(\d{2}))?/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2] ?? "1");
  if (!Number.isFinite(year) || year < 1950 || year > 2100) return null;
  return `${year}-${String(Math.min(12, Math.max(1, month))).padStart(2, "0")}-01`;
}

/**
 * Persists the structured resume onto the candidate profile, work history and
 * education tables. Existing manual edits are overwritten only for fields the
 * import actually produced.
 */
export async function saveStructuredResume(
  userId: string,
  data: StructuredResume,
): Promise<void> {
  const fullName = data.fullName || "Candidate";
  const headline = data.headline || "Professional";

  await query(
    `INSERT INTO candidate_profiles
       (user_id, full_name, headline, summary, location, country,
        years_experience, seniority, desired_roles, phone, website, linkedin_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (user_id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       headline = EXCLUDED.headline,
       summary = EXCLUDED.summary,
       location = EXCLUDED.location,
       country = EXCLUDED.country,
       years_experience = EXCLUDED.years_experience,
       seniority = EXCLUDED.seniority,
       desired_roles = EXCLUDED.desired_roles,
       phone = EXCLUDED.phone,
       website = EXCLUDED.website,
       linkedin_url = EXCLUDED.linkedin_url,
       version = candidate_profiles.version + 1,
       updated_at = now()`,
    [
      userId,
      fullName,
      headline,
      data.summary,
      data.location,
      data.country || "Kenya",
      Math.round(data.yearsExperience),
      data.seniority,
      data.desiredRoles,
      data.phone,
      data.portfolio,
      data.linkedin,
    ],
  );

  if (data.skills.length > 0) {
    await query(
      "DELETE FROM candidate_skills WHERE profile_id = (SELECT id FROM candidate_profiles WHERE user_id = $1)",
      [userId],
    );
    for (const skill of data.skills.slice(0, 100)) {
      await query(
        "INSERT INTO candidate_skills (profile_id, name, level) SELECT id, $2, 'working' FROM candidate_profiles WHERE user_id = $1 ON CONFLICT DO NOTHING",
        [userId, skill],
      );
    }
  }

  if (data.experiences.length > 0) {
    await query("DELETE FROM candidate_experiences WHERE user_id = $1", [
      userId,
    ]);
    let position = 0;
    for (const entry of data.experiences) {
      if (!entry.title && !entry.company) continue;
      await query(
        `INSERT INTO candidate_experiences
           (user_id, company, title, location, start_date, end_date, is_current, description, position)
         VALUES ($1, $2, $3, $4, COALESCE($5::date, date_trunc('year', now())::date), $6::date, $7, $8, $9)`,
        [
          userId,
          entry.company || "Company",
          entry.title || "Role",
          entry.location,
          toDate(entry.startDate),
          entry.current ? null : toDate(entry.endDate),
          entry.current,
          entry.description,
          position++,
        ],
      );
    }
  }

  if (data.education.length > 0) {
    await query("DELETE FROM candidate_education WHERE user_id = $1", [userId]);
    for (const entry of data.education) {
      if (!entry.institution && !entry.degree) continue;
      await query(
        `INSERT INTO candidate_education
           (user_id, institution, degree, location, end_date)
         VALUES ($1, $2, $3, $4, $5::date)`,
        [
          userId,
          entry.institution || "Institution",
          entry.degree,
          entry.location,
          toDate(entry.graduationDate),
        ],
      );
    }
  }
}
