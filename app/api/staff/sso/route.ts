import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { STAFF_COOKIE, issueStaffToken } from "@/lib/staff-auth";
import { isAuthorizedStaffEmail, staffEmailControlsConfigured } from "@/lib/staff-allowlist";
import { LIMITS, checkRateLimit, clientKey, rateLimitResponse } from "@/lib/rate-limit";
import { badRequest, readJson, unauthorized } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchanges a Supabase magic-link session for the staff cookie the server
 * guard understands.
 *
 * Two checks, and both matter:
 *  1. The access token is verified against Supabase, not trusted from the
 *     client - a forged token cannot mint a session.
 *  2. The verified email must be on the staff allow-list. Step 1 alone only
 *     proves the caller completed sign-in as *some* Supabase user; Supabase
 *     magic-link sign-up is open by default, so without this check anyone
 *     could type their own address into the sign-in form and receive full
 *     staff access. See lib/staff-allowlist.ts.
 */
export async function POST(req: Request) {
  const limit = await checkRateLimit(LIMITS.sso, clientKey(req));
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await readJson(req);
  if (!body) return badRequest("Invalid request body.");

  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  if (!accessToken) return badRequest("accessToken required.");

  const db = getAdminClient();
  const { data, error } = await db.auth.getUser(accessToken);

  if (error || !data?.user) return unauthorized("Invalid session.");

  if (!staffEmailControlsConfigured()) {
    console.error(
      "[aegis:staff.sso] STAFF_EMAIL_DOMAIN/STAFF_EMAIL_ALLOWLIST not set - " +
        "magic-link sign-in is disabled until one is configured. The staff PIN still works.",
    );
    return unauthorized(
      "Magic-link sign-in is not configured for this deployment. Use the staff PIN.",
    );
  }

  if (!isAuthorizedStaffEmail(data.user.email)) {
    return unauthorized("This email is not authorised for staff access.");
  }

  const res = NextResponse.json({ ok: true, email: data.user.email });
  res.cookies.set(STAFF_COOKIE, issueStaffToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return res;
}
