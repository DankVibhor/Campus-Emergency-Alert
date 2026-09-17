"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, MapPin, Navigation, Undo2 } from "lucide-react";
import { formatEta } from "@/lib/geo";
import { ReportedAgo } from "@/components/live-time";
import { speak } from "@/lib/speech";
import { readSettings } from "@/lib/a11y-settings";
import { speakStatus } from "@/lib/phrases";
import { supabase } from "@/lib/supabase-browser";
import { useLiveSync } from "@/lib/use-live-sync";
import {
  PRIORITY_STYLES,
  STATUS_LABELS,
  type Campus,
  type CampusLocation,
  type Incident,
  type IncidentEvent,
  type Priority,
} from "@/lib/types";

const CANCEL_WINDOW_MS = 10_000;

interface Props {
  incidentId: string;
  justSent: boolean;
}

export default function IncidentLive({ incidentId, justSent }: Props) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [campus, setCampus] = useState<Campus | null>(null);
  const [location, setLocation] = useState<CampusLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // False-alarm window
  const [cancelLeft, setCancelLeft] = useState(justSent ? 10 : 0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const mountedAt = useRef(Date.now());

  // ---- initial load -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("incidents")
        .select("*")
        .eq("id", incidentId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const inc = data as Incident;
      setIncident(inc);

      const [eventRes, campusRes, locationRes] = await Promise.all([
        supabase
          .from("incident_events")
          .select("*")
          .eq("incident_id", incidentId)
          .order("created_at", { ascending: true }),
        inc.campus_id
          ? supabase.from("campuses").select("*").eq("id", inc.campus_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        inc.location_id
          ? supabase
              .from("locations")
              .select("*")
              .eq("id", inc.location_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;
      setEvents((eventRes.data ?? []) as IncidentEvent[]);
      setCampus((campusRes.data as Campus) ?? null);
      setLocation((locationRes.data as CampusLocation) ?? null);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  // ---- live sync ----------------------------------------------------------
  // Resyncs whenever the channel connects and polls as a fallback, so the
  // reporter never has to pull-to-refresh to see that help is on the way.
  const resync = useCallback(async () => {
    const [incidentRes, eventRes] = await Promise.all([
      supabase.from("incidents").select("*").eq("id", incidentId).maybeSingle(),
      supabase
        .from("incident_events")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: true }),
    ]);
    if (incidentRes.data) setIncident(incidentRes.data as Incident);
    if (eventRes.data) setEvents(eventRes.data as IncidentEvent[]);
  }, [incidentId]);

  useLiveSync(
    `incident:${incidentId}`,
    (channel) =>
      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "incidents",
            filter: `id=eq.${incidentId}`,
          },
          (payload) => setIncident(payload.new as Incident),
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "incident_events",
            filter: `incident_id=eq.${incidentId}`,
          },
          (payload) => {
            const next = payload.new as IncidentEvent;
            setEvents((prev) =>
              prev.some((e) => e.id === next.id) ? prev : [...prev, next],
            );
          },
        ),
    resync,
    { pollMs: 8000 },
  );

  // ---- classification safety net -----------------------------------------
  // If the post-submit classify call was lost (navigation, flaky network), the
  // incident would sit unprioritised. Retrigger once; /api/classify is
  // idempotent, so a duplicate call cannot double-page responders.
  const retriedClassify = useRef(false);
  useEffect(() => {
    if (!incident || retriedClassify.current) return;
    if (incident.final_priority || incident.status === "cancelled") return;

    const id = window.setTimeout(() => {
      retriedClassify.current = true;
      void fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId }),
      }).catch(() => {});
    }, 3000);

    return () => window.clearTimeout(id);
  }, [incident, incidentId]);

  // ---- spoken status updates ---------------------------------------------
  // A blind reporter cannot watch the page change, so announce transitions.
  // The aria-live region below covers screen-reader users; this covers people
  // who have the app open but are not running one.
  const spokenStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!incident) return;
    const key = `${incident.status}:${incident.final_priority ?? ""}`;
    if (spokenStatus.current === key) return;

    const first = spokenStatus.current === null;
    spokenStatus.current = key;
    if (first && !justSent) return; // don't narrate a page the user just opened

    const settings = readSettings();
    if (!settings.voice) return;

    speak(
      speakStatus(settings.language, incident.status, incident.final_priority),
      { interrupt: true },
    );
  }, [incident, justSent]);

  // ---- false-alarm countdown ---------------------------------------------
  useEffect(() => {
    if (!justSent) return;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - mountedAt.current;
      const left = Math.max(0, Math.ceil((CANCEL_WINDOW_MS - elapsed) / 1000));
      setCancelLeft(left);
      if (left === 0) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [justSent]);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/incident/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not cancel the report.");
      }
      setCancelLeft(0);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed.");
    } finally {
      setCancelling(false);
    }
  }, [incidentId]);

  const priority: Priority | null = incident?.final_priority ?? null;
  const style = priority ? PRIORITY_STYLES[priority] : null;

  if (loading) return <IncidentSkeleton />;

  if (notFound) {
    return (
      <div className="rounded-2xl border border-slate-200 px-5 py-6 text-center">
        <p className="text-base font-bold text-slate-900">Report not found</p>
        <p className="mt-1 text-sm text-slate-600">
          This link may be from a different device or the report was removed.
        </p>
        <Link
          href="/report"
          className="press tap mt-4 inline-flex items-center justify-center rounded-2xl bg-red-600 px-6 py-3 font-bold text-white"
        >
          Make a new report
        </Link>
      </div>
    );
  }

  if (!incident) return null;

  const cancelled = incident.status === "cancelled";

  return (
    <div className="flex flex-col gap-5">
      {/* Screen readers announce status transitions without stealing focus. */}
      <p className="sr-only" role="status" aria-live="polite">
        {incident.final_priority
          ? `Priority ${incident.final_priority}. `
          : "Classifying. "}
        {STATUS_LABELS[incident.status]}
      </p>

      {/* Status headline */}
      <section
        className={`rounded-2xl border px-5 py-5 ${
          cancelled
            ? "border-slate-200 bg-slate-50"
            : incident.status === "resolved"
              ? "border-green-200 bg-green-50"
              : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Status
          </span>
          {style && !cancelled ? (
            <span
              className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-full px-3 py-1 text-xs font-extrabold tracking-wide leading-none ${style.badge}`}
            >
              {style.label}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-slate-200 px-3 py-1 text-xs font-extrabold leading-none tracking-wide text-slate-600">
              {priority ? PRIORITY_STYLES[priority].label : "CLASSIFYING…"}
            </span>
          )}
        </div>

        <p className="mt-2 text-2xl font-extrabold leading-tight text-slate-900">
          {STATUS_LABELS[incident.status]}
        </p>

        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
          <Clock size={14} aria-hidden="true" />
          Reported <ReportedAgo iso={incident.created_at} />
        </p>

        {incident.ai_reasoning && !cancelled ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-600">
            {incident.ai_reasoning}
          </p>
        ) : null}
      </section>

      {/* False alarm window */}
      {justSent && cancelLeft > 0 && !cancelled ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="press tap flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            <Undo2 size={18} aria-hidden="true" />
            {cancelling ? "Cancelling…" : `Cancel — false alarm (${cancelLeft}s)`}
          </button>
          {cancelError ? (
            <p className="mt-2 text-sm text-red-700">{cancelError}</p>
          ) : null}
        </div>
      ) : null}

      {/* Responder en route */}
      {incident.acknowledged_at && !cancelled && incident.status !== "resolved" ? (
        <section className="rounded-2xl border-2 border-green-200 bg-green-50 px-5 py-4">
          <p className="flex items-center gap-2 text-base font-extrabold text-green-900">
            <Navigation size={18} aria-hidden="true" />
            Help is on the way
          </p>
          {incident.responder_eta_seconds !== null ? (
            <p className="mt-1 text-sm font-semibold text-green-800">
              Estimated arrival in about{" "}
              {formatEta(incident.responder_eta_seconds)}.
            </p>
          ) : (
            <p className="mt-1 text-sm text-green-800">
              A responder has accepted your report.
            </p>
          )}
          <p className="mt-1 text-xs text-green-700">
            Stay where you are if it is safe to do so.
          </p>
        </section>
      ) : null}

      {/* Photo evidence */}
      {incident.photo_url ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={incident.photo_url}
            alt="Photo submitted with this report"
            className="h-auto w-full"
          />
        </section>
      ) : null}

      {/* Where / what */}
      <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-5 py-4">
        <p className="flex items-center gap-2 text-base font-bold text-slate-900">
          <MapPin size={18} className="text-red-600" aria-hidden="true" />
          {campus?.name ?? "Unknown block"}
          {location ? ` · ${location.label}` : ""}
        </p>
        <p className="text-sm font-semibold capitalize text-slate-700">
          {incident.emergency_type}
        </p>
        {incident.description ? (
          <p className="selectable text-sm leading-relaxed text-slate-600">
            {incident.description}
          </p>
        ) : null}
        <p className="text-xs text-slate-400">
          {incident.is_anonymous
            ? "Reported anonymously"
            : `Reported by ${incident.reporter_name || "unnamed"}`}
        </p>
      </section>

      {/* Timeline */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Timeline
        </h2>
        <ol className="flex flex-col gap-0">
          <TimelineRow
            title="Report received"
            at={incident.created_at}
            done
            first
          />
          {events.map((e) => (
            <TimelineRow
              key={e.id}
              title={eventTitle(e)}
              note={e.note}
              at={e.created_at}
              done
            />
          ))}
          {!cancelled && incident.status !== "resolved" ? (
            <TimelineRow title="Awaiting responder" pending last />
          ) : null}
        </ol>
      </section>

      <p className="selectable text-center text-xs text-slate-400">
        Reference ID {incident.id.slice(0, 8).toUpperCase()}
      </p>
    </div>
  );
}

