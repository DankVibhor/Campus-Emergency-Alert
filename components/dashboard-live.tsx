"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, BellOff, Check, CircleCheckBig, MapPin } from "lucide-react";
import { ElapsedSince, EscalationCountdown } from "@/components/live-time";
import { supabase } from "@/lib/supabase-browser";
import { useLiveSync } from "@/lib/use-live-sync";
import * as alarm from "@/lib/alarm";
import {
  PRIORITY_STYLES,
  STATUS_LABELS,
  type Campus,
  type CampusLocation,
  type Incident,
  type Priority,
} from "@/lib/types";
import CampusMap from "@/components/campus-map";

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  urgent: 1,
  normal: 2,
};

/** Seconds before an unacknowledged incident escalates, by priority. */
const ESCALATE_AFTER: Record<Priority, number> = {
  critical: 60,
  urgent: 180,
  normal: 600,
};

const ACTIVE_STATUSES = ["reported", "classified", "acknowledged"];

const ALARM_PREF_KEY = "aegis.alarm";

function rememberAlarmPref(on: boolean) {
  try {
    window.localStorage.setItem(ALARM_PREF_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable - the toggle still works for this session */
  }
}

export default function DashboardLive() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [soundOn, setSoundOn] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // No global ticker here on purpose: the clock labels own their own timers
  // (see components/live-time.tsx) so a second passing repaints one span
  // instead of re-rendering every card and the SVG map.

  // ---- loading + live sync ------------------------------------------------
  const load = useCallback(async () => {
    const [incidentRes, campusRes, locationRes] = await Promise.all([
      supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("campuses").select("*").order("name"),
      supabase.from("locations").select("*"),
    ]);

    if (incidentRes.data) setIncidents(incidentRes.data as Incident[]);
    if (campusRes.data) setCampuses(campusRes.data as Campus[]);
    if (locationRes.data) setLocations(locationRes.data as CampusLocation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates, plus a resync on (re)connect and a polling fallback, so the
  // board is never stale even if the websocket is slow or blocked.
  useLiveSync(
    "dashboard:incidents",
    (channel) =>
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "incidents" },
          (payload) => {
            const row = payload.new as Incident;
            setIncidents((prev) =>
              prev.some((i) => i.id === row.id) ? prev : [row, ...prev],
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "incidents" },
          (payload) => {
            const row = payload.new as Incident;
            setIncidents((prev) => prev.map((i) => (i.id === row.id ? row : i)));
          },
        ),
    load,
    { pollMs: 10_000 },
  );

  // ---- escalation sweep ---------------------------------------------------
  // The dashboard drives escalation so the demo needs no external cron.
  useEffect(() => {
    let stopped = false;

    async function sweep() {
      if (stopped) return;
      try {
        await fetch("/api/escalate", { method: "POST" });
      } catch {
        /* a failed sweep retries on the next interval */
      }
    }

    void sweep();
    const id = window.setInterval(sweep, 15_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  const campusName = useCallback(
    (id: string | null) => campuses.find((c) => c.id === id)?.name ?? "Unknown block",
    [campuses],
  );
  const locationLabel = useCallback(
    (id: string | null) => locations.find((l) => l.id === id)?.label ?? "",
    [locations],
  );

  // ---- filtering + sorting ------------------------------------------------
  const visible = useMemo(() => {
    const filtered = incidents.filter((i) => {
      if (campusFilter !== "all" && i.campus_id !== campusFilter) return false;
      if (statusFilter === "active") return ACTIVE_STATUSES.includes(i.status);
      if (statusFilter === "all") return true;
      return i.status === statusFilter;
    });

    return filtered.sort((a, b) => {
      const pa = PRIORITY_ORDER[(a.final_priority ?? "normal") as Priority];
      const pb = PRIORITY_ORDER[(b.final_priority ?? "normal") as Priority];
      if (pa !== pb) return pa - pb;
      // Within a priority, the longest-waiting incident comes first.
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [incidents, campusFilter, statusFilter]);

  const criticalUnacked = useMemo(
    () =>
      incidents.filter(
        (i) =>
          i.final_priority === "critical" &&
          !i.acknowledged_at &&
          ACTIVE_STATUSES.includes(i.status),
      ),
    [incidents],
  );

  // ---- overdue detection --------------------------------------------------
  // Anything unacknowledged past its escalation deadline is "overdue" and
  // must make noise, whatever its priority: nobody has responded in time.
  const activeUnacked = useMemo(
    () =>
      incidents.filter(
        (i) => !i.acknowledged_at && ACTIVE_STATUSES.includes(i.status),
      ),
    [incidents],
  );

  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    function check() {
      const n = activeUnacked.filter((i) => {
        const priority = (i.final_priority ?? "normal") as Priority;
        const age = (Date.now() - new Date(i.created_at).getTime()) / 1000;
        return age >= ESCALATE_AFTER[priority];
      }).length;
      // React bails out when the value is unchanged, so this only re-renders
      // at the moment an incident actually crosses its deadline.
      setOverdueCount((prev) => (prev === n ? prev : n));
    }

    check();
    const id = window.setInterval(check, 3000);
    return () => window.clearInterval(id);
  }, [activeUnacked]);

  // ---- alarm --------------------------------------------------------------
  const needsAlarm = criticalUnacked.length > 0 || overdueCount > 0;

  useEffect(() => {
    if (!soundOn) {
      alarm.stop();
      return;
    }
    if (needsAlarm) alarm.start();
    else alarm.stop();
  }, [soundOn, needsAlarm]);

  useEffect(() => () => alarm.stop(), []);

  const [soundError, setSoundError] = useState<string | null>(null);

  const toggleSound = useCallback(async () => {
    if (soundOn) {
      alarm.stop();
      setSoundOn(false);
      rememberAlarmPref(false);
      return;
    }
    // arm() is called synchronously inside this tap, which is what iOS
    // requires; it plays a confirmation chirp so the user knows it worked.
    const ok = await alarm.arm();
    setSoundOn(ok);
    rememberAlarmPref(ok);
    setSoundError(
      ok ? null : "This browser blocked audio. Check the silent switch or site sound settings.",
    );
    if (ok && needsAlarm) alarm.start();
  }, [soundOn, needsAlarm]);

  // Audio is suspended on screen lock; resume it when the tab returns.
  useEffect(() => alarm.watchVisibility(), []);

  // The alarm preference used to reset to off every time this component
  // remounted (navigating back to the dashboard, or router.refresh after an
  // action). Persist it, and try to re-arm automatically on return — Chrome
  // remembers the audio grant per-origin, so this usually succeeds silently.
  useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined") return;

    let wanted = false;
    try {
      wanted = window.localStorage.getItem(ALARM_PREF_KEY) === "on";
    } catch {
      return;
    }
    if (!wanted) return;

    void (async () => {
      const ok = await alarm.arm();
      if (cancelled) return;
      setSoundOn(ok);
      if (!ok) {
        setSoundError(
          "Alarm is on for this account but this browser needs one tap to allow sound.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- actions ------------------------------------------------------------
  const act = useCallback(
    async (incidentId: string, action: "acknowledge" | "resolve") => {
      setBusyId(incidentId);
      setActionError(null);
      try {
        const res = await fetch("/api/incident/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incidentId, action, actor: "Dashboard" }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Action failed.");
        // Realtime delivers the row, but update locally so the tap feels instant.
        setIncidents((prev) =>
          prev.map((i) =>
            i.id === incidentId
              ? {
                  ...i,
                  status: action === "acknowledge" ? "acknowledged" : "resolved",
                  acknowledged_at: i.acknowledged_at ?? new Date().toISOString(),
                  resolved_at:
                    action === "resolve" ? new Date().toISOString() : i.resolved_at,
                }
              : i,
          ),
        );
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Action failed.");
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      {/* Alarm control */}
      <button
        type="button"
        onClick={() => void toggleSound()}
        className={`tap flex items-center justify-between rounded-2xl border-2 px-4 py-3 active:bg-slate-100 ${
          soundOn ? "border-red-600 bg-red-50" : "border-slate-200 bg-white"
        }`}
      >
        <span className="flex items-center gap-2">
          {soundOn ? (
            <BellRing size={20} className="text-red-600" aria-hidden="true" />
          ) : (
            <BellOff size={20} className="text-slate-400" aria-hidden="true" />
          )}
          <span className="text-left">
            <span className="block text-sm font-bold text-slate-900">
              Critical alarm {soundOn ? "on" : "off"}
            </span>
            <span className="block text-xs text-slate-500">
              {soundOn
                ? "Sounds until every critical alert is acknowledged"
                : "Tap to enable sound on this device"}
            </span>
          </span>
        </span>
        {criticalUnacked.length > 0 ? (
          <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-extrabold text-white">
            {criticalUnacked.length}
          </span>
        ) : null}
      </button>

      {overdueCount > 0 ? (
        <div
          role="alert"
          className="animate-aegis-flash rounded-2xl border-2 border-red-600 px-4 py-3"
        >
          <p className="text-sm font-extrabold text-red-700">
            {overdueCount} report{overdueCount === 1 ? "" : "s"} past the
            response deadline
          </p>
          <p className="mt-0.5 text-sm text-red-700">
            No responder has acknowledged yet. The next tier has been paged.
          </p>
        </div>
      ) : null}

      {soundError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">{soundError}</p>
        </div>
      ) : null}

      <CampusMap
        campuses={campuses}
        incidents={incidents.filter((i) => ACTIVE_STATUSES.includes(i.status))}
      />

      {/* Filters */}
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Block
          </span>
          <select
            value={campusFilter}
            onChange={(e) => setCampusFilter(e.target.value)}
            className="tap rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
          >
            <option value="all">All blocks</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Status
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="tap rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
          >
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      {actionError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">{actionError}</p>
        </div>
      ) : null}

      {/* List */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 px-5 py-10 text-center">
          <CircleCheckBig
            size={32}
            className="mx-auto text-green-600"
            aria-hidden="true"
          />
          <p className="mt-2 text-base font-bold text-slate-900">All clear</p>
          <p className="mt-1 text-sm text-slate-500">
            No incidents match this filter.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              campusName={campusName(incident.campus_id)}
              locationLabel={locationLabel(incident.location_id)}
              busy={busyId === incident.id}
              onAction={act}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function IncidentCard({
  incident,
  campusName,
  locationLabel,
  busy,
  onAction,
}: {
  incident: Incident;
  campusName: string;
  locationLabel: string;
  busy: boolean;
  onAction: (id: string, action: "acknowledge" | "resolve") => void;
}) {
  const priority = (incident.final_priority ?? "normal") as Priority;
  const style = PRIORITY_STYLES[priority];
  const active = ACTIVE_STATUSES.includes(incident.status);
  const unacked = !incident.acknowledged_at && active;
  const flashing = priority === "critical" && unacked;

  return (
    <li
      className={`rounded-2xl border-2 px-4 py-4 ${
        flashing
          ? "animate-aegis-flash border-red-600"
          : incident.status === "resolved"
            ? "border-slate-200 bg-white opacity-70"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide leading-none ${style.badge}`}
        >
          {incident.final_priority ? style.label : "CLASSIFYING"}
        </span>
        <ElapsedSince
          iso={incident.created_at}
          className="text-xs font-semibold text-slate-500"
        />
      </div>

      <p className="mt-2 text-base font-extrabold capitalize leading-tight text-slate-900">
        {incident.emergency_type}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <MapPin size={14} className="text-red-600" aria-hidden="true" />
        {campusName}
        {locationLabel ? ` · ${locationLabel}` : ""}
      </p>

      {incident.description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {incident.description}
        </p>
      ) : null}

      <p className="mt-1.5 text-xs text-slate-400">
        {incident.is_anonymous
          ? "Anonymous"
          : `${incident.reporter_name || "Unnamed"}${
              incident.reporter_phone ? ` · ${incident.reporter_phone}` : ""
            }`}
        {" · "}
        {STATUS_LABELS[incident.status]}
      </p>

      {/* Escalation countdown */}
      {unacked ? (
        <p className="mt-2">
          <EscalationCountdown
            createdAt={incident.created_at}
            thresholdSeconds={ESCALATE_AFTER[priority]}
          />
        </p>
      ) : null}

      {/* Acknowledge takes its own row: three buttons across a phone clipped
          the label, and it is the action that stops the escalation clock. */}
      <div className="mt-3 flex flex-col gap-2">
        {active && !incident.acknowledged_at ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(incident.id, "acknowledge")}
            className="tap w-full rounded-2xl bg-red-600 px-4 py-3.5 text-base font-bold text-white active:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Working…" : "Acknowledge"}
          </button>
        ) : null}

        <div className="flex gap-2">
          {active ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(incident.id, "resolve")}
              className="tap min-w-0 flex-1 rounded-2xl bg-green-600 px-3 py-3 text-sm font-bold text-white active:bg-green-700 disabled:opacity-50"
            >
              {busy ? "…" : "Resolve"}
            </button>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-slate-400">
              <Check size={15} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{STATUS_LABELS[incident.status]}</span>
            </span>
          )}
          <Link
            href={`/incident/${incident.id}`}
            className="tap flex shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 active:bg-slate-100"
          >
            Timeline
          </Link>
        </div>
      </div>
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden="true">
      <div className="h-16 rounded-2xl bg-slate-100" />
      <div className="h-40 rounded-2xl bg-slate-100" />
      <div className="flex gap-3">
        <div className="h-12 flex-1 rounded-2xl bg-slate-100" />
        <div className="h-12 flex-1 rounded-2xl bg-slate-100" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}
