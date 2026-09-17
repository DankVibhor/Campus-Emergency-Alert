import { NextResponse } from "next/server";
import { STAFF_COOKIE, checkPin, issueStaffToken } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-instance throttle. Not a distributed rate limiter, but enough to stop
 * someone standing at the demo table guessing a 9-character PIN.
 */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

function clientKey(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  const key = clientKey(req);
  if (throttled(key)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let pin = "";
  try {
    const body = (await req.json()) as { pin?: string };
    pin = (body.pin ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!pin) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  if (!checkPin(pin)) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  attempts.delete(key);

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
