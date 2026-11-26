import type {
  CandidateProfile,
  MatchFactors,
  MatchResult,
  Opportunity,
} from "@angisoft/mboqara-contracts";
import { query } from "../db/pool.js";
import { embedQuery } from "./ai/semantic-search.js";
import {
  canonicalEmploymentType,
  canonicalEmploymentTypeSql,
} from "./employment.js";
import { countryAliases, placeKey, sameCountry, samePlace } from "./geo.js";
import {
  mapOpportunity,
  opportunityFeedClauses,
  type OpportunityFilters,
  type OpportunityRow,
} from "./opportunities.js";
import { getOpportunity } from "./opportunities.js";
import { getProfile } from "./profile.js";

const seniorityRank: Record<string, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (value) seen.add(value);
  }
  return [...seen];
}

function uniqueAliases(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    for (const alias of countryAliases(value)) seen.add(alias);
  }
  return [...seen];
}

function placeKeys(values: Array<string | null | undefined>): string[] {
  return unique(values.map((value) => placeKey(value)));
}

/**
 * The SQL form of `placeKey` in geo.ts.
 *
 * The place comparison is done in the database now — a candidate cannot
 * page through a ranking that is only computed over the first rows — so
 * both sides have to reduce "Nairobi, Kenya" and "Nairobi (Hybrid)" to
 * the same token.
 */
function placeKeySql(column: string): string {
  return `trim(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(lower(split_part(${column}, ',', 1)), '\\([^)]*\\)', '', 'g'),
                 '\\y(remote|hybrid|onsite|on-site)\\y', '', 'g'
               ),
               '^[a-z]{2,3}[[:space:]]*[-–][[:space:]]*', ''
             ),
             '[[:space:]]+', ' ', 'g'
           )
         )`;
}

/**
 * Location-based filtering and scoring.
 * Location is the PRIMARY factor (50 points out of 100).
 *
 * Rules:
 * 1. Remote jobs are ALWAYS shown (they work from anywhere), unless the
 *    candidate has said remote work only
 * 2. Onsite/hybrid jobs are ONLY shown if they match the user's country,
 *    one of their preferred countries, their current city, or one of
 *    their preferred locations
 * 3. Location is weighted at 50 points (50% of total score)
 * 4. Distance decay: closer jobs score higher
 */
function calculateLocationScore(
  profile: CandidateProfile,
  opportunity: Opportunity,
): { score: number; shown: boolean; reason: string } {
  const isRemote = opportunity.workMode === "remote";
  const isHybrid = opportunity.workMode === "hybrid";

  // A candidate who asked for remote work is not shown a job that says
  // otherwise, however well it matches otherwise.
  if (profile.remotePreferred && !isRemote) {
    return { score: 0, shown: false, reason: "remote work only" };
  }

  // Remote jobs are always shown - they work from anywhere
  if (isRemote) {
    return { score: 50, shown: true, reason: "remote work" };
  }

  // Check if the job is in the user's country.
  //
  // The two sides spell a country differently: a profile says "Kenya" and
  // a listing says "KE". Compared literally they are different countries,
  // so a Kenyan user was shown nothing.
  const countryMatch =
    !!profile.country &&
    !!opportunity.country &&
    sameCountry(profile.country, opportunity.country);

  // A preferred country is an answer to "where do you want to work", and
  // it is a relevance question, not a nicety: the SQL feed has to honour
  // it or the page cannot be ordered and counted consistently.
  const preferredCountryMatch = (profile.preferredCountries ?? []).some(
    (country) => sameCountry(country, opportunity.country),
  );

  const preferredLocationMatch = (profile.preferredLocations ?? []).some((loc) =>
    opportunity.city ? samePlace(loc, opportunity.city) : false,
  );

  const cityMatch =
    !!profile.location &&
    !!opportunity.city &&
    samePlace(profile.location, opportunity.city);

  if (
    !countryMatch &&
    !preferredCountryMatch &&
    !preferredLocationMatch &&
    !cityMatch
  ) {
    return { score: 0, shown: false, reason: "not in your location" };
  }

  // The closest place the job is to the candidate wins. A preferred city is
  // worth more than a preferred country; the candidate's own city is worth
  // most.
  let score = 0;
  if (cityMatch) score = 50;
  else if (preferredLocationMatch) score = 40;
  else if (preferredCountryMatch && !countryMatch) score = 35;
  else if (countryMatch) score = 30;

  // Hybrid jobs get a small bonus if in country/preferred location
  if (isHybrid && (countryMatch || preferredCountryMatch || preferredLocationMatch || cityMatch)) {
    score = Math.min(50, score + 5);
  }

  return { score, shown: true, reason: "location match" };
}

