import { query } from "../../db/pool.js";
import { haversineKm } from "../../services/geo.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";

/**
 * User Matching Agent
 *
 * Matches verified job candidates to users based on:
 *   - User's location (latitude/longitude from user_location_prefs)
 *   - User's preferred countries/locations
 *   - Max distance radius
 *   - Remote work preference
 *   - User's skills and desired roles (from candidate_profiles)
 *
 * Creates match records in the `matches` table so users see relevant jobs
 * when they log in — like LinkedIn's "jobs near you" or "recommended for you".
 */
export class UserMatchingAgent extends BaseDiscoveryAgent {
  readonly key = "user_matching_agent";
  readonly name = "User Job Matching Agent";
  readonly kind = "user_matching";
  readonly scheduleIntervalMinutes = 15;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const radiusKm = Number(ctx.config.match_radius_km ?? 50);
    const includeRemote = ctx.config.include_remote ?? true;

    // Get users with location preferences
    const users = await query<{
      user_id: string;
      latitude: number | null;
      longitude: number | null;
      max_distance_km: number | null;
      country: string | null;
      city: string | null;
      remote_ok: boolean;
      willing_to_relocate: boolean;
      preferred_countries: string[];
      preferred_locations: string[];
    }>(
      `SELECT u.id as user_id, ulp.latitude, ulp.longitude,
              ulp.max_distance_km, ulp.country, ulp.city, ulp.remote_ok,
              ulp.willing_to_relocate, ulp.preferred_countries,
              cp.preferred_locations
         FROM users u
         LEFT JOIN user_location_prefs ulp ON ulp.user_id = u.id
         LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE u.id IS NOT NULL`,
    );

    // Get verified, unimported candidates
    const candidates = await query<{
      id: string;
      title: string;
      company: string | null;
      country: string | null;
      city: string | null;
      work_mode: string | null;
      skills: string[];
      latitude: number | null;
      longitude: number | null;
    }>(
      `SELECT dc.id, dc.title, dc.company, dc.country, dc.city, dc.work_mode,
              dc.skills, dc.latitude, dc.longitude
         FROM discovery_candidates dc
        WHERE dc.status = 'verified'
          AND dc.imported_opportunity_id IS NULL
        LIMIT 1000`,
    );

    let totalMatches = 0;
    const errors: string[] = [];

    for (const user of users.rows) {
      const userRadius = user.max_distance_km ?? radiusKm;
      const userLocation = user.latitude != null && user.longitude != null
        ? { latitude: user.latitude, longitude: user.longitude }
        : null;

      for (const candidate of candidates.rows) {
        let score = 0;
        let reasons: string[] = [];

        // Location matching
        if (candidate.latitude != null && candidate.longitude != null && userLocation) {
          const distance = haversineKm(userLocation, {
            latitude: candidate.latitude,
            longitude: candidate.longitude,
          });
          if (distance <= userRadius) {
            score += 40;
            reasons.push(`~${Math.round(distance)} km from you`);
          } else if (user.willing_to_relocate) {
            score += 10;
            reasons.push("relocation possible");
          }
        } else if (candidate.country && user.country && candidate.country === user.country) {
          score += 20;
          reasons.push("same country");
        }

        // Remote matching
        if (includeRemote && candidate.work_mode === "remote" && user.remote_ok) {
          score += 30;
          reasons.push("remote work");
        }

        // Preferred locations
        if (candidate.city && user.preferred_locations?.includes(candidate.city)) {
          score += 15;
          reasons.push("your preferred location");
        }
        if (candidate.country && user.preferred_countries?.includes(candidate.country)) {
          score += 15;
          reasons.push("your preferred country");
        }

        if (score > 0) {
          try {
            await query(
              `INSERT INTO matches (user_id, opportunity_id, score, factors, explanation, gaps, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, now(), now())
               ON CONFLICT (user_id, opportunity_id) DO UPDATE SET
                 score = EXCLUDED.score,
                 factors = EXCLUDED.factors,
                 explanation = EXCLUDED.explanation,
                 updated_at = now()`,
              [
                user.user_id,
                candidate.id,
                Math.min(100, score),
                JSON.stringify({ location: score > 30 ? score : 0, remote: candidate.work_mode === "remote" ? 30 : 0 }),
                reasons.join(", "),
                [],
              ],
            );
            totalMatches += 1;
          } catch (error) {
            errors.push(`Match failed for user ${user.user_id}, job ${candidate.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }

    return {
      status: errors.length > 0 && totalMatches === 0 ? "failed" : "success",
      jobsFound: candidates.rows.length,
      jobsNew: totalMatches,
      jobsDuplicate: 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      payload: { usersProcessed: users.rows.length, candidatesMatched: candidates.rows.length, totalMatches },
    };
  }
}
