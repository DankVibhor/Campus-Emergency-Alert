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
import {
  LIMITS,
  checkRateLimit,
  clientKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { safeOrigin, badRequest, isUuid, notFound, readJson, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same type, same block, inside this window counts as the same emergency. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;


/** True when the call came from our own /api/report, not the public internet. */
function isInternalCall(req: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  return req.headers.get("x-aegis-internal") === secret;
}

export async function POST(req: Request) {
  // Classification is idempotent, but it fans out to Telegram, so an
  // unthrottled endpoint is a way to page responders repeatedly. Calls
  // originating from our own report route skip this, since they were already
  // rate limited at intake.
  if (!isInternalCall(req)) {
    const limit = await checkRateLimit(LIMITS.classify, clientKey(req));
    if (!limit.allowed) return rateLimitResponse(limit);
  }

  const body = await readJson(req);
  if (!body) return badRequest("Invalid request body.");
  if (!isUuid(body.incidentId)) return badRequest("A valid incident id is required.");
  const incidentId: string = body.incidentId;

  const db = getAdminClient();

  const { data: incidentRow, error: loadError } = await db
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();

  if (loadError || !incidentRow) {
    return notFound("Incident not found.");
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
    return serverError("classify.update", updateError, "Could not classify the report.");
  }

  await db.from("incident_events").insert({
    incident_id: incidentId,
    event_type: "classified",
    actor: ai.result ? `ai:${ai.provider}` : "rule-engine",
    note: reasoning,
  });

  // --- Duplicate grouping --------------------------------------------------
  // One fire reported by five students must page responders once, not five
  // times. A report of the same type in the same block within the window is
  // attached to the original instead of raising its own alert.
  const windowStart = new Date(
    new Date(incident.created_at).getTime() - DUPLICATE_WINDOW_MS,
  ).toISOString();

  const { data: priorRows } = await db
    .from("incidents")
    .select("id,created_at,final_priority,duplicate_of")
    .eq("campus_id", incident.campus_id)
    .eq("emergency_type", incident.emergency_type)
    .in("status", ["reported", "classified", "acknowledged"])
    .gte("created_at", windowStart)
    .lt("created_at", incident.created_at)
    .order("created_at", { ascending: true })
    .limit(5);

  // Attach to the original of the group, never to another duplicate.
  const primary = (priorRows ?? []).find(
    (r) => !(r as { duplicate_of: string | null }).duplicate_of,
  ) as { id: string } | undefined;

  if (primary) {
    await db
      .from("incidents")
      .update({ duplicate_of: primary.id })
      .eq("id", incidentId);

    await db.from("incident_events").insert({
      incident_id: incidentId,
      event_type: "duplicate",
      actor: "system",
      note: "Grouped with an existing report of the same emergency. Responders were already alerted.",
    });

    // Tell the original that corroboration arrived - useful signal, no siren.
    await db.from("incident_events").insert({
      incident_id: primary.id,
      event_type: "corroborated",
      actor: "system",
      note: "Another person reported the same emergency.",
    });

    return NextResponse.json({
      ok: true,
      duplicateOf: primary.id,
      finalPriority,
      rulePriority: rule.priority,
      aiPriority,
      reasoning,
      telegramDelivered: 0,
      suppressed: "duplicate report grouped with the original",
    });
  }

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

  const origin = safeOrigin(req);
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
