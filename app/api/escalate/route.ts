import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  ESCALATION_TIERS,
  broadcast,
  buildAlertMessage,
  type NotifyTarget,
} from "@/lib/telegram";
import type { Incident, Priority } from "@/lib/types";
import { isStaff } from "@/lib/staff-auth";
import { safeOrigin, serverError, unauthorized } from "@/lib/api";
import { LIMITS, checkRateLimit, clientKey, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Seconds a report may sit unacknowledged before the next tier is paged. */
const THRESHOLD_SECONDS: Record<Priority, number> = {
  critical: 60,
  urgent: 180,
  normal: 600,
};

const MAX_TIER = 3;


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
/**
 * Cron entry point.
 *
 * CRON_SECRET was previously optional: `if (secret)` meant that leaving it
 * unset - which it was, in this deployment, until this audit - disabled the
 * check entirely and left this route open to an unauthenticated GET from
 * anyone on the internet. It now fails closed: no secret configured means no
 * access, not open access.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[aegis:cron] CRON_SECRET is not configured; refusing the request.");
    return unauthorized("Not configured.");
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return unauthorized();
  }
  // A leaked secret should still not allow hammering this endpoint.
  const limit = await checkRateLimit(LIMITS.sweep, clientKey(req));
  if (!limit.allowed) return rateLimitResponse(limit);
  return runSweep(req);
}

/**
 * Browser entry point. Only the responder dashboard calls this, and the
 * dashboard is already behind the staff session, so requiring it here closes
 * the endpoint to the public internet without changing any behaviour. Without
 * this guard anyone could drive the escalation sweep and page wardens at will.
 */
export async function POST(req: Request) {
  if (!isStaff()) return unauthorized("Staff session required.");
  return runSweep(req);
}

async function runSweep(req: Request) {
  const db = getAdminClient();
  const origin = safeOrigin(req);

  const { data: rows, error } = await db
    .from("incidents")
    .select("*")
    .in("status", ["reported", "classified"])
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return serverError("escalate.load", error, "Could not run the escalation sweep.");
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
