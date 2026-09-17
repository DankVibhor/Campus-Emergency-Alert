import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import type { Incident } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How long after reporting a false alarm may still be withdrawn. */
const CANCEL_WINDOW_MS = 120_000;

export async function POST(req: Request) {
  let incidentId: string;
  try {
    const body = (await req.json()) as { incidentId?: string };
    if (!body.incidentId) {
      return NextResponse.json({ error: "incidentId required" }, { status: 400 });
    }
    incidentId = body.incidentId;
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
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  // Once a responder is on the way, only they may close the incident.
  if (incident.status === "acknowledged" || incident.status === "resolved") {
    return NextResponse.json(
      { error: "A responder has already actioned this report." },
      { status: 409 },
    );
  }

  const age = Date.now() - new Date(incident.created_at).getTime();
  if (age > CANCEL_WINDOW_MS) {
    return NextResponse.json(
      { error: "The cancellation window has closed. Call security instead." },
      { status: 409 },
    );
  }

  const { error: updateError } = await db
    .from("incidents")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", incidentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await db.from("incident_events").insert({
    incident_id: incidentId,
    event_type: "cancelled",
    actor: "reporter",
    note: "Withdrawn by the reporter as a false alarm.",
  });

  return NextResponse.json({ ok: true });
}
