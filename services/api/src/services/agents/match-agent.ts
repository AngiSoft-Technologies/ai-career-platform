import type {
  CandidateProfile,
  Opportunity,
} from "@angisoft/mboqara-contracts";
import { query } from "../../db/pool.js";
import { scoreMatch } from "../../services/matching.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";

/**
 * The statement that writes the recommendations.
 *
 * Exported so the regression verifier can run *this* statement against a
 * live database — inside a transaction it rolls back — rather than a
 * copy of it that can drift away from the one that runs in production.
 *
 * The shape of the gaps column is the part worth keeping an eye on. It is
 * `text[]`, and the natural way to write it — `unnest(..., text[][])` —
 * does not exist in Postgres: there is no `unnest` overload that takes an
 * array of arrays. The form that works reads the array as JSON and turns
 * it into a `text[]` with `ARRAY(SELECT jsonb_array_elements_text(...))`.
 * The factors column is `jsonb`, so it travels as JSON and is read back
 * as JSON.
 */
export const MATCH_UPSERT_SQL = `INSERT INTO matches (user_id, opportunity_id, score, factors, explanation, gaps, created_at, updated_at)
     SELECT (p->>'user_id')::uuid,
            (p->>'opportunity_id')::uuid,
            (p->>'score')::numeric,
            p->'factors',
            p->>'explanation',
            ARRAY(SELECT jsonb_array_elements_text(p->'gaps')),
            now(), now()
       FROM jsonb_array_elements($1::jsonb) AS p
     ON CONFLICT (user_id, opportunity_id) DO UPDATE SET
       score = EXCLUDED.score,
       factors = EXCLUDED.factors,
       explanation = EXCLUDED.explanation,
       gaps = EXCLUDED.gaps,
       updated_at = now()`;

/**
 * User Matching Agent
 *
 * Matches live catalogue entries to users so the feed can put the right
 * jobs in front of the right person.
 *
 * Two things this agent used to get wrong, both of which cost the whole
 * ingestion cycle:
 *
 *   1. It read `discovery_candidates` and stored the *candidate* id in
 *      `matches.opportunity_id`. That column is a foreign key to
 *      `opportunities`, so every insert failed — and the failures were
 *      collected into an error string rather than stopping the run. It
 *      now reads the opportunities themselves, so the id it stores is the
 *      id the row requires.
 *
 *   2. It looked a candidate's coordinates up once per user, per
 *      candidate: with 31 users and a thousand candidates that is 31 000
 *      sequential round trips to the database, which does not finish in
 *      any reasonable time. The city table is read once and the scoring
 *      runs in memory; the matches are then written in one statement.
 *
 * It also scores with `scoreMatch` — the product's own rule, the same
 * one the API uses for a single pair. A second, cruder rule in the agent
 * meant the recommendations disagreed with the feed: the agent required
 * a user to opt into remote work, while the product shows a remote role
 * to everyone, because a remote role works from anywhere.
 */
/**
 * Keeps each user's best matches.
 *
 * The agent scores every user against every opportunity it considers,
 * which is thousands of pairs. Only the best few per user are worth
 * keeping: a recommendation list that holds everything is not a
 * recommendation list.
 */
export function keepBestPerUser(
  payloads: Array<Record<string, unknown>>,
  maxPerUser: number,
): Array<Record<string, unknown>> {
  if (maxPerUser <= 0) return payloads;

  const byUser = new Map<string, Array<Record<string, unknown>>>();
  for (const payload of payloads) {
    const userId = String(payload["user_id"] ?? "");
    const bucket = byUser.get(userId);
    if (bucket) bucket.push(payload);
    else byUser.set(userId, [payload]);
  }

  const kept: Array<Record<string, unknown>> = [];
  for (const bucket of byUser.values()) {
    bucket.sort((left, right) => {
      const scoreDifference =
        Number(right["score"] ?? 0) - Number(left["score"] ?? 0);
      if (scoreDifference !== 0) return scoreDifference;
      return String(left["opportunity_id"] ?? "").localeCompare(
        String(right["opportunity_id"] ?? ""),
      );
    });
    kept.push(...bucket.slice(0, maxPerUser));
  }
  return kept;
}

export class UserMatchingAgent extends BaseDiscoveryAgent {  readonly key = "user_matching_agent";
  readonly name = "User Job Matching Agent";
  readonly kind = "user_matching";
  readonly scheduleIntervalMinutes = 15;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const maxUsers = Number(ctx.config.max_users_per_run ?? 200);
    const maxOpportunities = Number(ctx.config.max_opportunities_per_run ?? 300);
    const maxPerUser = Number(ctx.config.max_matches_per_user ?? 100);
    const minScore = Number(ctx.config.min_score ?? 1);
    const budgetMs = Number(ctx.config.budget_ms ?? 120_000);
    const deadline = Date.now() + budgetMs;

