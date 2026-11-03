/**
 * Geographic & work-mode eligibility.
 *
 * The product's core question is: "can a Kenyan (and more broadly an African)
 * candidate do this job?" We answer it from what the posting actually says,
 * not from a country guess:
 *
 *   • worldwide / anywhere / global            → eligible, remote
 *   • explicit Africa / EMEA / APAC coverage   → eligible
 *   • country+city present                     → eligible only if inside the
 *                                                allowed set (or willing to
 *                                                relocate)
 *   • restricted lists ("US only", "EU only")  → not eligible
 *
 * This is deliberately conservative: a false positive costs a user an
 * application, a false negative costs us a match. Everything is data-driven
 * from the posting text and is stored so the UI can explain the decision.
 */

export type WorkMode = "remote" | "hybrid" | "onsite";
export type Eligibility = "eligible" | "unlikely" | "ineligible" | "unknown";

export interface EligibilityResult {
  workMode: WorkMode | null;
  eligibility: Eligibility;
  /** Countries the posting explicitly names as acceptable, when stated. */
  namedCountries: string[];
  /** Where the work is based, if the posting says so. */
  baseCountry: string | null;
  baseCity: string | null;
  timezoneOk: boolean;
  /** Why we decided what we decided — shown to the user. */
  reasons: string[];
  confidence: number;
}

export const PRIMARY_COUNTRY = "Kenya";

export const AFRICAN_COUNTRIES = [
  "Kenya", "Nigeria", "South Africa", "Ghana", "Egypt", "Ethiopia", "Tanzania",
  "Uganda", "Rwanda", "Senegal", "Cameroon", "Ivory Coast", "Côte d'Ivoire",
  "Morocco", "Tunisia", "Algeria", "Zimbabwe", "Zambia", "Botswana", "Namibia",
  "Mozambique", "Madagascar", "Mali", "Burkina Faso", "Niger", "Chad", "Sudan",
  "Angola", "Malawi", "Somalia", "Benin", "Togo", "Sierra Leone", "Liberia",
  "Gambia", "Guinea", "Mauritius", "Seychelles", "Cape Verde", "Djibouti",
  "Eritrea", "Lesotho", "Eswatini", "Burundi", "DR Congo", "Republic of the Congo",
  "Gabon", "Equatorial Guinea", "Mauritania", "South Sudan", "Central African Republic",
];

/** ISO-ish aliases so "KE", "Nairobi, KE" and "Kenya" all resolve. */
const COUNTRY_ALIASES: Record<string, string> = {
  ke: "Kenya", kenya: "Kenya", nairobi: "Kenya", mombasa: "Kenya", kisumu: "Kenya",
  ng: "Nigeria", nigeria: "Nigeria", lagos: "Nigeria", abuja: "Nigeria",
  za: "South Africa", "south africa": "South Africa", joburg: "South Africa",
  johannesburg: "South Africa", "cape town": "South Africa", pretoria: "South Africa",
  gh: "Ghana", ghana: "Ghana", accra: "Ghana",
  eg: "Egypt", egypt: "Egypt", cairo: "Egypt",
  tz: "Tanzania", tanzania: "Tanzania", "dar es salaam": "Tanzania", dodoma: "Tanzania",
  ug: "Uganda", uganda: "Uganda", kampala: "Uganda",
  rw: "Rwanda", rwanda: "Rwanda", kigali: "Rwanda",
  sn: "Senegal", senegal: "Senegal", dakar: "Senegal",
  et: "Ethiopia", ethiopia: "Ethiopia", "addis ababa": "Ethiopia",
  ma: "Morocco", morocco: "Morocco", casablanca: "Morocco", rabat: "Morocco",
  zw: "Zimbabwe", zimbabwe: "Zimbabwe", harare: "Zimbabwe",
  zm: "Zambia", zambia: "Zambia", lusaka: "Zambia",
  cm: "Cameroon", cameroon: "Cameroon", "yaoundé": "Cameroon", douala: "Cameroon",
  ci: "Ivory Coast", "ivory coast": "Ivory Coast", "côte d'ivoire": "Ivory Coast",
  au: "Australia", us: "United States", "united states": "United States",
  usa: "United States", gb: "United Kingdom", "united kingdom": "United Kingdom",
  uk: "United Kingdom", de: "Germany", germany: "Germany", fr: "France",
  france: "France", nl: "Netherlands", netherlands: "Netherlands",
  in: "India", india: "India", ae: "United Arab Emirates", uae: "United Arab Emirates",
  ca: "Canada", canada: "Canada", sg: "Singapore", singapore: "Singapore",
};

const WORLDWIDE =
  /worldwide|anywhere|work from anywhere|global(ly)? (hiring|remote|open)|remote (first|only)|any location|anywhere in the world/i;

const RESTRICTIVE =
  /must (?:be )?(?:based|resid\w+|locat\w+) in|only (?:open|available|applicable) to|residents? of|authorised to work in|authorized to work in|resident in|based in (?:the )?(us|usa|united states|uk|united kingdom|canada|eu|europe|germany|australia)|eligible to work in (?:the )?(us|usa|uk|eu|europe)|us[- ]only|eu[- ]only|uk[- ]only|must reside in|not available outside|do not apply if you are (?:outside|not)/i;

const NOT_ELIGIBLE_REGIONS =
  /\b(?:us|usa|united states|uk|united kingdom|eu|europe|germany|france|canada|australia|new zealand|japan|singapore|uae|saudi|qatar|switzerland|netherlands|nordics?)[- ](?:only|residents?)\b/i;

