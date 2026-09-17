"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, MapPin, Siren, X } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { useLiveSync } from "@/lib/use-live-sync";
import * as alarm from "@/lib/alarm";
import { primeSpeech, speak } from "@/lib/speech";
import { readSettings } from "@/lib/a11y-settings";
import { speakStaffAlert } from "@/lib/phrases";
import {
  PRIORITY_STYLES,
  type Campus,
  type CampusLocation,
  type Incident,
  type Priority,
} from "@/lib/types";

/**
 * Station-wide alert for signed-in staff.
 *
 * Mounted globally, so a responder reading any screen is interrupted the
 * moment a life-threatening report lands, rather than only seeing it if they
 * happen to be sitting on the dashboard. Takeover + sound + an OS notification,
 * and one tap goes straight to the incident.
 */

const ALERT_PRIORITIES: Priority[] = ["critical", "urgent"];

/** Only replay missed alerts this recent, so signing in is not a siren. */
const RESYNC_WINDOW_MS = 5 * 60 * 1000;

export default function CriticalWatch() {
  const router = useRouter();
  const pathname = usePathname() || "/";

  const [incident, setIncident] = useState<Incident | null>(null);
  const [campus, setCampus] = useState<Campus | null>(null);
  const [location, setLocation] = useState<CampusLocation | null>(null);
  const [notifyState, setNotifyState] = useState<NotificationPermission | "unsupported">(
    "default",
  );

  // Incidents already shown, so a row update does not re-alert.
  const seen = useRef<Set<string>>(new Set());
  const dismissed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    setNotifyState(
      "Notification" in window ? Notification.permission : "unsupported",
    );
  }, []);

  const requestNotifications = useCallback(async () => {
    // This tap is a user gesture, so it is also the opportunity to unlock
    // audio — otherwise the alarm would be silent on the first real alert.
    void alarm.arm();
    primeSpeech();

    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setNotifyState(result);
    } catch {
      /* ignore */
    }
  }, []);

  const raise = useCallback(
    async (row: Incident) => {
      if (seen.current.has(row.id) || dismissed.current.has(row.id)) return;
      const priority = row.final_priority;
      if (!priority || !ALERT_PRIORITIES.includes(priority)) return;
      if (row.acknowledged_at) return;
      if (["resolved", "cancelled"].includes(row.status)) return;
      // Already looking at this incident - no point interrupting.
      if (pathname === `/incident/${row.id}`) return;

      seen.current.add(row.id);

      // Resolve names for a message a human can act on.
      const [campusRes, locationRes] = await Promise.all([
        row.campus_id
          ? supabase.from("campuses").select("*").eq("id", row.campus_id).maybeSingle()
          : Promise.resolve({ data: null }),
        row.location_id
          ? supabase.from("locations").select("*").eq("id", row.location_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const campusRow = (campusRes.data as Campus) ?? null;
      const locationRow = (locationRes.data as CampusLocation) ?? null;

      setCampus(campusRow);
      setLocation(locationRow);
      setIncident(row);

      const where = `${campusRow?.name ?? "campus"}${
        locationRow ? `, ${locationRow.label}` : ""
      }`;

      if (priority === "critical") alarm.start();

      const settings = readSettings();
      if (settings.voice) {
        speak(
          speakStaffAlert(settings.language, priority, row.emergency_type, where),
          { interrupt: true },
        );
      }

      // OS-level notification, so the alert lands even in another tab.
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const n = new Notification(
            `${priority === "critical" ? "🔴 CRITICAL" : "🟠 URGENT"} — ${row.emergency_type}`,
            {
              body: `${where}\n${row.description ?? "No description given."}`,
              tag: row.id,
              // Critical alerts stay on screen until the responder acts.
              requireInteraction: priority === "critical",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              // Android buzzes an SOS-like pattern. The web platform gives no
              // control over the notification tone itself — the OS picks it —
              // so the in-app alarm carries the sound.
              vibrate: priority === "critical" ? [300, 150, 300, 150, 600] : [200, 100, 200],
              silent: false,
            } as NotificationOptions,
          );
          n.onclick = () => {
            window.focus();
            router.push(`/incident/${row.id}`);
            n.close();
          };
        }
      } catch {
        /* notifications are a bonus, never required */
      }
    },
    [pathname, router],
  );

  /**
   * Catches anything the socket missed. Only looks at the last few minutes so
   * signing in does not replay every old alert, but a report that landed while
   * the channel was still connecting still reaches the responder.
   */
  const resync = useCallback(async () => {
    const since = new Date(Date.now() - RESYNC_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("incidents")
      .select("*")
      .in("status", ["reported", "classified"])
      .is("acknowledged_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);

    for (const row of (data ?? []) as Incident[]) {
      await raise(row);
    }
  }, [raise]);

  useLiveSync(
    "staff:critical-watch",
    (channel) =>
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "incidents" },
          (payload) => void raise(payload.new as Incident),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "incidents" },
          (payload) => {
            const row = payload.new as Incident;
            // Classification lands as an UPDATE - that is when the priority
            // first becomes known, so it is the moment worth alerting on.
            if (
              row.acknowledged_at ||
              ["resolved", "cancelled"].includes(row.status)
            ) {
              setIncident((current) => {
                if (current?.id === row.id) {
                  alarm.stop();
                  return null;
                }
                return current;
              });
              return;
            }
            void raise(row);
          },
        ),
    resync,
    { pollMs: 10_000 },
  );

  const clear = useCallback(() => {
    alarm.stop();
    setIncident(null);
  }, []);

  const dismiss = useCallback(() => {
    if (incident) dismissed.current.add(incident.id);
    clear();
  }, [incident, clear]);

  const open = useCallback(() => {
    if (!incident) return;
    const id = incident.id;
    clear();
    router.push(`/incident/${id}`);
  }, [incident, clear, router]);

  const acknowledge = useCallback(async () => {
    if (!incident) return;
    const id = incident.id;
    clear();
    try {
      await fetch("/api/incident/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: id, action: "acknowledge", actor: "Staff alert" }),
      });
    } catch {
      /* the dashboard remains the source of truth */
    }
  }, [incident, clear]);

  // Ask for notification permission once, unobtrusively.
  if (!incident) {
    if (notifyState === "default") {
      return (
        <button
          type="button"
          onClick={() => void requestNotifications()}
          className="tap fixed left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-lg active:bg-slate-700"
          style={{ top: "calc(var(--sat) + 8px)" }}
        >
          <span className="flex items-center gap-1.5">
            <BellRing size={14} aria-hidden="true" />
            Enable emergency alerts
          </span>
        </button>
      );
    }
    return null;
  }

  const priority = (incident.final_priority ?? "urgent") as Priority;
  const style = PRIORITY_STYLES[priority];

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="critical-watch-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 px-4"
      style={{ paddingBottom: "calc(var(--sab) + 16px)" }}
    >
      <div className="w-full max-w-md animate-slide-up rounded-3xl bg-white px-5 pb-5 pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />

        <div className="flex items-start justify-between gap-3">
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold leading-none tracking-wide ${style.badge}`}
          >
            <Siren size={13} aria-hidden="true" />
            {style.label}
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss alert"
            className="tap -mr-2 -mt-2 flex items-center justify-center rounded-full p-2 text-slate-400 active:bg-slate-100"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <h2
          id="critical-watch-title"
          className="mt-3 text-2xl font-extrabold capitalize leading-tight text-slate-900"
        >
          {incident.emergency_type}
        </h2>

        <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <MapPin size={15} className="text-red-600" aria-hidden="true" />
          {campus?.name ?? "Unknown block"}
          {location ? ` · ${location.label}` : ""}
        </p>

        {incident.description ? (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
            {incident.description}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={open}
            className="tap rounded-2xl bg-red-600 px-6 py-4 text-base font-extrabold text-white active:bg-red-700"
          >
            Open incident
          </button>
          <button
            type="button"
            onClick={() => void acknowledge()}
            className="tap rounded-2xl border-2 border-slate-300 px-6 py-4 text-base font-bold text-slate-900 active:bg-slate-100"
          >
            Acknowledge — I am responding
          </button>
        </div>
      </div>
    </div>
  );
}
