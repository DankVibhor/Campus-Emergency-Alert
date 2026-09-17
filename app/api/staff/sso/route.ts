import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { STAFF_COOKIE, issueStaffToken } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchanges a Supabase magic-link session for the staff cookie the server
 * guard understands. The access token is verified against Supabase rather
 * than trusted, so a forged token cannot mint a staff session.
 */
export async function POST(req: Request) {
  let accessToken = "";
  try {
    const body = (await req.json()) as { accessToken?: string };
    accessToken = body.accessToken ?? "";
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "accessToken required" }, { status: 400 });
  }

  const db = getAdminClient();
  const { data, error } = await db.auth.getUser(accessToken);

  if (error || !data?.user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
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
