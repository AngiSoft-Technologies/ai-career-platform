import { config } from "../../config.js";

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_API_URL = "https://api.linkedin.com/v2";

interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

function getLinkedInConfig(): LinkedInConfig {
  return {
    clientId: config.LINKEDIN_CLIENT_ID || "",
    clientSecret: config.LINKEDIN_CLIENT_SECRET || "",
    redirectUri:
      config.LINKEDIN_REDIRECT_URI || `${config.API_URL}/auth/linkedin/callback`,
    scopes: ["openid", "profile", "email"],
  };
}

/** True when the operator has supplied LinkedIn OAuth credentials. */
export function isLinkedInConfigured(): boolean {
  const cfg = getLinkedInConfig();
  return cfg.clientId.length > 0 && cfg.clientSecret.length > 0;
}

export function getLinkedInAuthUrl(state: string): string {
  const cfg = getLinkedInConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes.join(" "),
    state,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
): Promise<{ access_token: string; expires_in: number }> {
  const cfg = getLinkedInConfig();
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINKEDIN_TOKEN_EXCHANGE_FAILED: ${error.slice(0, 200)}`);
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
}

function localized(
  value: { localized?: Record<string, string> } | undefined,
): string {
  if (!value?.localized) return "";
  return value.localized.en_US ?? Object.values(value.localized)[0] ?? "";
}

export interface LinkedInProfile {
  id: string;
  firstName: string;
  lastName: string;
  headline: string;
  email: string;
  pictureUrl: string;
  positions: Array<Record<string, unknown>>;
  educations: Array<Record<string, unknown>>;
  skills: string[];
}

interface LinkedInDate {
  year?: number;
  month?: number;
}

function formatLinkedInDate(date: LinkedInDate | undefined): string {
  if (!date?.year) return "";
  const month = date.month ? String(date.month).padStart(2, "0") : "01";
  return `${date.year}-${month}`;
}

export async function fetchLinkedInProfile(
  accessToken: string,
): Promise<LinkedInProfile> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const profileResponse = await fetch(
    `${LINKEDIN_API_URL}/me?projection=(id,firstName,lastName,headline,profilePicture(displayImage~:playableStreams))`,
    { headers },
  );

  if (!profileResponse.ok) {
    throw new Error("LINKEDIN_PROFILE_FETCH_FAILED");
  }

  const profile = (await profileResponse.json()) as {
    id?: string;
    firstName?: { localized?: Record<string, string> };
    lastName?: { localized?: Record<string, string> };
    headline?: { localized?: Record<string, string> };
    profilePicture?: {
      "displayImage~"?: {
        elements?: Array<{ identifiers?: Array<{ identifier?: string }> }>;
      };
    };
  };

  let email = "";
  try {
    const emailResponse = await fetch(
      `${LINKEDIN_API_URL}/emailAddress?q=members&projection=(elements*(handle~))`,
      { headers },
    );
    if (emailResponse.ok) {
      const emailData = (await emailResponse.json()) as {
        elements?: Array<{ "handle~"?: { emailAddress?: string } }>;
      };
      email = emailData.elements?.[0]?.["handle~"]?.emailAddress ?? "";
    }
  } catch {
    // Email is optional.
  }

  let positions: Array<Record<string, unknown>> = [];
  try {
    const response = await fetch(
      `${LINKEDIN_API_URL}/me/positions?projection=(elements*(title,companyName,location,startDate,endDate,description,current))`,
      { headers },
    );
    if (response.ok) {
      const data = (await response.json()) as {
        elements?: Array<Record<string, unknown>>;
      };
      positions = data.elements ?? [];
    }
  } catch {
    // Positions are optional.
  }

  let educations: Array<Record<string, unknown>> = [];
  try {
    const response = await fetch(
      `${LINKEDIN_API_URL}/me/educations?projection=(elements*(degreeName,fieldOfStudy,schoolName,startDate,endDate,grade))`,
      { headers },
    );
    if (response.ok) {
      const data = (await response.json()) as {
        elements?: Array<Record<string, unknown>>;
      };
      educations = data.elements ?? [];
    }
  } catch {
    // Education is optional.
  }

  let skills: string[] = [];
  try {
    const response = await fetch(
      `${LINKEDIN_API_URL}/me/skills?projection=(elements*(name))`,
      { headers },
    );
    if (response.ok) {
      const data = (await response.json()) as {
        elements?: Array<{ name?: string }>;
      };
      skills = (data.elements ?? [])
        .map((skill) => skill.name ?? "")
        .filter(Boolean);
    }
  } catch {
    // Skills are optional.
  }

  const picture =
    profile.profilePicture?.["displayImage~"]?.elements?.[0]?.identifiers?.[0]
      ?.identifier ?? "";

  return {
    id: profile.id ?? "",
    firstName: localized(profile.firstName),
    lastName: localized(profile.lastName),
    headline: localized(profile.headline),
    email,
    pictureUrl: picture,
    positions,
    educations,
    skills,
  };
}

export interface LinkedInResumeData {
  fullName: string;
  headline: string;
  email: string;
  linkedin: string;
  pictureUrl: string;
  skills: string[];
  experiences: Array<{
    title: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    location: string;
    graduationDate: string;
    gpa: string;
  }>;
  yearsExperience: number;
}

export function mapLinkedInToResume(
  profile: LinkedInProfile,
): LinkedInResumeData {
  const experiences = profile.positions.map((position) => {
    const startDate = position.startDate as LinkedInDate | undefined;
    const endDate = position.endDate as LinkedInDate | undefined;
    return {
      title: String(position.title ?? ""),
      company: String(position.companyName ?? ""),
      location: String(position.location ?? ""),
      startDate: formatLinkedInDate(startDate),
      endDate: formatLinkedInDate(endDate),
      current: Boolean(position.current),
      description: String(position.description ?? ""),
    };
  });

  const education = profile.educations.map((entry) => {
    const degreeName = String(entry.degreeName ?? "");
    const field = String(entry.fieldOfStudy ?? "");
    return {
      degree: field ? `${degreeName} in ${field}`.trim() : degreeName,
      institution: String(entry.schoolName ?? ""),
      location: "",
      graduationDate: formatLinkedInDate(
        entry.endDate as LinkedInDate | undefined,
      ),
      gpa: String(entry.grade ?? ""),
    };
  });

  const yearsExperience = experiences.reduce((total, entry) => {
    if (!entry.startDate) return total;
    const start = new Date(`${entry.startDate}-01`).getTime();
    const end = entry.current
      ? Date.now()
      : entry.endDate
        ? new Date(`${entry.endDate}-01`).getTime()
        : Date.now();
    return total + Math.max(0, (end - start) / (1000 * 60 * 60 * 24 * 365));
  }, 0);

  return {
    fullName: `${profile.firstName} ${profile.lastName}`.trim(),
    headline: profile.headline,
    email: profile.email,
    linkedin: profile.id ? `https://linkedin.com/in/${profile.id}` : "",
    pictureUrl: profile.pictureUrl,
    skills: profile.skills,
    experiences,
    education,
    yearsExperience,
  };
}