/**
 * A commitment the candidate did not ask for is not a match.
 *
 * `full_time` is treated as the default interest because the profile column
 * defaults to it, and a candidate who has not expressed a preference should
 * still see ordinary permanent roles.
 */
function employmentTypeMatches(
  profile: CandidateProfile,
  opportunity: Opportunity,
): boolean {
  const wanted = unique(
    (profile.employmentTypes ?? ["full_time"]).map(canonicalEmploymentType),
  );
  if (wanted.length === 0) return true;
  return wanted.includes(canonicalEmploymentType(opportunity.employmentType));
}

/**
 * Scores a profile against an opportunity.
 *
 * This is the product's matching rule, and it is a pure function so the
 * database-backed feed can rank large catalogues without shipping every
 * candidate/opportunity pair through the API. The SQL in
 * `rankedOpportunities` mirrors this function; when they diverge, the feed
 * starts lying about the score next to each role.
 */
export function scoreMatch(
  profile: CandidateProfile,
  opportunity: Opportunity,
): MatchResult {
  // Employment type is a hard gate: a candidate targeting internships only
  // should never see a permanent contract, and vice versa.
  if (!employmentTypeMatches(profile, opportunity)) {
    return {
      opportunityId: opportunity.id,
      score: 0,
      factors: {
        skills: 0,
        seniority: 0,
        location: 0,
        role: 0,
        freshness: 0,
      },
      explanation: "Not the kind of role you are looking for",
      gaps: opportunity.skills.map(normalize),
    };
  }

  const profileSkills = new Set(profile.skills.map(normalize));
  const required = opportunity.skills.map(normalize);
  const matched = required.filter((skill) => profileSkills.has(skill));
  const missing = required.filter((skill) => !profileSkills.has(skill));

  const skillScore =
    required.length === 0 ? 20 : (matched.length / required.length) * 45;

  const profileRank = seniorityRank[profile.seniority] ?? 2;
  const opportunityRank = seniorityRank[opportunity.seniority] ?? 2;
  const rankDiff = Math.abs(profileRank - opportunityRank);
  const seniorityScore = rankDiff === 0 ? 15 : rankDiff === 1 ? 11 : 4;

  const title = normalize(opportunity.title);
  const roleHits = profile.desiredRoles.filter((role) => {
    const tokens = normalize(role).split(/\s+/).filter((token) => token.length > 3);
    return tokens.some((token) => title.includes(token));
  }).length;
  const roleScore = Math.min(15, roleHits * 8 || 3);

  const ageDays = Math.max(
    0,
    (Date.now() - new Date(opportunity.postedAt).getTime()) / 86_400_000,
  );
  const freshnessScore =
    ageDays <= 7 ? 10 : ageDays <= 14 ? 8 : ageDays <= 30 ? 5 : 2;

  // Location is now the PRIMARY factor (50 points)
  const location = calculateLocationScore(profile, opportunity);

  // If the job shouldn't be shown (not remote, not in user's location),
  // return a score of 0 so it gets filtered out
  if (!location.shown) {
    return {
      opportunityId: opportunity.id,
      score: 0,
      factors: {
        skills: 0,
        seniority: 0,
        location: 0,
        role: 0,
        freshness: 0,
      },
      explanation: location.reason,
      gaps: required,
    };
  }

  const factors: MatchFactors = {
    skills: Math.round(skillScore * 10) / 10,
    seniority: seniorityScore,
    location: location.score,
    role: roleScore,
    freshness: freshnessScore,
  };

  // Total score: location (50) + skills (45) + seniority (15) + role (15) + freshness (10)
  // Max possible = 130, but we cap at 100
  const rawScore =
    factors.skills + factors.seniority + factors.location + factors.role + factors.freshness;
  const score = Math.min(100, Math.round(rawScore));

  const explanationParts = [
    `${score}% match`,
    required.length > 0
      ? `${matched.length}/${required.length} required skills`
      : "no hard skill requirements",
    `${opportunity.seniority}-level role`,
    `${opportunity.city} / ${opportunity.workMode}`,
    ageDays <= 7 ? "recently posted" : "older posting",
  ];

  return {
    opportunityId: opportunity.id,
    score,
    factors,
    explanation: explanationParts.join(" · "),
    gaps: missing.slice(0, 5),
  };
}

