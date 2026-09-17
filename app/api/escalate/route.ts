import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  ESCALATION_TIERS,
  broadcast,
  buildAlertMessage,
  type NotifyTarget,
} from "@/lib/telegram";
import type { Incident, Priority } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Seconds a report may sit unacknowledged before the next tier is paged. */
const THRESHOLD_SECONDS: Record<Priority, number> = {
  critical: 60,
  urgent: 180,
  normal: 600,
};

const MAX_TIER = 3;

function originFrom(req: Request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : "";
}

/**
 * Sweeps for unacknowledged incidents past their tier threshold and pages the
 * next tier. Idempotent: a tier is only ever notified once, enforced by the
 * escalations table, so repeated calls from several dashboards are harmless.
 */
/**
 * Cron entry point. Vercel Cron issues a GET with an Authorization header, so
 * this simply delegates to the same sweep the dashboard triggers.
 *
 * When CRON_SECRET is set, the header must match — otherwise anyone could
 * hammer the escalation endpoint and spam responders.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  return runSweep(req);
}

export async function POST(req: Request) {
  return runSweep(req);
}

async function runSweep(req: Request) {
  const db = getAdminClient();
  const origin = originFrom(req);

  const { data: rows, error } = await db
    .from("incidents")
    .select("*")
    .in("status", ["reported", "classified"])
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const incidents = (rows ?? []) as Incident[];
  const escalated: {
    incidentId: string;
    tier: number;
    delivered: number;
  }[] = [];

  for (const incident of incidents) {
    if (incident.acknowledged_at) continue;

    const priority = (incident.final_priority ?? "normal") as Priority;
    const threshold = THRESHOLD_SECONDS[priority] ?? 600;
    const ageSeconds =
      (Date.now() - new Date(incident.created_at).getTime()) / 1000;
    if (ageSeconds < threshold) continue;

    // Which tiers have already been paged?
    const { data: existing } = await db
      .from("escalations")
      .select("tier")
      .eq("incident_id", incident.id);

    const highest = (existing ?? []).reduce(
      (max, row) => Math.max(max, (row as { tier: number }).tier),
      0,
    );

    // Each further tier waits another full threshold period.
    const dueTier = Math.min(
      MAX_TIER,
      Math.floor(ageSeconds / threshold) + 1,
    );
    if (dueTier <= highest) continue;

    const nextTier = highest + 1;
    if (nextTier > MAX_TIER) continue;

    const roles = ESCALATION_TIERS[nextTier] ?? ESCALATION_TIERS[MAX_TIER];

    const [{ data: campus }, { data: location }, { data: responders }] =
      await Promise.all([
        incident.campus_id
          ? db.from("campuses").select("name").eq("id", incident.campus_id).maybeSingle()
          : Promise.resolve({ data: null }),
        incident.location_id
          ? db.from("locations").select("label").eq("id", incident.location_id).maybeSingle()
          : Promise.resolve({ data: null }),
        db
          .from("responders")
          .select("name,role,telegram_chat_id")
          .eq("campus_id", incident.campus_id)
          .in("role", roles)
          .eq("on_duty", true),
      ]);

    const targets: NotifyTarget[] = (responders ?? [])
      .filter((r) => (r as { telegram_chat_id?: string }).telegram_chat_id)
      .map((r) => {
        const row = r as { telegram_chat_id: string; name: string; role: string };
        return { chatId: row.telegram_chat_id, label: `${row.name} (${row.role})` };
      });

    const message = buildAlertMessage({
      priority,
      emergencyType: incident.emergency_type,
      campusName: (campus as { name?: string } | null)?.name ?? "Unknown block",
      locationLabel:
        (location as { label?: string } | null)?.label ?? "Unknown location",
      description: incident.description,
      reporter: incident.is_anonymous
        ? "Anonymous"
        : incident.reporter_name || "Unnamed",
      reasoning: incident.ai_reasoning,
      incidentUrl: `${origin}/incident/${incident.id}`,
      tier: nextTier,
      elapsedSeconds: ageSeconds,
    });

    const sends = await broadcast(targets, message);
    const delivered = sends.filter((s) => s.ok).length;

    await db.from("escalations").insert({
      incident_id: incident.id,
      tier: nextTier,
      notified_at: new Date().toISOString(),
    });

    await db.from("incident_events").insert({
      incident_id: incident.id,
      event_type: "escalated",
      actor: "auto-escalation",
      note: `No acknowledgement after ${Math.round(ageSeconds)}s. Paged tier ${nextTier} (${roles.join(", ")}).`,
    });

    escalated.push({ incidentId: incident.id, tier: nextTier, delivered });
  }

  return NextResponse.json({ ok: true, checked: incidents.length, escalated });
}
