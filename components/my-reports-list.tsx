"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { useLiveSync } from "@/lib/use-live-sync";
import { listReports, type MyReport } from "@/lib/my-reports";
import {
  INCIDENT_PUBLIC_COLUMNS,
  PRIORITY_STYLES,
  STATUS_LABELS,
  type Incident,
  type Priority,
} from "@/lib/types";

export default function MyReportsList() {
  const [saved, setSaved] = useState<MyReport[] | null>(null);
  const [incidents, setIncidents] = useState<Record<string, Incident>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setIncidents({});
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("incidents").select(INCIDENT_PUBLIC_COLUMNS).in("id", ids);
    const map: Record<string, Incident> = {};
    for (const row of (data ?? []) as unknown as Incident[]) map[row.id] = row;
    setIncidents(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    // localStorage is only readable on the client, so this runs post-mount.
    const mine = listReports();
    setSaved(mine);
    void refresh(mine.map((r) => r.id));
  }, [refresh]);

  // Keep statuses fresh while the tab is open, without needing a reload.
  const savedIds = useMemo(() => (saved ?? []).map((r) => r.id), [saved]);
  const savedIdsRef = useRef<string[]>([]);
  savedIdsRef.current = savedIds;

  useLiveSync(
    "my-reports",
    (channel) =>
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "incidents" },
        (payload) => {
          const row = payload.new as Incident;
          if (!savedIdsRef.current.includes(row.id)) return;
          setIncidents((prev) => ({ ...prev, [row.id]: row }));
        },
      ),
    () => {
      if (savedIdsRef.current.length > 0) void refresh(savedIdsRef.current);
    },
    { pollMs: 10_000 },
  );

  if (loading || saved === null) return <ListSkeleton />;

  if (saved.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 px-5 py-10 text-center">
        <Inbox size={32} className="mx-auto text-slate-300" aria-hidden="true" />
        <p className="mt-2 text-base font-bold text-slate-900">No reports yet</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Reports you file from this phone appear here so you can follow them.
        </p>
        <Link
          href="/report"
          className="press tap mt-4 inline-flex items-center justify-center rounded-2xl bg-red-600 px-6 py-3 font-bold text-white"
        >
          Report an emergency
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {saved.map((entry) => {
        const incident = incidents[entry.id];
        const priority = (incident?.final_priority ?? null) as Priority | null;
        const style = priority ? PRIORITY_STYLES[priority] : null;

        return (
          <li key={entry.id}>
            <Link
              href={`/incident/${entry.id}`}
              className="press flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-4"
            >
              <span
                className={`h-3 w-3 shrink-0 rounded-full ${
                  style ? style.dot : "bg-slate-300"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold capitalize text-slate-900">
                  {incident?.emergency_type ?? entry.emergencyType}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {incident
                    ? STATUS_LABELS[incident.status]
                    : "Not found on the server"}
                  {" · "}
                  {formatWhen(incident?.created_at ?? entry.createdAt)}
                </span>
              </span>
              {style ? (
                <span
                  className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold leading-none ${style.badge}`}
                >
                  {style.label}
                </span>
              ) : null}
              <ChevronRight
                size={18}
                className="shrink-0 text-slate-300"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function ListSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}