const AFRICA_MENTION =
  /\b(africa|african|emea|mena|east africa|west africa|sub[- ]saharan|global south)\b/i;

const HYBRID = /\bhybrid\b|\b\d+ (?:days? x? ?(?:in|at) (?:the )?office|days? in office)\b/i;
const REMOTE = /\bremote\b|\bwork from home\b|\btelework\b|\bwfh\b/i;
const ONSITE = /\bon[- ]?site\b|\bin[- ]?office\b|\bin person\b/i;

const CITY_HINTS = Object.keys(COUNTRY_ALIASES).filter((key) => key.length > 3);

function detectCountries(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found = new Set<string>();

  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (alias.length < 4) continue;
    if (new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`).test(lower)) found.add(country);
  }

  // Keeps ordering deterministic for tests and reporting.
  return [...found];
}

export function assessEligibility(input: {
  title?: string;
  description?: string;
  location?: string | null;
  country?: string | null;
  city?: string | null;
  /** Posted by a platform known to be worldwide-friendly. */
  worldwideByDefault?: boolean;
}): EligibilityResult {
  const haystack = [
    input.title ?? "",
    input.location ?? "",
    input.country ?? "",
    input.city ?? "",
    input.description ?? "",
  ]
    .join("\n")
    .slice(0, 20_000);

  const reasons: string[] = [];
  const namedCountries = detectCountries(haystack);
  const worldwide = WORLDWIDE.test(haystack) || input.worldwideByDefault === true;
  const restrictive = RESTRICTIVE.test(haystack);
  const notEligibleRegion = NOT_ELIGIBLE_REGIONS.test(haystack);
  const africaMentioned = AFRICA_MENTION.test(haystack);

  // Work mode
  let workMode: WorkMode | null = null;
  if (HYBRID.test(haystack)) workMode = "hybrid";
  else if (REMOTE.test(haystack)) workMode = "remote";
  else if (ONSITE.test(haystack)) workMode = "onsite";
  if (!workMode) {
    workMode =
      /remote/i.test(input.location ?? "") ? "remote" : (input.country ? "onsite" : null);
  }

  // Base location
  const statedCountry = input.country ?? namedCountries[0] ?? null;
  const baseCountry = statedCountry;
  const baseCity = input.city ?? null;

  // Decision
  let eligibility: Eligibility = "unknown";
  let confidence = 0.4;

  if (worldwide && !notEligibleRegion) {
    eligibility = "eligible";
    confidence = 0.85;
    reasons.push("Posting states the role is open worldwide / remote-first.");
  }

  if (eligibility !== "eligible" && africaMentioned && !restrictive) {
    eligibility = "eligible";
    confidence = 0.75;
    reasons.push("Posting explicitly references Africa/EMEA coverage.");
  }

  if (eligibility === "unknown" && statedCountry) {
    if (statedCountry === PRIMARY_COUNTRY) {
      eligibility = "eligible";
      confidence = 0.95;
      reasons.push(`Based in ${statedCountry}.`);
    } else if (AFRICAN_COUNTRIES.includes(statedCountry)) {
      eligibility = "eligible";
      confidence = 0.8;
      reasons.push(`Based in ${statedCountry} (Africa).`);
    } else if (restrictive || notEligibleRegion) {
      eligibility = "ineligible";
      confidence = 0.8;
      reasons.push(
        `Posting restricts eligibility and is based in ${statedCountry}.`,
      );
    } else {
      eligibility = "unlikely";
      confidence = 0.5;
      reasons.push(`Based in ${statedCountry}; relocation usually required.`);
    }
  }

  if (restrictive && eligibility === "eligible" && notEligibleRegion) {
    // "worldwide" plus a resident-of clause: the restriction wins.
    eligibility = "ineligible";
    confidence = 0.65;
    reasons.push("Posting also carries a residency restriction.");
  }

  if (restrictive && !worldwide && eligibility === "unknown") {
    eligibility = "ineligible";
    confidence = 0.55;
    reasons.push("Posting restricts candidates by residency or work authorisation.");
  }

  if (eligibility === "unknown") {
    if (workMode === "remote") {
      eligibility = "unlikely";
      confidence = 0.45;
      reasons.push("Remote role with no stated country restriction; verify location rules.");
    } else {
      eligibility = "unknown";
      reasons.push("No location or eligibility statement found.");
    }
  }

  return {
    workMode,
    eligibility,
    namedCountries,
    baseCountry,
    baseCity,
    timezoneOk: eligibility === "eligible",
    reasons,
    confidence,
  };
}

/** Rank so the feed can put the best jobs first: Kenya first, then Africa. */
export function eligibilityRank(result: EligibilityResult): number {
  switch (result.eligibility) {
    case "eligible":
      if (result.baseCountry === PRIMARY_COUNTRY) return 100;
      if (AFRICAN_COUNTRIES.includes(result.baseCountry ?? "")) return 80;
      return 70;
    case "unlikely":
      return 40;
    case "unknown":
      return 20;
    default:
      return 0;
  }
}

export function summariseEligibility(result: EligibilityResult): string {
  const mode = result.workMode ?? "mode unspecified";
  const where = result.baseCountry ? ` · ${result.baseCountry}` : "";
  return `${mode} · ${result.eligibility}${where}`;
}
