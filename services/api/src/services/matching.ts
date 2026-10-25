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

function calculate(
  profile: CandidateProfile,
  opportunity: Opportunity,
): MatchResult {
  const profileSkills = new Set(profile.skills.map(normalize));
  const required = opportunity.skills.map(normalize);
  const matched = required.filter((skill) => profileSkills.has(skill));
  const missing = opportunity.skills.filter(
    (skill) => !profileSkills.has(normalize(skill)),
  );

  const skillScore =
    required.length === 0 ? 20 : (matched.length / required.length) * 45;

  const profileRank = seniorityRank[profile.seniority] ?? 2;
  const opportunityRank = seniorityRank[opportunity.seniority] ?? 2;
  const rankDiff = Math.abs(profileRank - opportunityRank);
  const seniorityScore = rankDiff === 0 ? 15 : rankDiff === 1 ? 11 : 4;

  const countryMatch = normalize(profile.country) === normalize(opportunity.country);
  const locationMatch =
    normalize(profile.location) === normalize(opportunity.city) ||
    profile.preferredLocations.some(
      (location) => normalize(location) === normalize(opportunity.city),
    );
  const remoteMatch =
    profile.remotePreferred && opportunity.workMode === "remote";

  let locationScore = 0;
  if (countryMatch) locationScore += 6;
  if (locationMatch) locationScore += 6;
  if (remoteMatch) locationScore += 6;
  if (opportunity.workMode === "hybrid" && (locationMatch || countryMatch)) {
    locationScore = Math.max(locationScore, 10);
  }
  locationScore = Math.min(locationScore, 15);

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

  const factors: MatchFactors = {
    skills: Math.round(skillScore * 10) / 10,
    seniority: seniorityScore,
    location: locationScore,
    role: roleScore,
    freshness: freshnessScore,
  };

  const score = Math.round(
    (factors.skills +
      factors.seniority +
      factors.location +
      factors.role +
      factors.freshness) *
      10,
  ) / 10;

  const explanationParts = [
    `${score.toFixed(0)}% match`,
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

  const ranked = results.map((opportunity) => {
    const match = calculate(profile, opportunity);
    const similarity = similarityById.get(opportunity.id);
    if (similarity === undefined) return { ...opportunity, match };

    const blended = match.score * 0.65 + Math.max(similarity, 0) * 100 * 0.35;
    return {
      ...opportunity,
      match: {
        ...match,
        score: Math.round(blended * 10) / 10,
        explanation: `${match.explanation} · ${(similarity * 100).toFixed(0)}% semantic relevance`,
      },
    };
  });

  return ranked.sort((a, b) => b.match.score - a.match.score);
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
