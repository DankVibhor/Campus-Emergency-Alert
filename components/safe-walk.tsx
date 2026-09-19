"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Footprints, ShieldCheck, TriangleAlert } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { readCache } from "@/lib/reference-cache";
import { feedbackConfirm, feedbackError } from "@/lib/feedback";
import type { Campus, SafeWalk } from "@/lib/types";

const ACTIVE_KEY = "aegis.safe-walk.active";
const DURATIONS = [5, 10, 15, 20, 30];

/**
 * Safe-walk check-in.
 *
 * The walker starts a timer before setting off. Arriving safely takes one tap.
 * Silence is the alarm: if the timer runs out with no check-in, the server
 * sweep raises a critical security incident at their last known position —
 * which is the case where the person is least able to ask for help themselves.
 */
export default function SafeWalkPanel() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [walk, setWalk] = useState<SafeWalk | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [campusId, setCampusId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fromLabel, setFromLabel] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [minutes, setMinutes] = useState(10);

  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Ticks only while a walk is running.
  useEffect(() => {
    if (!walk || walk.status !== "walking") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [walk]);

  // The walker's own device triggers the sweep the moment its timer expires,
  // so the alert does not wait for a responder to have the dashboard open.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (!walk || walk.status !== "walking" || sweptRef.current) return;
    if (new Date(walk.due_at).getTime() > now) return;

    sweptRef.current = true;
    void fetch("/api/safe-walk/sweep", { method: "POST" })
      .then(() => fetch(`/api/safe-walk?id=${walk.id}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { walk?: SafeWalk } | null) => {
        if (body?.walk) setWalk(body.walk);
      })
      .catch(() => {
        /* the dashboard sweep is the fallback */
      });
  }, [walk, now]);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setCampuses(cached.campuses);
      setCampusId((c) => c || cached.campuses[0]?.id || "");
    }

    async function load() {
      const { data } = await supabase.from("campuses").select("*").order("name");
      const cs = (data ?? []) as Campus[];
      if (cs.length) {
        setCampuses(cs);
        setCampusId((c) => c || cs[0].id);
      }

      // Restore an in-progress walk after a reload.
      let activeId: string | null = null;
      try {
        activeId = window.localStorage.getItem(ACTIVE_KEY);
      } catch {
        /* ignore */
      }
      if (activeId) {
        try {
          const res = await fetch(`/api/safe-walk?id=${activeId}`);
          if (res.ok) {
            const body = (await res.json()) as { walk?: SafeWalk };
            if (body.walk) setWalk(body.walk);
          }
        } catch {
          /* stay on the setup screen if the fetch fails */
        }
      }
      setLoading(false);
    }

    void load();
  }, []);

  // Keep a recent fix so a missed check-in has a position to send responders to.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        coordsRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Push the latest position while walking.
  useEffect(() => {
    if (!walk || walk.status !== "walking") return;
    const id = window.setInterval(() => {
      const c = coordsRef.current;
      if (!c) return;
      void fetch("/api/safe-walk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: walk.id, last_lat: c.lat, last_lng: c.lng }),
      }).catch(() => {
        /* a missed position ping is not fatal; the next one retries */
      });
    }, 20_000);
    return () => window.clearInterval(id);
  }, [walk]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/safe-walk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campus_id: campusId || null,
          person_name: name.trim() || null,
          person_phone: phone.trim() || null,
          from_label: fromLabel.trim() || null,
          to_label: toLabel.trim() || null,
          expected_minutes: minutes,
          last_lat: coordsRef.current?.lat ?? null,
          last_lng: coordsRef.current?.lng ?? null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        walk?: SafeWalk;
        error?: string;
      };
      if (!res.ok || !body.walk) throw new Error(body.error ?? "Could not start.");

      const row = body.walk;
      setWalk(row);
      try {
        window.localStorage.setItem(ACTIVE_KEY, row.id);
      } catch {
        /* ignore */
      }
      feedbackConfirm();
    } catch (err) {
      feedbackError();
      setError(err instanceof Error ? err.message : "Could not start the walk.");
    } finally {
      setBusy(false);
    }
  }, [campusId, name, phone, fromLabel, toLabel, minutes]);

  const finish = useCallback(
    async (status: "safe" | "cancelled") => {
      if (!walk) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/safe-walk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: walk.id, status }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          walk?: SafeWalk;
          error?: string;
        };
        if (!res.ok || !body.walk) throw new Error(body.error ?? "Could not check in.");

        setWalk(body.walk);
        try {
          window.localStorage.removeItem(ACTIVE_KEY);
        } catch {
          /* ignore */
        }
        if (status === "safe") feedbackConfirm();
      } catch (err) {
        feedbackError();
        setError(err instanceof Error ? err.message : "Could not check in.");
      } finally {
        setBusy(false);
      }
    },
    [walk],
  );

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  // ---- active walk --------------------------------------------------------
  if (walk && walk.status === "walking") {
    const msLeft = new Date(walk.due_at).getTime() - now;
    const secondsLeft = Math.max(0, Math.round(msLeft / 1000));
    const overdue = msLeft <= 0;
    const total = walk.expected_minutes * 60;
    const pct = Math.max(0, Math.min(100, (secondsLeft / total) * 100));

    return (
      <div className="flex flex-col gap-4">
        <section
          className={`rounded-2xl border-2 px-5 py-6 text-center ${
            overdue
              ? "animate-aegis-flash border-red-600"
              : "border-slate-200 bg-white"
          }`}
        >
          <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {overdue ? "Raising an alert" : "Walking"}
          </p>
          <p className="mt-2 text-5xl font-extrabold tabular-nums text-slate-900">
            {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, "0")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {overdue
              ? "Security is being notified now."
              : "Tap below the moment you arrive."}
          </p>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-red-600 transition-[width] duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        </section>

        <button
          type="button"
          disabled={busy}
          onClick={() => void finish("safe")}
          className="tap flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-6 py-5 text-lg font-extrabold text-white active:bg-green-700 disabled:opacity-60"
        >
          <ShieldCheck size={22} aria-hidden="true" />
          {busy ? "Saving…" : "I have arrived safely"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void finish("cancelled")}
          className="tap rounded-2xl border-2 border-slate-300 px-6 py-3 text-sm font-bold text-slate-700 active:bg-slate-100 disabled:opacity-60"
        >
          Cancel this walk
        </button>

        {error ? (
          <p className="text-sm font-semibold text-red-700">{error}</p>
        ) : null}
      </div>
    );
  }

  // ---- finished -----------------------------------------------------------
  if (walk && (walk.status === "safe" || walk.status === "cancelled")) {
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border-2 border-green-200 bg-green-50 px-5 py-6 text-center">
          <ShieldCheck size={32} className="mx-auto text-green-600" aria-hidden="true" />
          <p className="mt-2 text-lg font-extrabold text-green-900">
            {walk.status === "safe" ? "Checked in safely" : "Walk cancelled"}
          </p>
          <p className="mt-1 text-sm text-green-800">
            No alert was raised.
          </p>
        </section>
        <button
          type="button"
          onClick={() => setWalk(null)}
          className="tap rounded-2xl bg-red-600 px-6 py-4 font-bold text-white active:bg-red-700"
        >
          Start another walk
        </button>
      </div>
    );
  }

  if (walk && walk.status === "escalated") {
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border-2 border-red-600 px-5 py-6 text-center">
          <TriangleAlert size={32} className="mx-auto text-red-600" aria-hidden="true" />
          <p className="mt-2 text-lg font-extrabold text-red-700">
            Alert raised
          </p>
          <p className="mt-1 text-sm text-red-700">
            You did not check in, so security was notified.
          </p>
        </section>
        <button
          type="button"
          onClick={() => setWalk(null)}
          className="tap rounded-2xl bg-red-600 px-6 py-4 font-bold text-white active:bg-red-700"
        >
          Start a new walk
        </button>
      </div>
    );
  }

  // ---- setup --------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-slate-700">Block</span>
        <select
          value={campusId}
          onChange={(e) => setCampusId(e.target.value)}
          className="tap rounded-2xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-900"
        >
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-bold text-slate-700">From</span>
          <input
            value={fromLabel}
            onChange={(e) => setFromLabel(e.target.value)}
            placeholder="Library"
            className="tap rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder:text-slate-400"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-bold text-slate-700">To</span>
          <input
            value={toLabel}
            onChange={(e) => setToLabel(e.target.value)}
            placeholder="Hostel"
            className="tap rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-slate-700">
          Check in within
        </span>
        <div className="flex gap-2">
          {DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              onClick={() => setMinutes(m)}
              className={`tap flex-1 rounded-xl border-2 py-3 text-sm font-bold active:bg-slate-100 ${
                minutes === m
                  ? "border-red-600 bg-red-50 text-red-700"
                  : "border-slate-300 bg-white text-slate-800"
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (helps responders)"
          autoComplete="name"
          className="tap rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder:text-slate-400"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="tap rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder:text-slate-400"
        />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="tap flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-5 text-lg font-extrabold text-white active:bg-red-700 disabled:opacity-60"
      >
        <Footprints size={22} aria-hidden="true" />
        {busy ? "Starting…" : `Start ${minutes} minute walk`}
      </button>

      <p className="text-center text-xs leading-relaxed text-slate-500">
        If you do not check in within {minutes} minutes, Aegis raises a critical
        security alert at your last known location.
      </p>

      {error ? (
        <p className="text-sm font-semibold text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
