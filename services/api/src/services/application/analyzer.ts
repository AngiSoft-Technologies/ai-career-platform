import { safeFetch } from "../sources/http.js";
import { stripHtml } from "../sources/connectors/html.js";
import type { CandidateProfile } from "@angisoft/job-radar-contracts";

export type ApplicationPlatform =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "smartrecruiters"
  | "workday"
  | "oracle"
  | "google_forms"
  | "microsoft_forms"
  | "email"
  | "custom";

export interface DetectedField {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "select" | "radio" | "checkbox" | "textarea" | "file";
  required: boolean;
  options?: string[];
  mapped: boolean;
  suggestedValue?: string;
  reason?: string;
}

export interface ApplicationAnalysis {
  platform: ApplicationPlatform;
  method: "website" | "email" | "ats" | "form";
  analysisUrl: string;
  fields: DetectedField[];
  questions: Array<{ question: string; answer: string; confidence: number }>;
  emailRecipient?: string;
  emailSubject?: string;
  requiredDocuments: string[];
  instructions: string[];
  requiresUserInput: string[];
  deadline?: string;
  rawTitle?: string;
}

const PLATFORM_PATTERNS: Array<[RegExp, ApplicationPlatform]> = [
  [/greenhouse\.io/i, "greenhouse"],
  [/jobs\.lever\.co/i, "lever"],
  [/ashbyhq\.com/i, "ashby"],
  [/workable\.com/i, "workable"],
  [/smartrecruiters\.com/i, "smartrecruiters"],
  [/myworkdayjobs\.com|workday\.com/i, "workday"],
  [/oraclecloud\.com|taleo\.net/i, "oracle"],
  [/docs\.google\.com\/forms/i, "google_forms"],
  [/forms\.(office|microsoft)\.(com|net)/i, "microsoft_forms"],
];

const FILE_FIELD_KEYS = ["resume", "cv", "cover", "portfolio", "transcript"];

const FIELD_LABEL_MAP: Record<string, keyof CandidateProfile | "fullName"> = {
  first_name: "fullName",
  firstname: "fullName",
  last_name: "fullName",
  lastname: "fullName",
  full_name: "fullName",
  name: "fullName",
  email: "fullName",
  phone: "location",
  location: "location",
  city: "location",
  country: "country",
  linkedin: "headline",
  website: "headline",
  portfolio: "headline",
};

function extractFields(html: string): DetectedField[] {
  const fields: DetectedField[] = [];
  const seen = new Set<string>();

  const patterns: Array<{
    regex: RegExp;
    type: DetectedField["type"];
  }> = [
    { regex: /<input\b([^>]*)>/gi, type: "text" },
    { regex: /<textarea\b([^>]*)>/gi, type: "textarea" },
    { regex: /<select\b([^>]*)>/gi, type: "select" },
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    pattern.regex.lastIndex = 0;
    while ((match = pattern.regex.exec(html)) !== null) {
      const attrs = match[1] ?? "";

      const nameMatch = attrs.match(/\bname=["']([^"']+)["']/i);
      const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
      const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i);
      const required = /\brequired\b/i.test(attrs) || /\baria-required=["']true["']/i.test(attrs);
      const placeholderMatch = attrs.match(/\bplaceholder=["']([^"']+)["']/i);

      const key = (nameMatch?.[1] ?? idMatch?.[1] ?? "").trim();
      if (!key || key.toLowerCase() === "csrf" || key.toLowerCase().includes("token")) {
        continue;
      }
      if (seen.has(key)) continue;
      if (pattern.type === "text" && ["submit", "button", "hidden", "image", "reset"].includes((typeMatch?.[1] ?? "").toLowerCase())) {
        continue;
      }

      seen.add(key);

      let type: DetectedField["type"] = pattern.type;
      if (typeMatch?.[1]) {
        const raw = typeMatch[1].toLowerCase();
        if (raw === "email" || raw === "tel") type = raw;
        if (raw === "file") type = "file";
        if (raw === "checkbox") type = "checkbox";
        if (raw === "radio") type = "radio";
      }

      const labelFromId = idMatch?.[1]
        ? findLabel(html, idMatch[1])
        : undefined;

      const options: string[] = [];
      if (type === "select") {
        const selectBody = html.slice(
          match.index,
          html.indexOf("</select>", match.index) + 9,
        );
        const optionRegex = /<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]{0,120}?)<\/option>/gi;
        let optionMatch: RegExpExecArray | null;
        while ((optionMatch = optionRegex.exec(selectBody)) !== null) {
          const value = (optionMatch[2] ? stripHtml(optionMatch[2]) : optionMatch[1] ?? "").trim();
          if (value && value.length < 80) options.push(value);
        }
      }

      fields.push({
        key,
        label: labelFromId ?? placeholderMatch?.[1] ?? humaniseKey(key),
        type,
        required,
        options: options.length > 0 ? options.slice(0, 40) : undefined,
        mapped: false,
      });
    }
  }

  return fields;
}

