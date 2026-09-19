import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { isStaff } from "@/lib/staff-auth";
import {
  etaSeconds,
  formatDistance,
  formatEta,
  haversineMetres,
} from "@/lib/geo";
import {
  badRequest,
  conflict,
  isUuid,
  notFound,
  optionalCoords,
  optionalText,
  oneOf,
  readJson,
  serverError,
  stripControlChars,
  unauthorized,
} from "@/lib/api";
import type { Incident } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["acknowledge", "resolve"] as const;

export async function POST(req: Request) {
  if (!isStaff()) return unauthorized("Not signed in as staff.");

  const body = await readJson(req);
  if (!body) return badRequest("Invalid request body.");

  if (!isUuid(body.incidentId)) return badRequest("A valid incident id is required.");
  const incidentId: string = body.incidentId;

  const action = oneOf(body.action, ACTIONS);
  if (!action) return badRequest("Invalid action.");

  const actorRaw = optionalText(body.actor, 80) ?? "responder";
  const actor = stripControlChars(actorRaw);
  const coords = optionalCoords(body.lat, body.lng);
  const responderLat = coords?.lat ?? null;
  const responderLng = coords?.lng ?? null;

  const db = getAdminClient();

  const { data, error } = await db
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();

  if (error || !data) return notFound("Incident not found.");
  const incident = data as Incident;

  if (incident.status === "cancelled") {
    return conflict("This report was withdrawn by the reporter.");
  }

  const now = new Date().toISOString();

  if (action === "acknowledge") {
    if (incident.acknowledged_at) {
      return NextResponse.json({ ok: true, alreadyAcknowledged: true });
    }

    // Work out how far away the responder is, so the reporter sees a real ETA
    // instead of an unbounded "on the way".
    let eta: number | null = null;
    let distance: number | null = null;

    if (responderLat !== null && responderLng !== null && incident.location_id) {
      const { data: loc } = await db
        .from("locations")
        .select("lat,lng")
        .eq("id", incident.location_id)
        .maybeSingle();
      const target = loc as { lat: number | null; lng: number | null } | null;

      // Prefer the reporter's own fix; fall back to the location's coordinates.
      const destLat = incident.reporter_lat ?? target?.lat ?? null;
      const destLng = incident.reporter_lng ?? target?.lng ?? null;

      if (destLat !== null && destLng !== null) {
        distance = haversineMetres(responderLat, responderLng, destLat, destLng);
        eta = etaSeconds(distance);
      }
    }

    const { error: updateError } = await db
      .from("incidents")
      .update({
        status: "acknowledged",
        acknowledged_at: now,
        on_my_way_at: now,
        responder_name: actor,
        responder_lat: responderLat,
        responder_lng: responderLng,
        responder_eta_seconds: eta,
      })
      .eq("id", incidentId);

    if (updateError) {
      return serverError("incident.acknowledge", updateError, "Could not acknowledge the report.");
    }

    // Stops the escalation timer for every tier already paged.
    await db
      .from("escalations")
      .update({ acknowledged: true })
      .eq("incident_id", incidentId);

    await db.from("incident_events").insert({
      incident_id: incidentId,
      event_type: "acknowledged",
      actor,
      note:
        eta !== null && distance !== null
          ? `Responder is on the way — about ${formatDistance(distance)} away, roughly ${formatEta(eta)}.`
          : "Responder acknowledged and is on the way.",
    });

    return NextResponse.json({
      ok: true,
      status: "acknowledged",
      etaSeconds: eta,
      distanceMetres: distance,
    });
  }

  // resolve
  if (incident.status === "resolved") {
    return NextResponse.json({ ok: true, alreadyResolved: true });
  }

  const { error: updateError } = await db
    .from("incidents")
    .update({
      status: "resolved",
      resolved_at: now,
      // A resolve without an ack still records when it was actioned.
      acknowledged_at: incident.acknowledged_at ?? now,
    })
    .eq("id", incidentId);

  if (updateError) {
    return serverError("incident.resolve", updateError, "Could not resolve the report.");
  }

  await db
    .from("escalations")
    .update({ acknowledged: true })
    .eq("incident_id", incidentId);

  await db.from("incident_events").insert({
    incident_id: incidentId,
    event_type: "resolved",
    actor,
    note: "Incident marked resolved.",
  });

  return NextResponse.json({ ok: true, status: "resolved" });
}
