import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { isStaff } from "@/lib/staff-auth";
import { badRequest, isUuid, unauthorized } from "@/lib/api";
import type { IncidentContact } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 100;

/**
 * Reporter and responder identity for the incidents the dashboard is
 * currently showing.
 *
 * Migration 0003 revoked SELECT on reporter_name/reporter_phone/*_lat/*_lng
 * from the anon Postgres role, because that data was readable by anyone
 * holding the public anon key. The staff dashboard authenticates through a
 * custom cookie (see lib/staff-auth.ts), not Supabase Auth, so its browser
 * client is still the anon role at the database level - it needs this route
 * to see who to call.
 */
export async function POST(req: Request) {
  if (!isStaff()) return unauthorized("Staff session required.");

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid) : [];
  if (ids.length === 0) return NextResponse.json({ contacts: [] });
  if (ids.length > MAX_IDS) {
    return badRequest(`At most ${MAX_IDS} incidents per request.`);
  }

  const db = getAdminClient();
  const { data, error } = await db
    .from("incidents")
    .select("id, reporter_name, reporter_phone, responder_name")
    .in("id", ids);

  if (error) {
    // Never surface the raw Postgres error to a browser; contact info is not
    // worth risking a schema-detail leak over.
    console.error("[aegis:incident.contacts]", error.message);
    return NextResponse.json({ contacts: [] });
  }

  return NextResponse.json({ contacts: (data ?? []) as IncidentContact[] });
}