function findLabel(html: string, id: string): string | undefined {
  const labelMatch = html.match(
    new RegExp(`<label[^>]*for=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]{0,200}?)</label>`, "i"),
  );
  if (labelMatch) return stripHtml(labelMatch[1] ?? "").trim() || undefined;
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function humaniseKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function extractQuestions(html: string): string[] {
  const questions: string[] = [];
  const labelRegex = /<label[^>]*>([\s\S]{0,400}?)<\/label>/gi;
  let match: RegExpExecArray | null;
  while ((match = labelRegex.exec(html)) !== null) {
    const text = stripHtml(match[1] ?? "").trim();
    if (text.length > 12 && text.length < 300 && /\?/.test(text)) {
      questions.push(text.replace(/\s+/g, " "));
    }
  }
  const headingRegex = /<h[2-4][^>]*>([\s\S]{0,200}?)<\/h[2-4]>/gi;
  while ((match = headingRegex.exec(html)) !== null) {
    const text = stripHtml(match[1] ?? "").trim();
    if (text.length > 12 && text.length < 200 && /\?/.test(text)) {
      questions.push(text.replace(/\s+/g, " "));
    }
  }
  return [...new Set(questions)].slice(0, 20);
}

function extractDeadline(html: string): string | undefined {
  const patterns = [
    /(?:deadline|closing date|apply by|applications close)[^<]{0,80}?(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function extractRecruiterEmail(text: string): string | undefined {
  const matches = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  const preferred = matches.find((email) =>
    /recruit|career|hiring|jobs|talent|hr/i.test(email),
  );
  return preferred ?? matches[0];
}

function suggestValue(
  field: DetectedField,
  profile: CandidateProfile | null,
): { value?: string; reason?: string } {
  if (!profile) return { reason: "PROFILE_NOT_FOUND" };

  const haystack = `${field.key} ${field.label}`.toLowerCase();

  if (/first.?name|given.?name/.test(haystack)) {
    const first = profile.fullName.split(/\s+/)[0];
    return first ? { value: first } : {};
  }
  if (/last.?name|surname|family.?name/.test(haystack)) {
    const parts = profile.fullName.split(/\s+/);
    const last = parts.slice(1).join(" ");
    return last ? { value: last } : {};
  }
  if (/full.?name|^name$|your.?name/.test(haystack)) {
    return { value: profile.fullName };
  }
  if (/e-?mail/.test(haystack)) {
    return { reason: "USER_INPUT_REQUIRED" };
  }
  if (/phone|mobile|telephone|whatsapp/.test(haystack)) {
    return { reason: "USER_INPUT_REQUIRED" };
  }
  if (/country|nation/.test(haystack)) {
    return { value: profile.country };
  }
  if (/city|town|location|address/.test(haystack)) {
    return { value: profile.location };
  }
  if (/years?.experience|experience/.test(haystack)) {
    return { value: String(profile.yearsExperience) };
  }
  if (/seniority|level/.test(haystack)) {
    return { value: profile.seniority };
  }
  if (/linkedin/.test(haystack)) {
    return { reason: "USER_INPUT_REQUIRED" };
  }
  if (/portfolio|website|github/.test(haystack)) {
    return { reason: "USER_INPUT_REQUIRED" };
  }
  if (/salary|expected pay|compensation/.test(haystack)) {
    return { reason: "USER_INPUT_REQUIRED" };
  }
  if (/notice period|availability|start date/.test(haystack)) {
    return { reason: "USER_INPUT_REQUIRED" };
  }
  return { reason: "USER_INPUT_REQUIRED" };
}

export async function analyseApplicationPage(input: {
  applyUrl: string;
  profile: CandidateProfile | null;
}): Promise<ApplicationAnalysis> {
  const url = input.applyUrl;

  if (url.startsWith("mailto:")) {
    const recipient = url.replace(/^mailto:/, "").split("?")[0];
    return {
      platform: "email",
      method: "email",
      analysisUrl: url,
      fields: [],
      questions: [],
      emailRecipient: recipient,
      emailSubject: (new URL(`mailto:${recipient}${url.includes("?") ? url.slice(url.indexOf("?")) : ""}`))
        .searchParams.get("subject") ?? undefined,
      requiredDocuments: ["cv", "cover_letter"],
      instructions: [
        "Attach your CV and a tailored cover letter.",
        "Send from an email address you check daily.",
        "Log the application in Job Radar so follow-ups are tracked.",
      ],
      requiresUserInput: [],
      rawTitle: recipient,
    };
  }

  const platformMatch = PLATFORM_PATTERNS.find(([pattern]) => pattern.test(url));
  const platform: ApplicationPlatform = platformMatch?.[1] ?? "custom";

  let html = "";
  let title: string | undefined;
  let fetchError: string | undefined;

  try {
    const response = await safeFetch(url, {
      timeoutMs: 20_000,
      maxBytes: 1_500_000,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (response.status >= 200 && response.status < 300) {
      html = response.body;
      const titleMatch = html.match(/<title[^>]*>([\s\S]{0,250}?)<\/title>/i);
      title = titleMatch ? stripHtml(titleMatch[1] ?? "").trim() : undefined;
    } else {
      fetchError = `HTTP_${response.status}`;
    }
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "FETCH_FAILED";
  }

  const fields = extractFields(html);
  const text = stripHtml(html);

  const mapped = fields.map((field) => {
    const suggestion = suggestValue(field, input.profile);
    const mappedField: DetectedField = {
      ...field,
      mapped: Boolean(suggestion.value),
      suggestedValue: suggestion.value,
      reason: suggestion.reason,
    };
    return mappedField;
  });

  const requiredDocuments: string[] = [];
  if (mapped.some((f) => f.type === "file" && /resume|cv|curriculum/i.test(`${f.key} ${f.label}`))) {
    requiredDocuments.push("cv");
  }
  if (mapped.some((f) => f.type === "file" && /cover/i.test(`${f.key} ${f.label}`))) {
    requiredDocuments.push("cover_letter");
  }
  if (mapped.some((f) => f.type === "file" && /transcript|certificate/i.test(`${f.key} ${f.label}`))) {
    requiredDocuments.push("transcript");
  }
  if (requiredDocuments.length === 0) {
    requiredDocuments.push("cv");
    if (/cover/i.test(text)) requiredDocuments.push("cover_letter");
  }

  const questions = extractQuestions(html).map((question) => ({
    question,
    answer: "",
    confidence: input.profile ? 0.3 : 0,
  }));

  const requiresUserInput = mapped
    .filter((field) => field.required && !field.suggestedValue)
    .map((field) => field.label || field.key);

  const method: ApplicationAnalysis["method"] =
    platform === "email"
      ? "email"
      : ["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "workday", "oracle"].includes(platform)
        ? "ats"
        : fields.some((field) => field.type !== "file") || /<form\b/i.test(html)
          ? "form"
          : "website";

  const instructions = buildInstructions(platform, method, fetchError);

  return {
    platform,
    method,
    analysisUrl: url,
    fields: mapped,
    questions,
    emailRecipient: extractRecruiterEmail(text),
    requiredDocuments: [...new Set(requiredDocuments)],
    instructions,
    requiresUserInput: [...new Set(requiresUserInput)],
    deadline: extractDeadline(html),
    rawTitle: title,
  };
}

function buildInstructions(
  platform: ApplicationPlatform,
  method: ApplicationAnalysis["method"],
  fetchError?: string,
): string[] {
  const instructions: string[] = [];

  if (fetchError) {
    instructions.push(
      "The application page could not be read directly. Open the link, complete the form manually, then record the outcome here.",
    );
  }

  if (method === "email") {
    instructions.push(
      "Write a short subject line naming the role.",
      "Attach your CV as a PDF named Firstname-Lastname-CV.pdf.",
      "Paste the generated cover letter into the email body or attach it.",
    );
  } else if (method === "ats") {
    instructions.push(
      `${humanisePlatform(platform)} detected, so fields map cleanly from your profile.`,
      "Review every auto-filled value before submitting.",
      "Upload the generated CV as a PDF.",
    );
  } else if (method === "form") {
    instructions.push(
      "Review the detected fields, confirm the mapped values, and fill anything marked as user input.",
      "Save any long answers, you can reuse them across applications.",
    );
  } else {
    instructions.push(
      "This employer uses its own application page. Open it, then track your submission here.",
    );
  }

  instructions.push(
    "Job Radar prepares and assists. You review, approve and submit - nothing is sent without your action.",
  );

  return instructions;
}

function humanisePlatform(platform: ApplicationPlatform): string {
  switch (platform) {
    case "google_forms":
      return "Google Forms";
    case "microsoft_forms":
      return "Microsoft Forms";
    case "smartrecruiters":
      return "SmartRecruiters";
    default:
      return platform.charAt(0).toUpperCase() + platform.slice(1);
  }
}
