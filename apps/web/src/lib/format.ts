export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let previous = 1;
  for (const [limit, unit] of units) {
    if (Math.abs(seconds) < limit) {
      return formatter.format(-Math.round(seconds / previous), unit);
    }
    previous = limit;
  }
  return formatter.format(-Math.round(seconds / 31_557_600), "year");
}

export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
): string {
  if (!min && !max) return "Not disclosed";
  const code = currency ?? "";
  const symbol = code === "USD" ? "$" : code === "KES" ? "KSh " : code === "EUR" ? "€" : code === "GBP" ? "£" : code ? `${code} ` : "";
  const compact = (value: number) =>
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
      : value >= 1_000
        ? `${Math.round(value / 1_000)}k`
        : String(value);
  if (min && max) return `${symbol}${compact(min)}–${compact(max)}`;
  return `${symbol}${compact((min ?? max) as number)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function titleCase(value?: string | null): string {
  if (!value) return "—";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function initials(value?: string | null): string {
  if (!value) return "?";
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export function matchTone(score: number): "success" | "accent" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 60) return "accent";
  if (score >= 40) return "warning";
  return "danger";
}

export function riskTone(score?: number | null): "success" | "warning" | "danger" | "neutral" {
  if (score === null || score === undefined) return "neutral";
  if (score < 30) return "success";
  if (score < 60) return "warning";
  return "danger";
}

/**
 * What the eligibility decision means, in a word or two.
 *
 * The pipeline answers one question for every posting — can a candidate
 * in Kenya actually hold this role — and the answer is read off the
 * posting itself rather than guessed from the country it names. A role
 * that says "open worldwide" is one a candidate can hold; one that says
 * "must be authorised to work in the US" is not, and saying so plainly
 * saves the candidate an application that was never going to be read.
 */
export function eligibilityLabel(
  eligibility?: string | null,
): string {
  switch (eligibility) {
    case "eligible":
      return "You can hold this";
    case "unlikely":
      return "Relocation likely";
    case "ineligible":
      return "Not open to you";
    default:
      return "Not stated";
  }
}

export function eligibilityTone(
  eligibility?: string | null,
): "success" | "warning" | "danger" | "neutral" {
  switch (eligibility) {
    case "eligible":
      return "success";
    case "unlikely":
      return "warning";
    case "ineligible":
      return "danger";
    default:
      return "neutral";
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
