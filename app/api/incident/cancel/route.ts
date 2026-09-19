import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { LIMITS, checkRateLimit, clientKey, rateLimitResponse } from "@/lib/rate-limit";
import { badRequest, conflict, isUuid, notFound, readJson, serverError } from "@/lib/api";
import type { Incident } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How long after reporting a false alarm may still be withdrawn. */
const CANCEL_WINDOW_MS = 120_000;

/**
 * Withdraws a report as a false alarm.
 *
 * There is no account system tying a reporter to their report, so the
 * incident's uuid is the only credential - the same trust model as an
 * unlisted link. This is a deliberate, documented trade-off: the 2-minute
 * window plus the fact that only the reporter's own device holds the id (it
 * is never listed anywhere) makes guessing impractical, but it is not
 * cryptographically unforgeable the way a signed token would be.
 */
export async function POST(req: Request) {
  const limit = await checkRateLimit(LIMITS.cancel, clientKey(req));
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await readJson(req);
  if (!body) return badRequest("Invalid request body.");
  if (!isUuid(body.incidentId)) return badRequest("A valid incident id is required.");
  const incidentId: string = body.incidentId;

  const db = getAdminClient();

  const { data, error } = await db
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();

  if (error || !data) return notFound("Incident not found.");
  const incident = data as Incident;

  if (incident.status === "cancelled") {
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  // Once a responder is on the way, only they may close the incident.
  if (incident.status === "acknowledged" || incident.status === "resolved") {
    return conflict("A responder has already actioned this report.");
  }

  const age = Date.now() - new Date(incident.created_at).getTime();
  if (age > CANCEL_WINDOW_MS) {
    return conflict("The cancellation window has closed. Call security instead.");
  }

  const { error: updateError } = await db
    .from("incidents")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", incidentId);

  if (updateError) {
    return serverError("incident.cancel", updateError, "Could not cancel the report.");
  }

  await db.from("incident_events").insert({
    incident_id: incidentId,
    event_type: "cancelled",
    actor: "reporter",
    note: "Withdrawn by the reporter as a false alarm.",
  });

  return NextResponse.json({ ok: true });
}
