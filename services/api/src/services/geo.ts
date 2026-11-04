/**
 * Geography for job discovery.
 *
 * Two rules govern everything here:
 *
 *  1. We never fingerprint a device. Location comes from an explicit act of
 *     consent (the browser's geolocation API, the phone's geolocator plugin)
 *     or from what the candidate typed. IP is only used as a coarse country
 *     fallback and never as a precise position.
 *  2. "Near me" means a real distance.
 */

const EARTH_RADIUS_KM = 6371;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Country names, mapped from their two-letter code.
 *
 * The two sides of a match write the country differently: a candidate
 * profile says "Kenya", a scraped listing says "KE". A literal comparison
 * treats those as different countries, so a Kenyan user is shown nothing.
 */
const COUNTRY_NAMES: Record<string, string> = {
  KE: "kenya",
  NG: "nigeria",
  ZA: "south africa",
  GH: "ghana",
  TZ: "tanzania",
  UG: "uganda",
  RW: "rwanda",
  ET: "ethiopia",
  EG: "egypt",
  MA: "morocco",
  US: "united states",
  USA: "united states",
  GB: "united kingdom",
  UK: "united kingdom",
  DE: "germany",
  AT: "austria",
  CH: "switzerland",
  FR: "france",
  ES: "spain",
  IT: "italy",
  NL: "netherlands",
  BE: "belgium",
  IE: "ireland",
  PL: "poland",
  PT: "portugal",
  SE: "sweden",
  NO: "norway",
  DK: "denmark",
  FI: "finland",
  CA: "canada",
  AU: "australia",
  NZ: "new zealand",
  IN: "india",
  BD: "bangladesh",
  PK: "pakistan",
  CN: "china",
  JP: "japan",
  BR: "brazil",
  MX: "mexico",
};

/** Normalises a country to a comparable token. */
export function normaliseCountry(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const mapped = COUNTRY_NAMES[trimmed.toUpperCase()];
  if (mapped) return mapped;
  return trimmed.replace(/\s+/g, " ");
}

/** True when two country spellings refer to the same country. */
export function sameCountry(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normaliseCountry(left);
  const b = normaliseCountry(right);
  if (!a || !b) return false;
  return a === b;
}

/**
 * True when two place names refer to the same place.
 *
 * Listings write "London", "London, London", "UK - London" and
 * "London (Hybrid)"; a profile writes "London". The comparison is on the
 * first comma-separated chunk, lowercased, with the country suffix and
 * parenthetical qualifiers removed.
 */
export function samePlace(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = placeKey(left);
  const b = placeKey(right);
  return a !== "" && a === b;
}

function placeKey(value: string | null | undefined): string {
  if (!value) return "";
  // The chain has to be parenthesised: `a ?? "".replace(...)` binds the
  // `.replace` to the empty string, not to the whole expression.
  const first = (value.split(",")[0] ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(remote|hybrid|onsite|on-site)\b/gi, "")
    .trim()
    .toLowerCase();
  // "UK - London", "US - New York": the country prefix is not part of
  // the place name.
  return first.replace(/^[a-z]{2,3}\s*[-–]\s*/, "");
}
