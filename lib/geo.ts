/** Great-circle distance in metres. */
export function haversineMetres(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Brisk walking pace. Responders cross a campus on foot, and a straight line
 * understates the real route, so the multiplier below pads for corridors,
 * stairs and doors rather than pretending the path is direct.
 */
const WALK_METRES_PER_SECOND = 1.5;
const ROUTE_FACTOR = 1.35;

export function etaSeconds(distanceMetres: number): number {
  return Math.max(
    15,
    Math.round((distanceMetres * ROUTE_FACTOR) / WALK_METRES_PER_SECOND),
  );
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `${m} min`;
}
