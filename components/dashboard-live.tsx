"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  BellOff,
  Check,
  CircleCheckBig,
  Clock,
  MapPin,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
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

  // Drives the elapsed-time and countdown labels.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ---- initial load -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [incidentRes, campusRes, locationRes] = await Promise.all([
        supabase
          .from("incidents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("campuses").select("*").order("name"),
        supabase.from("locations").select("*"),
      ]);

      if (cancelled) return;
      setIncidents((incidentRes.data ?? []) as Incident[]);
      setCampuses((campusRes.data ?? []) as Campus[]);
      setLocations((locationRes.data ?? []) as CampusLocation[]);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- realtime -----------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel("dashboard:incidents")
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
          setIncidents((prev) =>
            prev.map((i) => (i.id === row.id ? row : i)),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

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

  // ---- alarm --------------------------------------------------------------
  const prevCount = useRef(0);
  useEffect(() => {
    if (!soundOn) {
      alarm.stop();
      return;
    }
    if (criticalUnacked.length > 0) alarm.start();
    else alarm.stop();
    prevCount.current = criticalUnacked.length;
  }, [soundOn, criticalUnacked.length]);

  useEffect(() => () => alarm.stop(), []);

  const toggleSound = useCallback(() => {
    if (soundOn) {
      alarm.stop();
      setSoundOn(false);
      return;
    }
    // Must run inside this tap, or iOS refuses to unlock the audio context.
    const ok = alarm.arm();
    setSoundOn(ok);
    if (ok && criticalUnacked.length > 0) alarm.start();
  }, [soundOn, criticalUnacked.length]);

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
        onClick={toggleSound}
        className={`press tap flex items-center justify-between rounded-2xl border-2 px-4 py-3 ${
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

  const ageSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(incident.created_at).getTime()) / 1000),
  );
  const escalateIn = Math.max(0, ESCALATE_AFTER[priority] - ageSeconds);

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
          className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${style.badge}`}
        >
          {incident.final_priority ? style.label : "CLASSIFYING"}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
          <Clock size={13} aria-hidden="true" />
          {formatAge(ageSeconds)}
        </span>
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
        <p
          className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${
            escalateIn === 0 ? "text-red-600" : "text-amber-600"
          }`}
        >
          <TriangleAlert size={13} aria-hidden="true" />
          {escalateIn === 0
            ? "Escalating to next tier"
            : `Escalates in ${escalateIn}s`}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        {active && !incident.acknowledged_at ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(incident.id, "acknowledge")}
            className="press tap flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "…" : "Acknowledge"}
          </button>
        ) : null}
        {active ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(incident.id, "resolve")}
            className="press tap flex-1 rounded-2xl bg-green-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "…" : "Resolve"}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-400">
            <Check size={15} aria-hidden="true" />
            {STATUS_LABELS[incident.status]}
          </span>
        )}
        <Link
          href={`/incident/${incident.id}`}
          className="press tap flex items-center justify-center rounded-2xl border-2 border-slate-200 px-4 py-3 text-sm font-bold text-slate-700"
        >
          Timeline
        </Link>
      </div>
    </li>
  );
}

function formatAge(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
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
