import { createHash } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import { query } from "../../db/pool.js";

export type RiskAction = "publish" | "hold" | "reject";

export interface RiskFeatures {
  domainAgeDays: number | null;
  salaryZScore: number | null;
  emailDomainMismatch: boolean;
  templateSpamRatio: number;
  simhashDistanceToScam: number | null;
  companyKnown: boolean;
  bulkPostingCount: number;
  httpsOnly: boolean;
  descriptionLength: number;
  salaryPeriod: SalaryPeriod;
  salaryCurrency: string;
  salaryUsdMonthly: number | null;
  expectedSalaryUsdMonthly: number;
}

export interface RiskAssessment {
  score: number;
  action: RiskAction;
  flags: string[];
  features: RiskFeatures;
}

const WEIGHTS = {
  newDomain: 18,
  invalidCert: 12,
  salaryOutlier: 16,
  emailMismatch: 14,
  templateSpam: 20,
  simhashMatch: 26,
  unknownCompany: 8,
  bulkPosting: 14,
  noHttps: 6,
  thinDescription: 8,
};

function shingles(text: string, size = 3): string[] {
  const normalised = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalised.split(" ");
  const output: string[] = [];
  for (let index = 0; index + size <= tokens.length; index += 1) {
    output.push(tokens.slice(index, index + size).join(" "));
  }
  return output;
}

export function simhash(text: string): bigint {
  const features = shingles(text);
  if (features.length === 0) return 0n;

  const bits = new Array<number>(64).fill(0);

  for (const feature of features) {
    const digest = createHash("sha1").update(feature).digest();
    const high = digest.readUInt32BE(0);
    const low = digest.readUInt32BE(4);
    for (let index = 0; index < 32; index += 1) {
      const highBit = (high >>> (31 - index)) & 1;
      const lowBit = (low >>> (31 - index)) & 1;
      bits[index] = (bits[index] ?? 0) + (highBit ? 1 : -1);
      bits[32 + index] = (bits[32 + index] ?? 0) + (lowBit ? 1 : -1);
    }
  }

  let hash = 0n;
  for (let index = 0; index < 64; index += 1) {
    if ((bits[index] ?? 0) > 0) hash |= 1n << BigInt(index);
  }
  return BigInt.asIntN(64, hash);
}

export function hammingDistance(a: bigint, b: bigint): number {
  let value = BigInt.asUintN(64, a) ^ BigInt.asUintN(64, b);
  let distance = 0;
  while (value > 0n) {
    value &= value - 1n;
    distance += 1;
  }
  return distance;
}

function duplicateNgramRatio(text: string): number {
  const grams = shingles(text, 2);
  if (grams.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const gram of grams) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let duplicated = 0;
  for (const count of counts.values()) {
    if (count > 1) duplicated += count - 1;
  }
  return duplicated / grams.length;
}

async function certificateAgeDays(hostname: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const socket = tlsConnect(
        { host: hostname, port: 443, servername: hostname },
        () => {
          const cert = socket.getPeerCertificate();
          socket.destroy();
          const validFrom = cert?.valid_from ? new Date(cert.valid_from) : null;
          if (!validFrom || Number.isNaN(validFrom.getTime())) {
            resolve(null);
            return;
          }
          resolve(Math.max(0, Math.floor((Date.now() - validFrom.getTime()) / 86_400_000)));
        },
      );
      socket.setTimeout(6_000, () => {
        socket.destroy();
        resolve(null);
      });
      socket.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const SALARY_MEDIAN_BY_SENIORITY: Record<string, { median: number; mad: number }> = {
  intern: { median: 15_000, mad: 6_000 },
  junior: { median: 30_000, mad: 14_000 },
  mid: { median: 62_000, mad: 28_000 },
  senior: { median: 105_000, mad: 48_000 },
  lead: { median: 160_000, mad: 70_000 },
};

const COUNTRY_PAYING_POWER: Record<string, number> = {
  ke: 0.22,
  kenya: 0.22,
  ng: 0.26,
  nigeria: 0.26,
  za: 0.4,
  "south africa": 0.4,
  in: 0.25,
  india: 0.25,
  de: 0.72,
  germany: 0.72,
  gb: 0.78,
  "united kingdom": 0.78,
  uk: 0.78,
  us: 1,
  "united states": 1,
  "united states of america": 1,
  ca: 0.68,
  canada: 0.68,
  au: 0.72,
  australia: 0.72,
  ae: 0.6,
  "united arab emirates": 0.6,
  sa: 0.55,
  "saudi arabia": 0.55,
  sg: 0.62,
  singapore: 0.62,
  br: 0.35,
  brazil: 0.35,
  mx: 0.34,
  mexico: 0.34,
  id: 0.26,
  indonesia: 0.26,
  ph: 0.3,
  philippines: 0.3,
  vn: 0.24,
  vietnam: 0.24,
  cn: 0.42,
  china: 0.42,
  jp: 0.62,
  japan: 0.62,
  kr: 0.55,
  "south korea": 0.55,
  es: 0.56,
  spain: 0.56,
  fr: 0.6,
  france: 0.6,
  it: 0.55,
  italy: 0.55,
  nl: 0.68,
  netherlands: 0.68,
  se: 0.62,
  sweden: 0.62,
  no: 0.66,
  norway: 0.66,
  ch: 0.82,
  switzerland: 0.82,
  eg: 0.28,
  egypt: 0.28,
  ma: 0.32,
  morocco: 0.32,
  tz: 0.24,
  tanzania: 0.24,
  ug: 0.2,
  uganda: 0.2,
  zw: 0.22,
  zimbabwe: 0.22,
  zm: 0.22,
  zambia: 0.22,
  rw: 0.18,
  rwa: 0.18,
  et: 0.2,
  ethiopia: 0.2,
  gh: 0.25,
  ghana: 0.25,
};

const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  KES: 0.0077,
  NGN: 0.00067,
  ZAR: 0.055,
  INR: 0.012,
  EUR: 1.09,
  GBP: 1.27,
  AUD: 0.66,
  CAD: 0.73,
  JPY: 0.0065,
  ZMW: 0.037,
  EGP: 0.02,
  BRL: 0.185,
  MXN: 0.055,
  KRW: 0.00074,
  SGD: 0.75,
  CHF: 1.12,
  SEK: 0.095,
  NOK: 0.094,
  DKK: 0.146,
  PLN: 0.25,
  TRY: 0.031,
  AED: 0.272,
  SAR: 0.267,
  QAR: 0.275,
  KWD: 3.25,
  BHD: 2.65,
  OMR: 2.6,
  TZS: 0.00038,
  UGX: 0.00027,
  RWF: 0.00077,
  ETB: 0.018,
  GHS: 0.067,
  ILS: 0.27,
  HKD: 0.128,
  TWD: 0.031,
  MYR: 0.21,
  THB: 0.028,
  PHP: 0.017,
  IDR: 0.000063,
  VND: 0.00004,
  PKR: 0.0036,
  BDT: 0.0091,
  LKR: 0.0032,
};

