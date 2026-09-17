import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { isStaff } from "@/lib/staff-auth";
import type { Incident } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "acknowledge" | "resolve";

export async function POST(req: Request) {
  if (!isStaff()) {
    return NextResponse.json({ error: "Not signed in as staff." }, { status: 401 });
  }

  let incidentId = "";
  let action: Action = "acknowledge";
  let actor = "responder";

  try {
    const body = (await req.json()) as {
      incidentId?: string;
      action?: Action;
      actor?: string;
    };
    if (!body.incidentId) {
      return NextResponse.json({ error: "incidentId required" }, { status: 400 });
    }
    if (body.action !== "acknowledge" && body.action !== "resolve") {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }
    incidentId = body.incidentId;
    action = body.action;
    actor = (body.actor || "responder").slice(0, 80);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const db = getAdminClient();

  const { data, error } = await db
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }
  const incident = data as Incident;

  if (incident.status === "cancelled") {
    return NextResponse.json(
      { error: "This report was withdrawn by the reporter." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();

  if (action === "acknowledge") {
    if (incident.acknowledged_at) {
      return NextResponse.json({ ok: true, alreadyAcknowledged: true });
    }

    const { error: updateError } = await db
      .from("incidents")
      .update({ status: "acknowledged", acknowledged_at: now })
      .eq("id", incidentId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
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
      note: "Responder acknowledged and is on the way.",
    });

    return NextResponse.json({ ok: true, status: "acknowledged" });
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
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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
