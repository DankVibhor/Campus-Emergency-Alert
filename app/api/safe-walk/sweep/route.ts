import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  ESCALATION_TIERS,
  broadcast,
  buildAlertMessage,
  type NotifyTarget,
} from "@/lib/telegram";
import type { SafeWalk } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originFrom(req: Request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : "";
}

/**
 * Turns a missed check-in into a real incident.
 *
 * A student walking back to the hostel starts a timer. If they do not check in
 * by the deadline, that silence is itself the alarm: we raise a critical
 * security incident at their last known position and page responders.
 */
async function sweep(req: Request) {
  const db = getAdminClient();
  const origin = originFrom(req);
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("safe_walks")
    .select("*")
    .eq("status", "walking")
    .lt("due_at", now)
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const walks = (data ?? []) as SafeWalk[];
  const raised: string[] = [];

  for (const walk of walks) {
    const description = [
      `Safe-walk check-in missed.`,
      walk.person_name ? `Walker: ${walk.person_name}.` : null,
      walk.from_label && walk.to_label
        ? `Route: ${walk.from_label} to ${walk.to_label}.`
        : null,
      `Expected to arrive within ${walk.expected_minutes} minutes.`,
    ]
      .filter(Boolean)
      .join(" ");

    // Raised pre-classified: a missed check-in is critical by definition, so
    // it must not wait on the classifier or an AI call.
    const { data: incidentRow } = await db
      .from("incidents")
      .insert({
        campus_id: walk.campus_id,
        emergency_type: "security",
        description,
        is_anonymous: !walk.person_name,
        reporter_name: walk.person_name,
        reporter_phone: walk.person_phone,
        reporter_lat: walk.last_lat,
        reporter_lng: walk.last_lng,
        status: "classified",
        rule_priority: "critical",
        final_priority: "critical",
        ai_reasoning:
          "Safe-walk timer expired without a check-in. Treated as critical until the walker is confirmed safe.",
        classified_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const incidentId = (incidentRow as { id: string } | null)?.id ?? null;

    await db
      .from("safe_walks")
      .update({ status: "escalated", incident_id: incidentId })
      .eq("id", walk.id);

    if (!incidentId) continue;
    raised.push(incidentId);

    await db.from("incident_events").insert({
      incident_id: incidentId,
      event_type: "safe_walk_missed",
      actor: "safe-walk",
      note: `No check-in by the deadline. Walk started ${new Date(walk.started_at).toLocaleTimeString()}.`,
    });

    const { data: campus } = walk.campus_id
      ? await db.from("campuses").select("name").eq("id", walk.campus_id).maybeSingle()
      : { data: null };

    const { data: responders } = await db
      .from("responders")
      .select("name,role,telegram_chat_id")
      .eq("campus_id", walk.campus_id)
      .in("role", ESCALATION_TIERS[1])
      .eq("on_duty", true);

    const targets: NotifyTarget[] = (responders ?? [])
      .filter((r) => (r as { telegram_chat_id?: string }).telegram_chat_id)
      .map((r) => {
        const row = r as { telegram_chat_id: string; name: string; role: string };
        return { chatId: row.telegram_chat_id, label: `${row.name} (${row.role})` };
      });

    await broadcast(
      targets,
      buildAlertMessage({
        priority: "critical",
        emergencyType: "safe-walk missed",
        campusName: (campus as { name?: string } | null)?.name ?? "ASMT campus",
        locationLabel: walk.to_label
          ? `en route to ${walk.to_label}`
          : "unknown location",
        description,
        reporter: walk.person_name || "Anonymous walker",
        reasoning: "Walker did not confirm arrival before the timer expired.",
        incidentUrl: `${origin}/incident/${incidentId}`,
        tier: 1,
      }),
    );

    await db.from("escalations").insert({
      incident_id: incidentId,
      tier: 1,
      notified_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, checked: walks.length, raised });
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  return sweep(req);
}

export async function POST(req: Request) {
  return sweep(req);
}
