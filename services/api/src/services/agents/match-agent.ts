import { query } from "../../db/pool.js";
import { haversineKm } from "../../services/geo.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";

/**
 * User Matching Agent
 *
 * Matches live catalogue entries to users based on:
 *   - User's location (latitude/longitude from user_location_prefs)
 *   - User's preferred countries/locations
 *   - Max distance radius
 *   - Remote work preference
 *
 * Creates match records in the `matches` table so users see relevant jobs
 * when they log in — like LinkedIn's "jobs near you" or "recommended for you".
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
 */
export class UserMatchingAgent extends BaseDiscoveryAgent {
  readonly key = "user_matching_agent";
  readonly name = "User Job Matching Agent";
  readonly kind = "user_matching";
  readonly scheduleIntervalMinutes = 15;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const radiusKm = Number(ctx.config.match_radius_km ?? 50);
    const includeRemote = ctx.config.include_remote ?? true;
    const maxUsers = Number(ctx.config.max_users_per_run ?? 200);
    const maxOpportunities = Number(ctx.config.max_opportunities_per_run ?? 300);
    const budgetMs = Number(ctx.config.budget_ms ?? 120_000);
    const deadline = Date.now() + budgetMs;

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
        WHERE u.id IS NOT NULL
        LIMIT $1`,
      [maxUsers],
    );

    // The catalogue, not the candidate queue: a match points at an
    // opportunity, so this is what the row has to reference.
    const opportunities = await query<{
      opportunity_id: string;
      country: string | null;
      city: string | null;
      work_mode: string | null;
    }>(
      `SELECT id AS opportunity_id, country, city, work_mode
         FROM opportunities
        WHERE status = 'active'
          AND created_at > now() - interval '30 days'
        ORDER BY created_at DESC
        LIMIT $1`,
      [maxOpportunities],
    );

    if (users.rows.length === 0 || opportunities.rows.length === 0) {
      return {
        status: "success",
        jobsFound: opportunities.rows.length,
        jobsNew: 0,
        jobsDuplicate: 0,
        payload: {
          usersProcessed: users.rows.length,
          opportunitiesConsidered: opportunities.rows.length,
          totalMatches: 0,
        },
      };
    }

    // The city table is read once. It is a handful of rows, and resolving
    // a city per user per opportunity is what made this agent unusable.
    const cities = await this.loadCityCoordinates();

    const userIds: string[] = [];
    const opportunityIds: string[] = [];
    const scores: number[] = [];
    const factors: string[] = [];
    const explanations: string[] = [];

    for (const opportunity of opportunities.rows) {
      if (Date.now() > deadline) break;

      const opportunityLocation = opportunity.city
        ? (cities.get(opportunity.city.trim().toLowerCase()) ?? null)
        : null;

      for (const user of users.rows) {
        let score = 0;
        const reasons: string[] = [];

        const userRadius = user.max_distance_km ?? radiusKm;
        const userLocation =
          user.latitude != null && user.longitude != null
            ? { latitude: user.latitude, longitude: user.longitude }
            : null;

        // Location matching.
        if (opportunityLocation && userLocation) {
          const distance = haversineKm(userLocation, opportunityLocation);
          if (distance <= userRadius) {
            score += 40;
            reasons.push(`~${Math.round(distance)} km from you`);
          } else if (user.willing_to_relocate) {
            score += 10;
            reasons.push("relocation possible");
          }
        } else if (
          opportunity.country &&
          user.country &&
          opportunity.country === user.country
        ) {
          score += 20;
          reasons.push("same country");
        }

        // Remote matching
        if (
          includeRemote &&
          opportunity.work_mode === "remote" &&
          user.remote_ok
        ) {
          score += 30;
          reasons.push("remote work");
        }

        // Preferred locations
        if (
          opportunity.city &&
          user.preferred_locations?.includes(opportunity.city)
        ) {
          score += 15;
          reasons.push("your preferred location");
        }
        if (
          opportunity.country &&
          user.preferred_countries?.includes(opportunity.country)
        ) {
          score += 15;
          reasons.push("your preferred country");
        }

        if (score <= 0) continue;

        userIds.push(user.user_id);
        opportunityIds.push(opportunity.opportunity_id);
        scores.push(Math.min(100, score));
        factors.push(
          JSON.stringify({
            location: score > 30 ? score : 0,
            remote: opportunity.work_mode === "remote" ? 30 : 0,
          }),
        );
        explanations.push(reasons.join(", "));
      }
    }

    let totalMatches = 0;
    const errors: string[] = [];

    if (userIds.length > 0) {
      // One statement for every match, in chunks that stay well inside
      // the parameter limit.
      const CHUNK = 500;
      for (let start = 0; start < userIds.length; start += CHUNK) {
        const end = Math.min(start + CHUNK, userIds.length);
        try {
          const result = await query(
            `INSERT INTO matches (user_id, opportunity_id, score, factors, explanation, gaps, created_at, updated_at)
             SELECT t.u, t.o, t.s, t.f::jsonb, t.e, '{}'::text[], now(), now()
               FROM unnest($1::uuid[], $2::uuid[], $3::numeric[], $4::text[], $5::text[])
                 AS t(u, o, s, f, e)
             ON CONFLICT (user_id, opportunity_id) DO UPDATE SET
               score = EXCLUDED.score,
               factors = EXCLUDED.factors,
               explanation = EXCLUDED.explanation,
               updated_at = now()`,
            [
              userIds.slice(start, end),
              opportunityIds.slice(start, end),
              scores.slice(start, end),
              factors.slice(start, end),
              explanations.slice(start, end),
            ],
          );
          totalMatches += result.rowCount ?? 0;
        } catch (error) {
          errors.push(
            `Match write failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return {
      status: errors.length > 0 && totalMatches === 0 ? "failed" : "success",
      jobsFound: opportunities.rows.length,
      jobsNew: totalMatches,
      jobsDuplicate: 0,
      error: errors.length > 0 ? errors.slice(0, 5).join("; ") : undefined,
      payload: {
        usersProcessed: users.rows.length,
        opportunitiesConsidered: opportunities.rows.length,
        totalMatches,
      },
    };
  }

  /**
   * Reads the city table into memory.
   *
   * The table is small (a few dozen seeded cities) and every lookup used
   * to be a round trip, so it is read once and matched here.
   */
  private async loadCityCoordinates(): Promise<
    Map<string, { latitude: number; longitude: number }>
  > {
    const result = await query<{
      city_name: string;
      latitude: number;
      longitude: number;
    }>(
      `SELECT city_name, latitude, longitude FROM city_coordinates`,
    ).catch(() => ({
      rows: [] as Array<{
        city_name: string;
        latitude: number;
        longitude: number;
      }>,
    }));

    const map = new Map<string, { latitude: number; longitude: number }>();
    for (const row of result.rows) {
      const key = row.city_name.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        });
      }
    }
    return map;
  }
}
