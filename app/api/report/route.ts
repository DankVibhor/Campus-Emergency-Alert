import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  LIMITS,
  checkRateLimit,
  clientKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  badRequest,
  isUuid,
  optionalCoords,
  optionalText,
  oneOf,
  readJson,
  serverError,
  stripControlChars,
} from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  "medical",
  "fire",
  "security",
  "accident",
  "harassment",
  "other",
] as const;

const MAX_DESCRIPTION = 500;
const MAX_NAME = 120;
const MAX_PHONE = 32;

/**
 * Server-side report intake, used by the offline queue when it replays a
 * report that was filed with no network.
 *
 * Stays open to anonymous callers on purpose - requiring a login to report an
 * emergency would defeat the product. Abuse is controlled by rate limiting and
 * strict validation rather than by authentication.
 */
export async function POST(req: Request) {
  // Generous enough that nobody in a real emergency is ever blocked, tight
  // enough that a script cannot flood responders' phones.
  const limit = await checkRateLimit(LIMITS.report, clientKey(req));
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await readJson(req);
  if (!body) return badRequest("Invalid request body.");

  const emergencyType = oneOf(body.emergency_type, ALLOWED_TYPES);
  if (!emergencyType) return badRequest("Unknown emergency type.");

  if (!isUuid(body.campus_id)) return badRequest("A valid block is required.");
  if (body.location_id !== undefined && body.location_id !== null && !isUuid(body.location_id)) {
    return badRequest("Invalid location.");
  }

  const isAnonymous = body.is_anonymous === true;
  const rawDescription = optionalText(body.description, MAX_DESCRIPTION);
  const description = rawDescription ? stripControlChars(rawDescription) : null;
  const reporterCoords = optionalCoords(body.reporter_lat, body.reporter_lng);

  // A photo URL must point at our own Supabase storage bucket. Accepting an
  // arbitrary URL here would let a reporter place any link in front of a
  // responder, and would make the dashboard fetch from a host we do not
  // control.
  let photoUrl: string | null = null;
  const rawPhoto = optionalText(body.photo_url, 500);
  if (rawPhoto) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const expectedPrefix = `${base.replace(/\/$/, "")}/storage/v1/object/public/incident-photos/`;
    if (!rawPhoto.startsWith(expectedPrefix)) {
      return badRequest("Invalid photo reference.");
    }
    photoUrl = rawPhoto;
  }

  const db = getAdminClient();

  const { data, error } = await db
    .from("incidents")
    .insert({
      campus_id: body.campus_id,
      location_id: body.location_id ?? null,
      emergency_type: emergencyType,
      description,
      is_anonymous: isAnonymous,
      reporter_name: isAnonymous ? null : optionalText(body.reporter_name, MAX_NAME),
      reporter_phone: isAnonymous ? null : optionalText(body.reporter_phone, MAX_PHONE),
      reporter_lat: reporterCoords?.lat ?? null,
      reporter_lng: reporterCoords?.lng ?? null,
      photo_url: photoUrl,
      status: "reported",
    })
    .select("id")
    .single();

  if (error || !data) {
    return serverError(
      "report.insert",
      error,
      "Could not file the report. Please use the Call Security button.",
    );
  }

  // A replayed report was already delayed; record that on the timeline.
  const queuedAt = optionalText(body.queued_at, 40);
  if (queuedAt) {
    await db.from("incident_events").insert({
      incident_id: data.id,
      event_type: "queued",
      actor: "offline-queue",
      note: "Reported while offline and delivered when the network returned.",
    });
  }

  // Must be awaited: a serverless invocation is frozen the moment it responds,
  // so a fire-and-forget fetch here would never actually run.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${req.headers.get("x-forwarded-proto") ?? "https"}://${
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
    }`;

  try {
    await fetch(`${origin.replace(/\/$/, "")}/api/classify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Lets /api/classify recognise an internal call and skip its own limit.
        "x-aegis-internal": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ incidentId: data.id }),
    });
  } catch (err) {
    // The dashboard still shows the unclassified report, so this is not fatal.
    console.error("[aegis:report.classify]", err);
  }

  return NextResponse.json({ ok: true, id: data.id });
}