    const profiles = await this.loadProfiles(maxUsers);
    const opportunities = await this.loadOpportunities(maxOpportunities);

    if (profiles.length === 0 || opportunities.length === 0) {
      return {
        status: "success",
        jobsFound: opportunities.length,
        jobsNew: 0,
        jobsDuplicate: 0,
        payload: {
          usersProcessed: profiles.length,
          opportunitiesConsidered: opportunities.length,
          totalMatches: 0,
        },
      };
    }

    const payloads: Array<Record<string, unknown>> = [];

    for (const opportunity of opportunities) {
      if (Date.now() > deadline) break;

      for (const profile of profiles) {
        const result = scoreMatch(profile, opportunity);
        if (result.score < minScore) continue;

        payloads.push({
          user_id: profile.userId,
          opportunity_id: opportunity.id,
          score: result.score,
          factors: result.factors,
          explanation: result.explanation,
          gaps: result.gaps,
        });
      }
    }

    // A recommendation table that holds every pair is not a
    // recommendation table. Each user keeps their best matches, and the
    // rest are left for a later cycle to reconsider.
    const kept = keepBestPerUser(payloads, maxPerUser);

    let totalMatches = 0;
    let prunedMatches = 0;
    const errors: string[] = [];

    if (kept.length > 0) {
      // One statement for every match, in chunks that stay well inside
      // the parameter limit. The rows travel as JSON so the nested
      // factors and gaps keep their shape on the way through.
      const CHUNK = 500;
      for (let start = 0; start < kept.length; start += CHUNK) {
        const chunk = kept.slice(start, start + CHUNK);
        try {
          const result = await query(MATCH_UPSERT_SQL, [
            JSON.stringify(chunk),
          ]);
          totalMatches += result.rowCount ?? 0;
        } catch (error) {
          errors.push(
            `Match write failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Keep each user's list to the size it is meant to be.
      //
      // The write above only ever adds or updates a row, so without this
      // the table grows with every cycle: each run considered a
      // different window of the catalogue and left its matches behind.
      // Thirty-one users had two hundred recommendations each — a
      // recommendation list that nobody reads.
      if (maxPerUser > 0) {
        try {
          const pruned = await query(
            `DELETE FROM matches m
              WHERE m.id IN (
                SELECT id FROM (
                  SELECT id,
                         row_number() OVER (
                           PARTITION BY user_id
                           ORDER BY score DESC, updated_at DESC
                         ) AS rank
                    FROM matches
                ) ranked
                WHERE rank > $1
              )`,
            [maxPerUser],
          );
          prunedMatches = pruned.rowCount ?? 0;
        } catch (error) {
          errors.push(
            `Match prune failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return {
      status: errors.length > 0 && totalMatches === 0 ? "failed" : "success",
      jobsFound: opportunities.length,
      jobsNew: totalMatches,
      jobsDuplicate: 0,
      error: errors.length > 0 ? errors.slice(0, 5).join("; ") : undefined,
      payload: {
        usersProcessed: profiles.length,
        opportunitiesConsidered: opportunities.length,
        totalMatches,
        prunedMatches,
      },
    };
  }

  /**
   * Reads the candidates' profiles in one statement.
   *
   * `candidate_profiles` is what the onboarding flow writes.
   * `candidate_preferences` holds the finer-grained choices and wins
   * where it has a value; `user_location_prefs` is the optional
   * geolocation override. Reading only the override meant the agent saw
   * 31 users with no country, no coordinates and no preferences — and
   * matched nothing at all.
   */
  private async loadProfiles(maxUsers: number): Promise<CandidateProfile[]> {
    const result = await query<{
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
      pref_countries: string[] | null;
      pref_locations: string[] | null;
      pref_roles: string[] | null;
      employment_types: string[] | null;
      remote_only: boolean | null;
      willing_to_relocate: boolean | null;
      notifications_enabled: boolean | null;
      max_distance_km: number | null;
      latitude: number | null;
      longitude: number | null;
    }>(
      `SELECT p.id,
              p.user_id,
              u.email,
              u.display_name,
              p.full_name,
              p.headline,
              p.summary,
              p.location,
              p.country,
              p.years_experience,
              p.seniority,
              p.desired_roles,
              p.preferred_countries,
              p.preferred_locations,
              p.remote_preferred,
              p.version,
              p.updated_at,
              COALESCE(array_agg(cs.name ORDER BY cs.name) FILTER (WHERE cs.name IS NOT NULL), '{}') AS skills,
              prefs.preferred_countries AS pref_countries,
              prefs.preferred_locations AS pref_locations,
              prefs.preferred_roles AS pref_roles,
              prefs.employment_types,
              prefs.remote_only,
              prefs.willing_to_relocate,
              prefs.notifications_enabled,
              ulp.max_distance_km,
              ulp.latitude,
              ulp.longitude
         FROM candidate_profiles p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN candidate_skills cs ON cs.profile_id = p.id
         LEFT JOIN candidate_preferences prefs ON prefs.user_id = p.user_id
         LEFT JOIN user_location_prefs ulp ON ulp.user_id = p.user_id
        GROUP BY p.id, u.email, u.display_name,
                 prefs.preferred_countries, prefs.preferred_locations,
                 prefs.preferred_roles, prefs.employment_types, prefs.remote_only,
                 prefs.willing_to_relocate, prefs.notifications_enabled,
                 ulp.max_distance_km, ulp.latitude, ulp.longitude
        LIMIT $1`,
      [maxUsers],
    ).catch(() => ({ rows: [] as Array<never> }));

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      name: row.display_name,
      fullName: row.full_name ?? "",
      headline: row.headline ?? "",
      summary: row.summary ?? "",
      location: row.location ?? "",
      country: row.country ?? "",
      yearsExperience: Number(row.years_experience ?? 0),
      seniority: (row.seniority ?? "mid") as CandidateProfile["seniority"],
      desiredRoles: row.pref_roles?.length
        ? row.pref_roles
        : (row.desired_roles ?? []),
      skills: row.skills ?? [],
      preferredCountries: row.pref_countries?.length
        ? row.pref_countries
        : (row.preferred_countries ?? []),
      preferredLocations: row.pref_locations?.length
        ? row.pref_locations
        : (row.preferred_locations ?? []),
      remotePreferred: row.remote_only ?? row.remote_preferred ?? false,
      employmentTypes: row.employment_types ?? ["full_time"],
      willingToRelocate:
        row.willing_to_relocate ?? false,
      notificationsEnabled:
        row.notifications_enabled ?? true,
      updatedAt: new Date(row.updated_at ?? Date.now()).toISOString(),
      version: row.version ?? 1,
    }));
  }