export async function calculateMatch(
  userId: string,
  opportunityId: string,
): Promise<MatchResult> {
  const [profile, opportunity] = await Promise.all([
    getProfile(userId),
    getOpportunity(opportunityId),
  ]);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");
  if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");

  const result = scoreMatch(profile, opportunity);

  await query(
    `INSERT INTO matches (user_id, opportunity_id, score, factors, explanation, gaps)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, opportunity_id) DO UPDATE SET
        score = excluded.score,
        factors = excluded.factors,
        explanation = excluded.explanation,
        gaps = excluded.gaps`,
    [
      userId,
      opportunityId,
      result.score,
      JSON.stringify(result.factors),
      result.explanation,
      result.gaps,
    ],
  );

  return result;
}

export interface RankedFilters extends OpportunityFilters {
  semantic?: boolean;
  /** The ranked feed is location-first; daily matches are score-first. */
  orderByScore?: boolean;
}

export interface RankedPage {
  items: Array<Opportunity & { match: MatchResult }>;
  /** How many roles are relevant for this candidate, exactly. */
  total: number;
}

/**
 * Prompts for a semantic ranking.
 *
 * The embedding call is made once, and its failure is not fatal: the feed
 * falls back to the profile score rather than showing nothing.
 */
async function semanticEmbedding(
  text: string,
): Promise<{ embedding: string; model: string } | null> {
  try {
    const { embedding, model } = await embedQuery(text);
    return { embedding: `[${embedding.join(",")}]`, model };
  } catch {
    return null;
  }
}

/**
 * The ranked feed, over the whole relevant catalogue.
 *
 * The ranking used to load a fixed window of the newest rows and sort that
 * in memory. With a catalogue of more than a thousand roles that made the
 * ranked feed a lie: the total changed by page, deep pages were empty, and
 * a candidate could not reach most of the roles the first page claimed to
 * have found.
 *
 * Here the database applies the candidate's relevance rules, scores and
 * orders the whole matching set, and returns one page plus an exact count.
 * Relevance is therefore identical to what the pager counts.
 */
