import type { CandidateProfile } from "@angisoft/job-radar-contracts";
import { query } from "../db/pool.js";

interface ProfileRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  full_name: string;
  headline: string;
  summary: string;
  location: string;
  country: string;
  years_experience: number;
  seniority: string;
  desired_roles: string[];
  preferred_countries: string[];
  preferred_locations: string[];
  remote_preferred: boolean;
  version: number;
  updated_at: Date;
  skills: string[];
}

export async function getProfile(
  userId: string,
): Promise<CandidateProfile | null> {
  const result = await query<ProfileRow>(
    `SELECT p.*,
            u.email,
            u.display_name,
            COALESCE(array_agg(cs.name ORDER BY cs.name) FILTER (WHERE cs.name IS NOT NULL), '{}') AS skills
       FROM candidate_profiles p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN candidate_skills cs ON cs.profile_id = p.id
      WHERE p.user_id = $1
      GROUP BY p.id, u.email, u.display_name`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    name: row.display_name,
    fullName: row.full_name,
    headline: row.headline,
    summary: row.summary,
    location: row.location,
    country: row.country,
    yearsExperience: row.years_experience,
    seniority: row.seniority as CandidateProfile["seniority"],
    desiredRoles: row.desired_roles,
    skills: row.skills,
    preferredCountries: row.preferred_countries,
    preferredLocations: row.preferred_locations,
    remotePreferred: row.remote_preferred,
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

export interface ProfileUpdate {
  fullName?: string;
  headline?: string;
  summary?: string;
  location?: string;
  country?: string;
  yearsExperience?: number;
  seniority?: CandidateProfile["seniority"];
  desiredRoles?: string[];
  skills?: string[];
  preferredCountries?: string[];
  preferredLocations?: string[];
  remotePreferred?: boolean;
}

export async function updateProfile(
  userId: string,
  update: ProfileUpdate,
): Promise<CandidateProfile | null> {
  await query(
    `UPDATE candidate_profiles SET
       full_name = COALESCE($2, full_name),
       headline = COALESCE($3, headline),
       summary = COALESCE($4, summary),
       location = COALESCE($5, location),
       country = COALESCE($6, country),
       years_experience = COALESCE($7, years_experience),
       seniority = COALESCE($8, seniority),
       desired_roles = COALESCE($9, desired_roles),
       preferred_countries = COALESCE($10, preferred_countries),
       preferred_locations = COALESCE($11, preferred_locations),
       remote_preferred = COALESCE($12, remote_preferred),
       version = version + 1
     WHERE user_id = $1`,
    [
      userId,
      update.fullName ?? null,
      update.headline ?? null,
      update.summary ?? null,
      update.location ?? null,
      update.country ?? null,
      update.yearsExperience ?? null,
      update.seniority ?? null,
      update.desiredRoles ?? null,
      update.preferredCountries ?? null,
      update.preferredLocations ?? null,
      update.remotePreferred ?? null,
    ],
  );

  if (update.skills) {
    await query(
      "DELETE FROM candidate_skills WHERE profile_id = (SELECT id FROM candidate_profiles WHERE user_id = $1)",
      [userId],
    );
    for (const skill of update.skills) {
      await query(
        "INSERT INTO candidate_skills (profile_id, name, level) SELECT id, $2, 'working' FROM candidate_profiles WHERE user_id = $1",
        [userId, skill],
      );
    }
  }

  return getProfile(userId);
}