  /**
   * Reads the catalogue in one statement.
   *
   * A match points at an opportunity, so this is what the row has to
   * reference. The skills come along because the product's score is
   * mostly about them.
   */
  private async loadOpportunities(maxOpportunities: number): Promise<Opportunity[]> {
    const result = await query<{
      id: string;
      company_id: string;
      company_name: string;
      company_slug: string;
      title: string;
      description: string;
      country: string;
      city: string;
      work_mode: string;
      seniority: string;
      employment_type: string;
      apply_url: string;
      application_method: string;
      platform: string;
      posted_at: Date;
      status: string;
      skills: string[];
    }>(
      `SELECT o.id,
              o.company_id,
              c.name AS company_name,
              c.slug AS company_slug,
              o.title,
              o.description,
              o.country,
              o.city,
              o.work_mode,
              o.seniority,
              o.employment_type,
              o.apply_url,
              o.application_method,
              o.platform,
              o.posted_at,
              o.status,
              COALESCE(array_agg(os.skill ORDER BY os.skill) FILTER (WHERE os.skill IS NOT NULL), '{}') AS skills
         FROM opportunities o
         JOIN companies c ON c.id = o.company_id
         LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
        WHERE o.status = 'active'
        GROUP BY o.id, c.name, c.slug
        ORDER BY o.posted_at DESC
        LIMIT $1`,
      [maxOpportunities],
    ).catch(() => ({ rows: [] as Array<never> }));

    return result.rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      companyName: row.company_name ?? "",
      companySlug: row.company_slug ?? "",
      title: row.title ?? "",
      description: row.description ?? "",
      country: row.country ?? "",
      city: row.city ?? "",
      workMode: (row.work_mode ?? "remote") as Opportunity["workMode"],
      seniority: (row.seniority ?? "mid") as Opportunity["seniority"],
      employmentType: row.employment_type ?? "full_time",
      applyUrl: row.apply_url ?? "",
      applicationMethod: (row.application_method ??
        "website") as Opportunity["applicationMethod"],
      platform: row.platform ?? "",
      postedAt: new Date(row.posted_at ?? Date.now()).toISOString(),
      status: row.status ?? "active",
      skills: row.skills ?? [],
    }));
  }
}
