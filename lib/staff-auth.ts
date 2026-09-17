import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Lightweight staff session for the responder dashboard.
 *
 * Two ways in:
 *  1. Supabase magic link (a real authenticated user), or
 *  2. a shared staff PIN, which issues the HMAC cookie below.
 *
 * The PIN path exists because Supabase's built-in auth mail is rate limited,
 * and a dashboard that cannot be opened during an emergency is worthless.
 */

export const STAFF_COOKIE = "aegis_staff";
const SESSION_HOURS = 12;

function secret() {
  // Any server-only secret works as the signing key; the service role key is
  // already required for this app to function at all.
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.STAFF_PIN ||
    "aegis-dev-secret"
  );
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Cookie value: "<expiryMs>.<hmac>" */
export function issueStaffToken(): string {
  const expiry = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  return `${expiry}.${sign(String(expiry))}`;
}

export function verifyStaffToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expiryRaw, mac] = token.split(".");
  if (!expiryRaw || !mac) return false;

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  const expected = sign(expiryRaw);
  try {
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Constant-time PIN comparison. */
export function checkPin(submitted: string): boolean {
  const expected = process.env.STAFF_PIN;
  if (!expected) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Server-side guard for routes and pages. */
export function isStaff(): boolean {
  return verifyStaffToken(cookies().get(STAFF_COOKIE)?.value);
}