function eventTitle(e: IncidentEvent) {
  switch (e.event_type) {
    case "classified":
      return "Urgency classified";
    case "notified":
      return "Responders notified";
    case "acknowledged":
      return "Responder acknowledged";
    case "escalated":
      return "Escalated to next tier";
    case "resolved":
      return "Incident resolved";
    case "cancelled":
      return "Cancelled by reporter";
    default:
      return e.event_type;
  }
}

function TimelineRow({
  title,
  note,
  at,
  done = false,
  pending = false,
  first = false,
  last = false,
}: {
  title: string;
  note?: string | null;
  at?: string;
  done?: boolean;
  pending?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
            pending ? "bg-slate-300" : "bg-green-600"
          }`}
        />
        {!last ? <span className="w-px flex-1 bg-slate-200" /> : null}
      </div>
      <div className={`pb-5 ${first ? "" : ""}`}>
        <p
          className={`text-sm font-bold ${
            pending ? "text-slate-400" : "text-slate-900"
          }`}
        >
          {done ? (
            <CheckCircle2
              size={14}
              className="mr-1 inline text-green-600"
              aria-hidden="true"
            />
          ) : null}
          {title}
        </p>
        {note ? (
          <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{note}</p>
        ) : null}
        {at ? (
          <p className="mt-0.5 text-xs text-slate-400">{formatTime(at)}</p>
        ) : null}
      </div>
    </li>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function IncidentSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden="true">
      <div className="h-36 rounded-2xl bg-slate-100" />
      <div className="h-28 rounded-2xl bg-slate-100" />
      <div className="h-40 rounded-2xl bg-slate-100" />
    </div>
  );
}
