"use client";

import { useEffect, useState } from "react";
import { Clock, TriangleAlert } from "lucide-react";

/**
 * Self-contained ticking labels.
 *
 * These exist so the once-a-second clock update repaints a single <span>
 * rather than re-rendering the whole dashboard. Hoisting the timer into the
 * parent made every incident card, the SVG map and all filters re-render each
 * second, which is what made scrolling feel rough on a phone.
 */

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatAge(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** "2m 14s" since the given timestamp. */
export function ElapsedSince({
  iso,
  withIcon = true,
  className = "",
}: {
  iso: string;
  withIcon?: boolean;
  className?: string;
}) {
  const now = useNow();
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));

  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {withIcon ? <Clock size={13} aria-hidden="true" /> : null}
      {formatAge(seconds)}
    </span>
  );
}

/** Human phrasing for the reporter's status page. */
export function ReportedAgo({ iso }: { iso: string }) {
  const now = useNow();
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return <>just now</>;
  return <>{formatAge(seconds)} ago</>;
}

/** Counts down to the next escalation tier. */
export function EscalationCountdown({
  createdAt,
  thresholdSeconds,
}: {
  createdAt: string;
  thresholdSeconds: number;
}) {
  const now = useNow();
  const age = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const left = Math.max(0, thresholdSeconds - age);

  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-bold ${
        left === 0 ? "text-red-600" : "text-amber-600"
      }`}
    >
      <TriangleAlert size={13} aria-hidden="true" />
      {left === 0 ? "Escalating to next tier" : `Escalates in ${left}s`}
    </span>
  );
}
