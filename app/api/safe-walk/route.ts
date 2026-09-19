import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { LIMITS, checkRateLimit, clientKey, rateLimitResponse } from "@/lib/rate-limit";
import {
  badRequest,
  isUuid,
  notFound,
  optionalCoords,
  optionalNumber,
  optionalText,
  readJson,
  serverError,
  stripControlChars,
} from "@/lib/api";
import type { SafeWalk } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Safe-walk lifecycle, server-side only.
 *
 * Migration 0003 revoked all anon access to safe_walks: the old policy let
 * any visitor holding the public anon key mark ANY walk "safe" - silencing
 * the one feature whose entire purpose is that silence is the danger signal -
 * and read every active walker's live GPS position.
 *
 * The walk stays anonymous by design (no login for someone walking home
 * alone), so its uuid is the access token: whoever holds it - only the
 * walker's own device, via localStorage - may act on it. That check happens
 * here, not in a PostgREST policy, because the service-role key is the only
 * way to enforce "you may read this walk if you know its id" without also
 * handing out list/read access to every other walk.
 */

const MIN_MINUTES = 5;
const MAX_MINUTES = 60;
const MAX_LABEL = 80;
const MAX_NAME = 120;
const MAX_PHONE = 32;

export async function POST(req: Request) {
  const limit = await checkRateLimit(LIMITS.safeWalk, clientKey(req));
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await readJson(req);
  if (!body) return badRequest("Invalid request body.");

  const minutes = optionalNumber(body.expected_minutes, MIN_MINUTES, MAX_MINUTES);
  if (minutes === null) {
    return badRequest(`Duration must be between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.`);
  }
  if (body.campus_id !== undefined && body.campus_id !== null && !isUuid(body.campus_id)) {
    return badRequest("Invalid block.");
  }

  const coords = optionalCoords(body.last_lat, body.last_lng);
  const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();

  const db = getAdminClient();
  const { data, error } = await db
    .from("safe_walks")
    .insert({
      campus_id: body.campus_id ?? null,
      person_name: (() => {
        const n = optionalText(body.person_name, MAX_NAME);
        return n ? stripControlChars(n) : null;
      })(),
      person_phone: optionalText(body.person_phone, MAX_PHONE),
      from_label: optionalText(body.from_label, MAX_LABEL),
      to_label: optionalText(body.to_label, MAX_LABEL),
      expected_minutes: minutes,
      due_at: dueAt,
      last_lat: coords?.lat ?? null,
      last_lng: coords?.lng ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return serverError("safe-walk.create", error, "Could not start the walk.");
  }

  return NextResponse.json({ walk: data as SafeWalk });
}

/** GET /api/safe-walk?id=<uuid> - the walker's device polling its own walk. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return badRequest("A valid walk id is required.");

  const db = getAdminClient();
  const { data, error } = await db.from("safe_walks").select("*").eq("id", id).maybeSingle();

  if (error) return serverError("safe-walk.get", error, "Could not load the walk.");
  if (!data) return notFound("Walk not found.");

  return NextResponse.json({ walk: data as SafeWalk });
}

const FINISH_STATUSES = ["safe", "cancelled"] as const;

/**
 * Check in, cancel, or push a position update. All three require the walk id
 * as a bearer token in the body - proof of possession, since there is no
 * account to check a session against.
 */
export async function PATCH(req: Request) {
  const limit = await checkRateLimit(LIMITS.safeWalk, clientKey(req));
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await readJson(req);
  if (!body) return badRequest("Invalid request body.");
  if (!isUuid(body.id)) return badRequest("A valid walk id is required.");

  const db = getAdminClient();
  const { data: existing, error: loadError } = await db
    .from("safe_walks")
    .select("id, status")
    .eq("id", body.id)
    .maybeSingle();

  if (loadError || !existing) return notFound("Walk not found.");

  const walk = existing as { id: string; status: string };

  // A finished or already-escalated walk cannot be reopened. In particular,
  // this stops an attacker who merely observed an id from ever setting it to
  // "safe" after it has already been escalated to an incident.
  if (walk.status !== "walking") {
    return badRequest("This walk has already ended.");
  }

  const patch: Record<string, unknown> = {};

  const status = optionalText(body.status, 20);
  if (status) {
    if (!FINISH_STATUSES.includes(status as (typeof FINISH_STATUSES)[number])) {
      return badRequest("Invalid status.");
    }
    patch.status = status;
    patch.checked_in_at = new Date().toISOString();
  }

  const coords = optionalCoords(body.last_lat, body.last_lng);
  if (coords) {
    patch.last_lat = coords.lat;
    patch.last_lng = coords.lng;
  }

  if (Object.keys(patch).length === 0) {
    return badRequest("Nothing to update.");
  }

  const { data, error } = await db
    .from("safe_walks")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error || !data) {
    return serverError("safe-walk.update", error, "Could not update the walk.");
  }

  return NextResponse.json({ walk: data as SafeWalk });
}
