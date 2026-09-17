import { NextResponse } from "next/server";
import { isStaff } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the client whether this browser holds a staff session.
 *
 * Exists so the global alert watcher can mount conditionally without the root
 * layout reading cookies — which would force every page, including the static
 * report form, to be server-rendered on demand.
 */
export async function GET() {
  return NextResponse.json(
    { staff: isStaff() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
