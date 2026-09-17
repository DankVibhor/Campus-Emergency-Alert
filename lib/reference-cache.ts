import type { Campus, CampusLocation } from "./types";

/**
 * Stale-while-revalidate cache for campus reference data.
 *
 * Blocks and floors change maybe once a year, but every visit to /report was
 * waiting on a Supabase round-trip before it could draw the form. Reading the
 * last known list from localStorage lets the form render on the first frame,
 * while a background refresh keeps it correct.
 */

const KEY = "aegis.reference.v1";

export interface ReferenceData {
  campuses: Campus[];
  locations: CampusLocation[];
  cachedAt: string;
}

export function readCache(): ReferenceData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReferenceData;
    if (!Array.isArray(parsed.campuses) || !Array.isArray(parsed.locations)) {
      return null;
    }
    if (parsed.campuses.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache(campuses: Campus[], locations: CampusLocation[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: ReferenceData = {
      campuses,
      locations,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable - the network path still works */
  }
}
