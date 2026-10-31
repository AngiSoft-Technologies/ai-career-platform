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