const MONTHS_PER_YEAR = 12;

export type SalaryPeriod = "hour" | "day" | "week" | "month" | "year";

const PERIOD_TO_MONTHS: Record<SalaryPeriod, number> = {
  hour: 1 / 160,
  day: 1 / 21,
  week: 52 / 12,
  month: 1,
  year: 1 / 12,
};

export function detectSalaryPeriod(text: string): SalaryPeriod {
  const lowered = text.toLowerCase();
  if (/per\s*hour|\/\s*hour|hourly|per\s*hr|\bhr\b/.test(lowered)) return "hour";
  if (/per\s*day|\/\s*day|daily|per\s*diem/.test(lowered)) return "day";
  if (/per\s*week|\/\s*week|weekly/.test(lowered)) return "week";
  if (/per\s*month|\/\s*month|monthly|p\.?m\.?\b|per\s*mnth/.test(lowered)) return "month";
  if (/per\s*year|\/\s*year|annually|annual|p\.?a\.?\b|per\s*annum/.test(lowered))
    return "year";
  return "month";
}

export function normaliseSalaryToUsdMonthly(
  amount: number,
  currency: string,
  period: SalaryPeriod,
): number {
  const rate = USD_PER_UNIT[currency.toUpperCase()] ?? 1;
  const monthlyLocal = amount * PERIOD_TO_MONTHS[period];
  return monthlyLocal * rate;
}

function medianSalaryFor(seniority: string, country: string): number {
  const key = country.trim().toLowerCase();
  const factor = COUNTRY_PAYING_POWER[key] ?? 0.45;
  const base = SALARY_MEDIAN_BY_SENIORITY[seniority] ??
    SALARY_MEDIAN_BY_SENIORITY.mid ?? { median: 62_000, mad: 28_000 };
  // Base medians are annual USD; the comparison happens in monthly USD.
  return Math.round((base.median * factor) / MONTHS_PER_YEAR);
}