export async function rankedOpportunities(
  userId: string,
  filters: RankedFilters,
): Promise<RankedPage> {
  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  const [profile, semantic] = await Promise.all([
    getProfile(userId),
    filters.semantic && filters.q
      ? semanticEmbedding(filters.q)
      : Promise.resolve(null),
  ]);

  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  // The feed's own filters and the relevance rules are one WHERE clause:
  // a country filter, a search box and a candidate's location all restrict
  // what is counted, so the count and the page can never disagree.
  const { clauses, values } = opportunityFeedClauses(filters);
  const addParam = (value: unknown): number => {
    values.push(value);
    return values.length;
  };

  const employmentTypesParam = addParam(
    unique(
      (profile.employmentTypes ?? ["full_time"]).map(canonicalEmploymentType),
    ),
  );
  clauses.push(
    `${canonicalEmploymentTypeSql("o.employment_type")} = ANY($${employmentTypesParam}::text[])`,
  );

  const remoteOnlyParam = addParam(profile.remotePreferred);
  clauses.push(`(NOT $${remoteOnlyParam}::boolean OR o.work_mode = 'remote')`);

  // The candidate's geography is passed as aliases and place keys, not as
  // prose, so the same spellings that score in `scoreMatch` filter here.
  const currentCountries = countryAliases(profile.country);
  const preferredCountries = uniqueAliases(profile.preferredCountries ?? []);
  const currentLocations = placeKeys([profile.location]);
  const preferredLocations = placeKeys(profile.preferredLocations ?? []);

  const currentCountryParam = addParam(currentCountries);
  const preferredCountryParam = addParam(preferredCountries);
  const currentLocationParam = addParam(currentLocations);
  const preferredLocationParam = addParam(preferredLocations);

  // The same relevance rule reads the candidate's geography in two
  // places: the feed's WHERE clause, where the row is named `o`, and the
  // location score, where the row is the `feed` CTE. A fragment that
  // hard-codes one alias is a syntax error in the other, so each match is
  // built for the alias that reads it.
  const countryMatch = (alias: string, param: number): string =>
    `lower(${alias}.country) = ANY($${param}::text[])`;
  const cityMatch = (alias: string, param: number): string =>
    `${placeKeySql(`${alias}.city`)} = ANY($${param}::text[])`;

  clauses.push(
    `(
      o.work_mode = 'remote'
      OR ${countryMatch("o", currentCountryParam)}
      OR ${countryMatch("o", preferredCountryParam)}
      OR ${cityMatch("o", currentLocationParam)}
      OR ${cityMatch("o", preferredLocationParam)}
    )`,
  );

  // The count runs against the same feed clauses, but not the page's later
  // scoring/threshold parameters, so it gets its own argument list. A caller
  // using `minScore` must treat `total` as the pre-threshold relevance count;
  // the daily feed reports the size of its own five-item selection.
  const countValues = [...values];

  // Ranking parameters. A semantic query contributes a vector; without one
  // the same statement ranks on the profile score alone.
  const profileRankParam = addParam(seniorityRank[profile.seniority] ?? 2);
  const skillsParam = addParam(unique(profile.skills.map(normalize)));
  const roleGroupsParam = addParam(
    JSON.stringify(
      profile.desiredRoles
        .map((role) => normalize(role).split(/\s+/).filter((token) => token.length > 3))
        .filter((tokens) => tokens.length > 0),
    ),
  );
  const semanticVectorParam = addParam(semantic?.embedding ?? null);
  const semanticModelParam = addParam(semantic?.model ?? null);
  const minScoreParam = addParam(filters.minScore ?? null);
  const limitParam = addParam(limit);
  const offsetParam = addParam(offset);

  // Only the daily-matches endpoint asks for score-first ordering. The
  // ordinary feed keeps its location-first order, so this flag changes
  // nothing for existing callers.
  const orderBy = filters.orderByScore
    ? "ranking_score DESC, posted_at DESC, id ASC"
    : "location_score DESC, eligibility_rank DESC, ranking_score DESC, posted_at DESC, id ASC";

  const locationScoreSql = `CASE
    WHEN work_mode = 'remote' THEN 50::int
    ELSE LEAST(
      50::int,
      GREATEST(
        CASE WHEN ${cityMatch("feed", currentLocationParam)} THEN 50 ELSE 0 END,
        CASE WHEN ${cityMatch("feed", preferredLocationParam)} THEN 40 ELSE 0 END,
        CASE WHEN ${countryMatch("feed", currentCountryParam)} THEN 30 ELSE 0 END,
        CASE WHEN ${countryMatch("feed", preferredCountryParam)} AND NOT ${countryMatch("feed", currentCountryParam)} THEN 35 ELSE 0 END
      ) + CASE
        WHEN work_mode = 'hybrid' AND (
          ${cityMatch("feed", currentLocationParam)} OR ${cityMatch("feed", preferredLocationParam)} OR ${countryMatch("feed", currentCountryParam)} OR ${countryMatch("feed", preferredCountryParam)}
        ) THEN 5
        ELSE 0
      END
    )
  END::int`;

  const roleHitsSql = `(
    SELECT count(*)::int
      FROM jsonb_array_elements($${roleGroupsParam}::jsonb) AS "role"(value)
     WHERE EXISTS (
       SELECT 1
         FROM jsonb_array_elements_text("role".value) AS token(value)
        WHERE length(token.value) > 3
          AND lower(title) LIKE ('%' || token.value || '%')
       )
  )`;

  const seniorityScoreSql = `CASE
    ABS($${profileRankParam}::int - CASE lower(seniority)
      WHEN 'intern' THEN 0
      WHEN 'junior' THEN 1
      WHEN 'mid' THEN 2
      WHEN 'senior' THEN 3
      WHEN 'lead' THEN 4
      ELSE 2
    END)
    WHEN 0 THEN 15
    WHEN 1 THEN 11
    ELSE 4
  END::int`;

  const freshnessScoreSql = `CASE
    WHEN posted_at >= now() - interval '7 days' THEN 10
    WHEN posted_at >= now() - interval '14 days' THEN 8
    WHEN posted_at >= now() - interval '30 days' THEN 5
    ELSE 2
  END::int`;

  const semanticSimilaritySql = `CASE
    WHEN $${semanticVectorParam}::vector IS NULL THEN NULL
    WHEN embedding IS NULL
      OR embedding_model IS NULL
      OR embedding_model <> $${semanticModelParam}::text
      OR vector_dims(embedding) <> vector_dims($${semanticVectorParam}::vector)
      THEN NULL
    ELSE GREATEST(0::numeric, 1 - (embedding <=> $${semanticVectorParam}::vector))
  END`;

  const pageSql = `
    WITH feed AS (
      SELECT
        o.id, o.company_id, c.name AS company_name, c.slug AS company_slug,
        c.website AS company_website, o.title, o.description, o.country, o.city,
        o.work_mode, o.seniority, o.employment_type, o.salary_min, o.salary_max,
        o.currency, o.apply_url, o.application_method, o.platform, o.posted_at,
        o.expires_at, o.status, o.eligibility, o.eligibility_reasons,
        o.risk_score, o.risk_action, o.risk_flags, o.embedding, o.embedding_model,
        COALESCE(
          array_agg(os.skill ORDER BY os.skill) FILTER (WHERE os.skill IS NOT NULL),
          '{}'
        ) AS skills,
        count(os.skill)::int AS skill_count,
        count(os.skill) FILTER (
          WHERE lower(trim(os.skill)) = ANY($${skillsParam}::text[])
        )::int AS matched_skill_count
      FROM opportunities o
      JOIN companies c ON c.id = o.company_id
      LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
     WHERE ${clauses.join(" AND ")}
     GROUP BY o.id, c.id
    ),
    located AS (
      SELECT feed.*,
        CASE
          WHEN skill_count = 0 THEN 20::numeric
          ELSE round(matched_skill_count::numeric * 45 / greatest(skill_count, 1), 1)
        END AS skill_score,
        ${locationScoreSql} AS location_score,
        ${roleHitsSql} AS role_hits,
        ${seniorityScoreSql} AS seniority_score,
        ${freshnessScoreSql} AS freshness_score
      FROM feed
    ),
    rolescored AS (
      SELECT located.*,
        CASE located.eligibility
          WHEN 'eligible' THEN 2
          WHEN 'ineligible' THEN 0
          ELSE 1
        END::int AS eligibility_rank,
        CASE
          WHEN located.role_hits > 0 THEN LEAST(15, located.role_hits * 8)
          ELSE 3
        END::int AS role_score
      FROM located
    ),
    scored AS (
      SELECT rolescored.*,
        LEAST(
          100::numeric,
          round((
            rolescored.skill_score
            + rolescored.seniority_score
            + rolescored.location_score
            + rolescored.role_score
            + rolescored.freshness_score
          )::numeric, 0)
        )::int AS base_score
      FROM rolescored
    ),
    -- The word "similar" cannot name a CTE: it is a keyword in this grammar
    -- (SIMILAR TO), so the stage is named for what it computes.
    semantic_scored AS (
      SELECT scored.*,
        ${semanticSimilaritySql}::numeric AS semantic_similarity
      FROM scored
    ),
    ranked AS (
      SELECT semantic_scored.*,
        CASE
          WHEN semantic_scored.semantic_similarity IS NULL THEN semantic_scored.base_score
          ELSE round((
            semantic_scored.base_score * 0.6
            + semantic_scored.semantic_similarity * 100 * 0.4
          )::numeric, 1)
        END::numeric AS ranking_score
      FROM semantic_scored
    ),
    -- A minimum score is a threshold on the computed score, not on a
    -- column, so it has to be applied outside the CTE that computes it.
    score_filtered AS (
      SELECT *
        FROM ranked
       WHERE $${minScoreParam}::numeric IS NULL
          OR ranking_score >= $${minScoreParam}::numeric
    )
    SELECT *
      FROM score_filtered
     ORDER BY ${orderBy}
     LIMIT $${limitParam}::int
    OFFSET $${offsetParam}::int
  `;

  interface RankedRow extends OpportunityRow {
    embedding?: string | null;
    embedding_model?: string | null;
    ranking_score: number | string;
    semantic_similarity?: number | string | null;
  }

  const [countResult, pageResult] = await Promise.all([
    query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM opportunities o
         JOIN companies c ON c.id = o.company_id
        WHERE ${clauses.join(" AND ")}`,
      countValues,
    ),
    query<RankedRow>(pageSql, values),
  ]);

  const items = pageResult.rows.map((row) => {
    const opportunity = mapOpportunity(row);
    const match = scoreMatch(profile, opportunity);
    const rankingScore = Number(row.ranking_score);

    const semanticSimilarity =
      row.semantic_similarity === null || row.semantic_similarity === undefined
        ? null
        : Number(row.semantic_similarity);

    return {
      ...opportunity,
      match: {
        ...match,
        score: rankingScore,
        explanation: semanticSimilarity
          ? `${match.explanation} · ${Math.round(semanticSimilarity * 100)}% semantic relevance`
          : match.explanation,
      },
    };
  });

  return {
    items,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getOpportunityWithMatch(
  userId: string,
  opportunityId: string,
): Promise<(Opportunity & { match: MatchResult }) | null> {
  const [profile, opportunity] = await Promise.all([
    getProfile(userId),
    getOpportunity(opportunityId),
  ]);
  if (!profile || !opportunity) return null;

  return { ...opportunity, match: scoreMatch(profile, opportunity) };
}