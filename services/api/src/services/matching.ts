import type {
  CandidateProfile,
  MatchFactors,
  MatchResult,
  Opportunity,
} from "@angisoft/job-radar-contracts";
import { query } from "../db/pool.js";
import { semanticHits, type SemanticHit } from "./ai/semantic-search.js";
import { getOpportunity, listOpportunities } from "./opportunities.js";
import type { OpportunityFilters } from "./opportunities.js";
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

/**
 * Location-based filtering and scoring.
 * Location is the PRIMARY factor (50 points out of 100).
 *
 * Rules:
 * 1. Remote jobs are ALWAYS shown (they work from anywhere)
 * 2. Onsite/hybrid jobs are ONLY shown if they match the user's country
 *    OR preferred locations
 * 3. Location is weighted at 50 points (50% of total score)
 * 4. Distance decay: closer jobs score higher
 */
function calculateLocationScore(
  profile: CandidateProfile,
  opportunity: Opportunity,
): { score: number; shown: boolean; reason: string } {
  const isRemote = opportunity.workMode === "remote";
  const isHybrid = opportunity.workMode === "hybrid";
  const isOnsite = opportunity.workMode === "onsite";

  // Remote jobs are always shown - they work from anywhere
  if (isRemote) {
    return { score: 50, shown: true, reason: "remote work" };
  }

  // Check if the job is in the user's country
  const countryMatch =
    profile.country &&
    opportunity.country &&
    normalize(profile.country) === normalize(opportunity.country);

  // Check if the job is in one of the user's preferred locations
  const preferredLocationMatch =
    profile.preferredLocations &&
    profile.preferredLocations.some((loc) =>
      opportunity.city && normalize(loc) === normalize(opportunity.city),
    ) ||
    (opportunity.city &&
      profile.preferredLocations?.some(
        (loc) => normalize(loc) === normalize(opportunity.city),
      ));

  // Check if the job is in the user's current city
  const cityMatch =
    profile.location &&
    opportunity.city &&
    normalize(profile.location) === normalize(opportunity.city);

  // For onsite/hybrid jobs: ONLY show if in candidate's country or preferred location
  if (!isRemote && !countryMatch && !preferredLocationMatch && !cityMatch) {
    return { score: 0, shown: false, reason: "not in your location" };
  }

  // Calculate location score (0-50)
  let score = 0;

  // Same city = 50 points
  if (cityMatch) {
    score = 50;
  } else if (countryMatch) {
    // Same country but different city = 30 points
    score = 30;
  } else if (preferredLocationMatch) {
    // Preferred location = 40 points
    score = 40;
  }

  // Hybrid jobs get a small bonus if in country/preferred location
  if (isHybrid && (countryMatch || preferredLocationMatch || cityMatch)) {
    score = Math.min(50, score + 5);
  }

  return { score, shown: true, reason: "location match" };
}

function calculate(
  profile: CandidateProfile,
  opportunity: Opportunity,
): MatchResult {
  const profileSkills = new Set(profile.skills.map(normalize));
  const required = opportunity.skills.map(normalize);
  const matched = required.filter((skill) => profileSkills.has(skill));
  const missing = required.filter((skill) => !profileSkills.has(normalize(skill)));

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
      explanation: "Not in your location",
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

  const result = calculate(profile, opportunity);

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
}

export async function rankedOpportunities(
  userId: string,
  filters: RankedFilters,
): Promise<Array<Opportunity & { match: MatchResult }>> {
  const profile = await getProfile(userId);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  // Get all active opportunities (we'll filter by location in memory)
  const opportunities = listOpportunities(filters);
  const [results, semantic] = await Promise.all([
    opportunities,
    filters.semantic && filters.q
      ? semanticHits(filters.q, {
          country: filters.country,
          limit: 100,
        }).catch(() => [] as SemanticHit[])
      : Promise.resolve([] as SemanticHit[]),
  ]);

  const similarityById = new Map(semantic.map((hit) => [hit.id, hit.similarity]));

  // Filter and rank opportunities by location first
  const ranked = results
    .map((opportunity) => {
      const match = calculate(profile, opportunity);

      // Filter out jobs that shouldn't be shown (not remote, not in user's location)
      if (!locationShown(match)) {
        return null;
      }

      const similarity = similarityById.get(opportunity.id);
      const blended =
        similarity !== undefined
          ? match.score * 0.6 + Math.max(similarity, 0) * 100 * 0.4
          : match.score;

      return {
        ...opportunity,
        match: {
          ...match,
          score: Math.min(100, Math.round(blended * 10) / 10),
          explanation:
            similarity !== undefined
              ? `${match.explanation} · ${(similarity * 100).toFixed(0)}% semantic relevance`
              : match.explanation,
        },
      };
    })
    .filter((item): item is (Opportunity & { match: MatchResult }) => item !== null);

  // Sort by: location score first (descending), then total score (descending)
  // This ensures jobs closer to the user appear first
  ranked.sort((a, b) => {
    // First sort by location score (higher = closer = better)
    const locationDiff = b.match.factors.location - a.match.factors.location;
    if (locationDiff !== 0) return locationDiff;

    // Then sort by total score
    return b.match.score - a.match.score;
  });

  return ranked;
}

function locationShown(match: MatchResult): boolean {
  // If score is 0, the job was filtered out by location
  return match.score > 0;
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

  return { ...opportunity, match: calculate(profile, opportunity) };
}