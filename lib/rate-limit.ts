import "server-only";

import { getAdminClient } from "./supabase-admin";

/**
 * Shared-state rate limiting.
 *
 * The previous limiter was a module-level Map. On Vercel every request can
 * land on a fresh serverless instance, so that Map was almost always empty and
 * the limit was never reached. This one counts in Postgres, which is the only
 * state all instances actually share.
 *
 * Fails OPEN on error. This is an emergency reporting system: if the limiter
 * itself is broken, letting a report through is far less harmful than blocking
 * someone who needs help.
 */

export interface RateLimitRule {
  /** Namespace, so different endpoints do not share counters. */
  bucket: string;
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Best-effort client identity. Behind Vercel, x-forwarded-for is set by the
 * platform; the leftmost entry is the real client. This is spoofable in
 * principle but is the standard signal available to an edge-hosted app.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const fallback: RateLimitResult = {
    allowed: true,
    count: 0,
    limit: rule.limit,
    retryAfterSeconds: 0,
  };

  try {
    const db = getAdminClient();
    const { data, error } = await db.rpc("bump_rate_limit", {
      p_bucket: rule.bucket,
      p_identifier: identifier.slice(0, 200),
      p_window_seconds: rule.windowSeconds,
    });

    if (error || typeof data !== "number") return fallback;

    return {
      allowed: data <= rule.limit,
      count: data,
      limit: rule.limit,
      retryAfterSeconds: rule.windowSeconds,
    };
  } catch {
    return fallback;
  }
}

/** Standard 429 body + Retry-After, with no internal detail. */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please wait a moment and try again.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}

/**
 * Limits tuned so that a person in a genuine emergency is never blocked, while
 * scripted abuse is. A real reporter files one incident; ten per minute from
 * one address is not a person in trouble.
 */
export const LIMITS = {
  /** Filing an emergency report. Deliberately generous. */
  report: { bucket: "report", limit: 10, windowSeconds: 60 },
  /** Classification is idempotent, but it fans out to Telegram. */
  classify: { bucket: "classify", limit: 20, windowSeconds: 60 },
  /** Escalation and safe-walk sweeps page responders. */
  sweep: { bucket: "sweep", limit: 30, windowSeconds: 60 },
  /** Staff PIN attempts. Tight: this is the brute-force surface. */
  login: { bucket: "login", limit: 8, windowSeconds: 300 },
  /** Magic-link session exchange. */
  sso: { bucket: "sso", limit: 15, windowSeconds: 300 },
  /** Starting or updating a safe walk. */
  safeWalk: { bucket: "safe-walk", limit: 30, windowSeconds: 60 },
  /** Withdrawing a false alarm. */
  cancel: { bucket: "cancel", limit: 20, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;
