export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "industrial_attachment",
  "trainee",
  "freelance",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * Reduces the many spellings found on employer boards to the product's
 * small set of employment choices.
 *
 * The catalogue is populated from many sources, and those sources disagree:
 * one board writes "full_time", another "Full time", another "permanent
 * employment", and a German board writes "unbefristeter Arbeitsvertrag".
 * Treating those as different arrangements hid more than a thousand
 * permanent roles from a candidate who asked for full-time work.
 */
export function canonicalEmploymentType(value: string | null | undefined): string {
  const normalised = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalised) return "full_time";

  if (
    normalised.includes("industrial_attachment") ||
    normalised.includes("attachment")
  ) {
    return "industrial_attachment";
  }
  if (normalised.includes("trainee")) return "trainee";
  if (
    normalised.includes("intern") ||
    normalised.includes("praktikum") ||
    normalised.includes("stage") ||
    normalised.includes("ausbildung") ||
    normalised.includes("apprentice") ||
    normalised.includes("werkstudent") ||
    normalised.includes("working_student")
  ) {
    return "internship";
  }
  if (
    normalised.includes("freelance") ||
    normalised.includes("freelancer") ||
    normalised.includes("freiberuf") ||
    normalised.includes("self_employed") ||
    normalised.includes("independent_contractor")
  ) {
    return "freelance";
  }
  if (
    normalised.includes("part") ||
    normalised.includes("teilzeit") ||
    normalised.includes("minijob") ||
    normalised.includes("deeltijd")
  ) {
    return "part_time";
  }
  if (
    normalised.includes("full") ||
    normalised.includes("permanent") ||
    normalised.includes("unbefristet") ||
    normalised.includes("indefinite") ||
    normalised.includes("vollzeit") ||
    normalised.includes("fixed_permanent")
  ) {
    return "full_time";
  }
  if (
    normalised.includes("contract") ||
    normalised.includes("temporary") ||
    normalised.includes("befristet") ||
    normalised.includes("fixed_term") ||
    normalised.includes("cdd") ||
    normalised.includes("interim")
  ) {
    return "contract";
  }

  return normalised;
}

/**
 * The SQL form of {@link canonicalEmploymentType}.
 *
 * The expression is deliberately kept beside the TypeScript function so
 * filters, facets, ranking and the pure matcher all reduce a source board's
 * spelling in the same way.
 */
export function canonicalEmploymentTypeSql(column: string): string {
  return `CASE
    WHEN ${column} ILIKE '%industrial attachment%'
      OR ${column} ILIKE '%industrial_attachment%'
      OR ${column} ILIKE '%attachment%'
      THEN 'industrial_attachment'
    WHEN ${column} ILIKE '%trainee%'
      THEN 'trainee'
    WHEN ${column} ILIKE '%intern%'
      OR ${column} ILIKE '%praktikum%'
      OR ${column} ILIKE '%stage%'
      OR ${column} ILIKE '%ausbildung%'
      OR ${column} ILIKE '%apprentice%'
      OR ${column} ILIKE '%werkstudent%'
      OR ${column} ILIKE '%working student%'
      OR ${column} ILIKE '%working_student%'
      THEN 'internship'
    WHEN ${column} ILIKE '%freelance%'
      OR ${column} ILIKE '%freelancer%'
      OR ${column} ILIKE '%freiberuf%'
      OR ${column} ILIKE '%self-employed%'
      OR ${column} ILIKE '%self_employed%'
      OR ${column} ILIKE '%independent contractor%'
      OR ${column} ILIKE '%independent_contractor%'
      THEN 'freelance'
    WHEN ${column} ILIKE '%part%'
      OR ${column} ILIKE '%teilzeit%'
      OR ${column} ILIKE '%minijob%'
      OR ${column} ILIKE '%deeltijd%'
      THEN 'part_time'
    WHEN ${column} ILIKE '%full%'
      OR ${column} ILIKE '%permanent%'
      OR ${column} ILIKE '%unbefristet%'
      OR ${column} ILIKE '%indefinite%'
      OR ${column} ILIKE '%vollzeit%'
      THEN 'full_time'
    WHEN ${column} ILIKE '%contract%'
      OR ${column} ILIKE '%temporary%'
      OR ${column} ILIKE '%befristet%'
      OR ${column} ILIKE '%fixed-term%'
      OR ${column} ILIKE '%fixed_term%'
      OR ${column} ILIKE '%cdd%'
      OR ${column} ILIKE '%interim%'
      THEN 'contract'
    ELSE lower(regexp_replace(${column}, '[^a-zA-Z0-9]+', '_', 'g'))
  END`;
}