export async function extractFeatures(input: {
  title: string;
  description: string;
  company: string;
  applyUrl: string;
  country: string;
  seniority: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
}): Promise<RiskFeatures> {
  const hostname = hostnameOf(input.applyUrl);
  const contactEmail = input.description.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase();
  const emailDomain = contactEmail?.split("@")[1];

  const [certAge, companyRow, bulk] = await Promise.all([
    hostname ? certificateAgeDays(hostname) : Promise.resolve(null),
    hostname
      ? query<{ website: string | null }>(
          `SELECT website FROM companies WHERE slug = $1::text OR website ILIKE '%' || $2::text || '%' LIMIT 1`,
          [
            input.company.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            hostname,
          ],
        )
      : Promise.resolve({ rows: [] as Array<{ website: string | null }> }),
    hostname
      ? query<{ count: string }>(
          `SELECT count(*)::text AS count FROM opportunities
            WHERE apply_url ILIKE '%' || $1::text || '%'
              AND created_at > now() - interval '24 hours'`,
          [hostname],
        )
      : Promise.resolve({ rows: [{ count: "0" }] }),
  ]);

  const salary = input.salaryMax ?? input.salaryMin;
  const period = detectSalaryPeriod(`${input.title} ${input.description}`);
  const currency = (input.currency ?? "USD").toUpperCase();
  const medianUsd = medianSalaryFor(input.seniority, input.country);
  const salaryZScore = salary
    ? Math.abs(
        Math.log(
          Math.max(normaliseSalaryToUsdMonthly(salary, currency, period), 1) /
            Math.max(medianUsd, 1),
        ),
      )
    : null;

  return {
    domainAgeDays: certAge,
    salaryZScore,
    emailDomainMismatch: Boolean(
      emailDomain && hostname && !hostname.includes(emailDomain) && !emailDomain.includes(hostname),
    ),
    templateSpamRatio: duplicateNgramRatio(`${input.title} ${input.description}`),
    simhashDistanceToScam: null,
    companyKnown: companyRow.rows.length > 0,
    bulkPostingCount: Number(bulk.rows[0]?.count ?? 0),
    httpsOnly: input.applyUrl.startsWith("https://"),
    descriptionLength: input.description.length,
    salaryPeriod: period,
    salaryCurrency: currency,
    salaryUsdMonthly: salary
      ? Math.round(normaliseSalaryToUsdMonthly(salary, currency, period))
      : null,
    expectedSalaryUsdMonthly: medianUsd,
  };
}

async function nearestScamDistance(hash: bigint, variant: string): Promise<number | null> {
  const result = await query<{ simhash: string }>(
    `SELECT simhash FROM scam_signatures
      WHERE label LIKE '%:' || $1::text
      LIMIT 500`,
    [variant],
  );
  if (result.rows.length === 0) return null;
  let nearest = 64;
  for (const row of result.rows) {
    nearest = Math.min(nearest, hammingDistance(hash, BigInt(row.simhash)));
  }
  return nearest;
}

async function nearestScamDistanceBoth(
  fullHash: bigint,
  descriptionHash: bigint,
): Promise<number | null> {
  const [full, description] = await Promise.all([
    nearestScamDistance(fullHash, "full"),
    nearestScamDistance(descriptionHash, "description"),
  ]);
  const candidates = [full, description].filter(
    (value): value is number => value !== null,
  );
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

export async function assessRisk(input: {
  title: string;
  description: string;
  company: string;
  applyUrl: string;
  country: string;
  seniority: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
}): Promise<RiskAssessment> {
  const features = await extractFeatures(input);
  const fullHash = simhash(`${input.company} ${input.title} ${input.description}`);
  const descriptionHash = simhash(input.description);
  const distance = await nearestScamDistanceBoth(fullHash, descriptionHash);

  const flags: string[] = [];
  let score = 0;

  if (features.domainAgeDays !== null && features.domainAgeDays < 30) {
    flags.push("NEW_DOMAIN");
    score += WEIGHTS.newDomain;
  }
  if (!features.httpsOnly) {
    flags.push("NO_HTTPS");
    score += WEIGHTS.noHttps;
  }
  if (features.salaryZScore !== null && features.salaryZScore > 1.1) {
    flags.push(
      `SALARY_OUTLIER:${features.salaryUsdMonthly}/mo vs ${features.expectedSalaryUsdMonthly}/mo expected`,
    );
    score += WEIGHTS.salaryOutlier;
  }
  if (features.emailDomainMismatch) {
    flags.push("EMAIL_DOMAIN_MISMATCH");
    score += WEIGHTS.emailMismatch;
  }
  if (features.templateSpamRatio > 0.12) {
    flags.push("TEMPLATE_SPAM");
    score += WEIGHTS.templateSpam;
  }
  if (distance !== null && distance <= 3) {
    flags.push("SCAM_TEMPLATE_MATCH");
    score += WEIGHTS.simhashMatch;
  }
  if (!features.companyKnown) {
    flags.push("UNKNOWN_COMPANY");
    score += WEIGHTS.unknownCompany;
  }
  if (features.bulkPostingCount > 8) {
    flags.push("BULK_POSTING");
    score += WEIGHTS.bulkPosting;
  }
  if (features.descriptionLength < 120) {
    flags.push("THIN_DESCRIPTION");
    score += WEIGHTS.thinDescription;
  }

  const finalScore = Math.min(100, Math.round(score));
  const action: RiskAction =
    finalScore >= 70 ? "reject" : finalScore >= 35 ? "hold" : "publish";

  return {
    score: finalScore,
    action,
    flags,
    features: { ...features, simhashDistanceToScam: distance },
  };
}

export function fingerprintInput(input: {
  company: string;
  title: string;
  city?: string;
  postedAt?: Date;
}): string {
  const company = input.company.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const title = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const city = (input.city ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const day = (input.postedAt ?? new Date()).toISOString().slice(0, 10);
  return createHash("sha1").update(`${company}|${title}|${city}|${day}`).digest("hex");
}
