import { NextResponse } from "next/server";
import { STAFF_COOKIE, checkPin, issueStaffToken } from "@/lib/staff-auth";
import { LIMITS, checkRateLimit, clientKey, rateLimitResponse } from "@/lib/rate-limit";
import { badRequest, readJson, unauthorized } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff PIN sign-in.
 *
 * The previous throttle was a module-level Map, which is per-instance: on
 * Vercel a fresh serverless instance has an empty Map, so an attacker
 * distributing guesses across invocations (which happens automatically under
 * concurrent load) was barely throttled at all against the one credential
 * this app protects with a PIN rather than a password. checkRateLimit counts
 * in Postgres, which every instance shares.
 */
export async function POST(req: Request) {
  const key = clientKey(req);
  const limit = await checkRateLimit(LIMITS.login, key);
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await readJson(req);
  if (!body) return badRequest("Invalid request body.");

  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!pin) return badRequest("PIN required.");
  if (pin.length > 64) return badRequest("PIN required.");

  if (!checkPin(pin)) return unauthorized("Incorrect PIN.");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE, issueStaffToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
