import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  "medical",
  "fire",
  "security",
  "accident",
  "harassment",
  "other",
];

/**
 * Server-side report intake. The online path inserts straight from the browser
 * under RLS; this route exists for the offline queue, which replays reports
 * once connectivity returns and needs classification kicked off server-side.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const emergencyType = String(body.emergency_type ?? "").toLowerCase();
  if (!ALLOWED_TYPES.includes(emergencyType)) {
    return NextResponse.json({ error: "unknown emergency_type" }, { status: 400 });
  }
  if (!body.campus_id) {
    return NextResponse.json({ error: "campus_id required" }, { status: 400 });
  }

  const db = getAdminClient();

  const isAnonymous = Boolean(body.is_anonymous);
  const description =
    typeof body.description === "string" ? body.description.slice(0, 500) : null;

  const { data, error } = await db
    .from("incidents")
    .insert({
      campus_id: body.campus_id,
      location_id: body.location_id ?? null,
      emergency_type: emergencyType,
      description,
      is_anonymous: isAnonymous,
      reporter_name: isAnonymous ? null : (body.reporter_name as string) ?? null,
      reporter_phone: isAnonymous ? null : (body.reporter_phone as string) ?? null,
      reporter_lat: body.reporter_lat ?? null,
      reporter_lng: body.reporter_lng ?? null,
      status: "reported",
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  // A replayed report was already delayed; note that on the timeline.
  if (body.queued_at) {
    await db.from("incident_events").insert({
      incident_id: data.id,
      event_type: "queued",
      actor: "offline-queue",
      note: `Reported offline at ${String(body.queued_at)} and delivered when the network returned.`,
    });
  }

  // Classify inline so an offline report is prioritised the moment it lands.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${req.headers.get("x-forwarded-proto") ?? "https"}://${
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
    }`;

  // Must be awaited: a serverless invocation is frozen the moment it responds,
  // so a fire-and-forget fetch here would never actually run.
  try {
    await fetch(`${origin.replace(/\/$/, "")}/api/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: data.id }),
    });
  } catch {
    /* the dashboard still shows the unclassified report */
  }

  return NextResponse.json({ ok: true, id: data.id });
}
