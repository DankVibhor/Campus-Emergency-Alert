import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { runAiClassifier, runRuleEngine } from "@/lib/classify";
import {
  ESCALATION_TIERS,
  broadcast,
  buildAlertMessage,
  type NotifyTarget,
} from "@/lib/telegram";
import { maxPriority, type Incident, type Priority } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originFrom(req: Request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : "";
}

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

  const { data: incidentRow, error: loadError } = await db
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();

  if (loadError || !incidentRow) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }
  const incident = incidentRow as Incident;

  // Classifying twice would re-page responders for the same emergency.
  if (incident.classified_at) {
    return NextResponse.json({
      ok: true,
      alreadyClassified: true,
      finalPriority: incident.final_priority,
    });
  }
  if (incident.status === "cancelled") {
    return NextResponse.json({ ok: true, cancelled: true });
  }

  const [{ data: campus }, { data: location }] = await Promise.all([
    incident.campus_id
      ? db.from("campuses").select("*").eq("id", incident.campus_id).maybeSingle()
      : Promise.resolve({ data: null }),
    incident.location_id
      ? db.from("locations").select("*").eq("id", incident.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const campusName = (campus as { name?: string } | null)?.name ?? "Unknown block";
  const locationLabel =
    (location as { label?: string } | null)?.label ?? "Unknown location";

  // --- Stage 1: deterministic rules (always succeeds) ---------------------
  const rule = runRuleEngine(incident.emergency_type, incident.description);

  // --- Stage 2: AI second opinion (best effort) ---------------------------
  const ai = await runAiClassifier({
    emergencyType: incident.emergency_type,
    description: incident.description,
    locationLabel,
    campusName,
    reportedAt: incident.created_at,
  });

  const aiPriority: Priority | null = ai.result?.priority ?? null;
  const finalPriority = maxPriority(aiPriority, rule.priority);

  const reasoning =
    ai.result?.reasoning ??
    (rule.matched.length
      ? `Rule engine matched: ${rule.matched.slice(0, 4).join(", ")}.`
      : "No critical keywords detected; classified by emergency type.");

  const classifiedAt = new Date().toISOString();

  const { error: updateError } = await db
    .from("incidents")
    .update({
      rule_priority: rule.priority,
      ai_priority: aiPriority,
      final_priority: finalPriority,
      ai_reasoning: reasoning,
      classified_at: classifiedAt,
      status: incident.status === "reported" ? "classified" : incident.status,
    })
    .eq("id", incidentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await db.from("incident_events").insert({
    incident_id: incidentId,
    event_type: "classified",
    actor: ai.result ? `ai:${ai.provider}` : "rule-engine",
    note: reasoning,
  });

  // --- Notify tier 1 -------------------------------------------------------
  const roles = ESCALATION_TIERS[1];
  const { data: responders } = await db
    .from("responders")
    .select("id,name,role,telegram_chat_id")
    .eq("campus_id", incident.campus_id)
    .in("role", roles)
    .eq("on_duty", true);

  const targets: NotifyTarget[] = (responders ?? [])
    .filter((r) => (r as { telegram_chat_id?: string }).telegram_chat_id)
    .map((r) => {
      const row = r as { telegram_chat_id: string; name: string; role: string };
      return { chatId: row.telegram_chat_id, label: `${row.name} (${row.role})` };
    });

  const origin = originFrom(req);
  const message = buildAlertMessage({
    priority: finalPriority,
    emergencyType: incident.emergency_type,
    campusName,
    locationLabel,
    description: incident.description,
    reporter: incident.is_anonymous
      ? "Anonymous"
      : `${incident.reporter_name || "Unnamed"}${
          incident.reporter_phone ? ` (${incident.reporter_phone})` : ""
        }`,
    reasoning: ai.result ? reasoning : null,
    incidentUrl: `${origin}/incident/${incidentId}`,
    tier: 1,
  });

  const sends = await broadcast(targets, message);
  const delivered = sends.filter((s) => s.ok).length;

  await db.from("incident_events").insert({
    incident_id: incidentId,
    event_type: "notified",
    actor: "telegram",
    note:
      delivered > 0
        ? `Alert delivered to ${delivered} channel${delivered === 1 ? "" : "s"}.`
        : `Telegram not delivered: ${sends[0]?.error ?? "no recipients"}.`,
  });

  await db.from("escalations").insert({
    incident_id: incidentId,
    tier: 1,
    notified_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    rulePriority: rule.priority,
    ruleMatched: rule.matched,
    aiPriority,
    aiError: ai.error,
    aiProvider: ai.provider,
    finalPriority,
    reasoning,
    telegramDelivered: delivered,
    telegramErrors: sends.filter((s) => !s.ok).map((s) => s.error),
  });
}
