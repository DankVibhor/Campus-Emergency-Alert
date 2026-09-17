"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import CriticalWatch from "@/components/critical-watch";

/**
 * Mounts the station-wide alert watcher only for signed-in staff.
 *
 * Re-checks on navigation so the watcher starts as soon as a responder signs
 * in, and stops when they sign out, without a full reload.
 */
export default function StaffAlerts() {
  const pathname = usePathname();
  const [staff, setStaff] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/staff/me", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { staff?: boolean };
        if (!cancelled) setStaff(Boolean(body.staff));
      } catch {
        /* not signed in, or offline - no alerts either way */
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!staff) return null;
  return <CriticalWatch />;
}
