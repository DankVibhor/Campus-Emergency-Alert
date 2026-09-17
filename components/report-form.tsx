"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  HeartPulse,
  Flame,
  ShieldAlert,
  CarFront,
  UserX,
  CircleHelp,
  MapPin,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { EMERGENCY_TYPES, type Campus, type CampusLocation } from "@/lib/types";
import { feedbackError } from "@/lib/feedback";
import { rememberReport } from "@/lib/my-reports";
import { enqueue } from "@/lib/offline-queue";
import { readCache, writeCache } from "@/lib/reference-cache";
import SosButton from "@/components/sos-button";
import VoiceInput from "@/components/voice-input";
import PhotoInput from "@/components/photo-input";

const ICONS = {
  "heart-pulse": HeartPulse,
  flame: Flame,
  "shield-alert": ShieldAlert,
  "car-front": CarFront,
  "user-x": UserX,
  "circle-help": CircleHelp,
} as const;

interface Coords {
  lat: number;
  lng: number;
}

export default function ReportForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [campusId, setCampusId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [emergencyType, setEmergencyType] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Geolocation is best-effort: we never block a report waiting for a fix.
  const coordsRef = useRef<Coords | null>(null);

  // QR deep link: /report?campus=<id>&location=<id>
  const qrCampus = params.get("campus");
  const qrLocation = params.get("location");

  useEffect(() => {
    let cancelled = false;

    function applyData(cs: Campus[], ls: CampusLocation[]) {
      setCampuses(cs);
      setLocations(ls);

      // Prefill from the QR code when the ids are real, else fall back.
      setCampusId((current) => {
        if (current) return current;
        return (
          cs.find((c) => c.id === qrCampus)?.id ??
          cs.find((c) => c.code === qrCampus?.toUpperCase())?.id ??
          cs[0]?.id ??
          ""
        );
      });
      setLoading(false);
    }

    // 1. Paint immediately from the last known list.
    const cached = readCache();
    if (cached) applyData(cached.campuses, cached.locations);

    // 2. Revalidate in the background.
    async function load() {
      const [campusRes, locationRes] = await Promise.all([
        supabase.from("campuses").select("*").order("name"),
        supabase.from("locations").select("*").order("label"),
      ]);

      if (cancelled) return;

      if (campusRes.error || locationRes.error) {
        // A cached list is still perfectly usable offline.
        if (!cached) {
          setLoadError(
            campusRes.error?.message ||
              locationRes.error?.message ||
              "Could not load campus list.",
          );
          setLoading(false);
        }
        return;
      }

      const cs = (campusRes.data ?? []) as Campus[];
      const ls = (locationRes.data ?? []) as CampusLocation[];
      applyData(cs, ls);
      writeCache(cs, ls);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [qrCampus, qrLocation]);

  // Resolve the QR-specified floor once locations are available.
  useEffect(() => {
    if (!qrLocation || locationId) return;
    if (locations.some((l) => l.id === qrLocation)) setLocationId(qrLocation);
  }, [qrLocation, locations, locationId]);

  // Ask for a position early so a fix is usually ready by the time they submit.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordsRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      () => {
        // Denied or unavailable - the report still goes through.
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  const campusLocations = useMemo(
    () => locations.filter((l) => l.campus_id === campusId),
    [locations, campusId],
  );

  // Keep the location valid whenever the campus changes.
  useEffect(() => {
    if (!campusId) return;
    if (!campusLocations.some((l) => l.id === locationId)) {
      setLocationId(campusLocations[0]?.id ?? "");
    }
  }, [campusId, campusLocations, locationId]);

  const canSubmit = Boolean(campusId && locationId && emergencyType);

  const handleConfirm = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      campus_id: campusId,
      location_id: locationId,
      emergency_type: emergencyType,
      description: description.trim() || null,
      is_anonymous: anonymous,
      reporter_name: anonymous ? null : name.trim() || null,
      reporter_phone: anonymous ? null : phone.trim() || null,
      reporter_lat: coordsRef.current?.lat ?? null,
      reporter_lng: coordsRef.current?.lng ?? null,
      photo_url: photoUrl,
      status: "reported" as const,
    };

    const { data, error } = await supabase
      .from("incidents")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data) {
      // Offline or the insert was rejected: queue it rather than lose it.
      const queued = await enqueue({
        ...payload,
        queued_at: new Date().toISOString(),
      });
      feedbackError();
      setSubmitting(false);

      if (queued) {
        setQueuedOffline(true);
        setSubmitError(null);
      } else {
        setSubmitError(
          error?.message ??
            "Could not send the report. Use Call Security below.",
        );
      }
      return;
    }

    rememberReport({
      id: data.id,
      emergencyType,
      createdAt: new Date().toISOString(),
    });

    // Classification runs server-side; we do not make the reporter wait for it.
    void fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: data.id }),
      keepalive: true,
    }).catch(() => {
      /* the dashboard still shows the raw report */
    });

    router.push(`/incident/${data.id}?justSent=1`);
  }, [
    canSubmit,
    submitting,
    campusId,
    locationId,
    emergencyType,
    description,
    photoUrl,
    anonymous,
    name,
    phone,
    router,
  ]);

  if (loading) return <ReportSkeleton />;

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-sm font-semibold text-red-800">
          Could not load campus data
        </p>
        <p className="mt-1 text-sm text-red-700">{loadError}</p>
        <p className="mt-2 text-sm text-red-700">
          Use the Call Security button below.
        </p>
      </div>
    );
  }

  const selectedTypeLabel =
    EMERGENCY_TYPES.find((t) => t.value === emergencyType)?.label ?? null;

  // Voice and SMS fallbacks work on cellular even with no data connection.
  const securityPhone =
    process.env.NEXT_PUBLIC_SECURITY_PHONE || "+919999999999";
  const smsBody = `EMERGENCY at ${
    campuses.find((c) => c.id === campusId)?.name ?? "ASMT campus"
  }, ${campusLocations.find((l) => l.id === locationId)?.label ?? "unknown floor"}: ${
    selectedTypeLabel ?? "emergency"
  }.${description.trim() ? ` ${description.trim()}` : ""}`;
  const smsHref = `sms:${securityPhone}?body=${encodeURIComponent(smsBody)}`;

  return (
    <div className="flex flex-col gap-6">
      {qrCampus ? (
        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
          <MapPin size={18} className="text-red-600" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-700">
            Location detected from QR code
          </span>
        </div>
      ) : null}

      {/* Where */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Where is it?
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-700">Block</span>
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

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-700">Floor</span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="tap rounded-2xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-900"
          >
            {campusLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* What */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          What is happening?
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {EMERGENCY_TYPES.map(({ value, label, icon }) => {
            const Icon = ICONS[icon];
            const active = emergencyType === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setEmergencyType(value)}
                className={`press tap flex flex-col items-start gap-2 rounded-2xl border-2 px-4 py-4 text-left ${
                  active
                    ? "border-red-600 bg-red-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <Icon
                  size={26}
                  strokeWidth={2.2}
                  className={active ? "text-red-600" : "text-slate-500"}
                  aria-hidden="true"
                />
                <span
                  className={`text-sm font-bold ${
                    active ? "text-red-700" : "text-slate-800"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Detail */}
      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Details
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Briefly describe what's happening"
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 leading-relaxed text-slate-900 placeholder:text-slate-400"
          />
          <span className="text-xs text-slate-400">
            This text drives the urgency classification. Mention anything
            serious — bleeding, smoke, someone unconscious.
          </span>
        </label>

        <VoiceInput onText={setDescription} existing={description} />
        <PhotoInput onUploaded={setPhotoUrl} />
      </section>

      {/* Who */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Your details
        </h2>

        <button
          type="button"
          role="switch"
          aria-checked={anonymous}
          onClick={() => setAnonymous((v) => !v)}
          className="press tap flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
        >
          <span className="text-left">
            <span className="block text-sm font-bold text-slate-900">
              Report anonymously
            </span>
            <span className="block text-xs text-slate-500">
              Responders still see the location
            </span>
          </span>
          <span
            className={`flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition-colors ${
              anonymous ? "bg-red-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white transition-transform ${
                anonymous ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </span>
        </button>

        {!anonymous ? (
          <div className="flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className="tap rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="tap rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
            />
          </div>
        ) : null}
      </section>

      {/* Send */}
      <section className="flex flex-col items-center gap-4 pt-2">
        {!emergencyType ? (
          <p className="text-center text-sm font-medium text-amber-600">
            Choose what is happening to enable SOS
          </p>
        ) : null}

        <SosButton
          onConfirm={handleConfirm}
          disabled={!canSubmit}
          submitting={submitting}
          hint={
            selectedTypeLabel
              ? `Sends a ${selectedTypeLabel.toLowerCase()} alert to the on-duty responder`
              : undefined
          }
        />

        {queuedOffline ? (
          <div className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-4">
            <p className="text-sm font-extrabold text-amber-900">
              Saved — will send when online
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-800">
              You have no connection. The report is stored on this phone and
              sends itself the moment you are back online.
            </p>
            <p className="mt-2 text-sm font-semibold text-amber-900">
              If this is life-threatening, call or text security now.
            </p>
            <div className="mt-3 flex gap-2">
              <a
                href={`tel:${securityPhone}`}
                className="press tap flex-1 rounded-xl bg-red-600 px-4 py-3 text-center text-sm font-bold text-white"
              >
                Call
              </a>
              <a
                href={smsHref}
                className="press tap flex-1 rounded-xl border-2 border-amber-400 px-4 py-3 text-center text-sm font-bold text-amber-900"
              >
                Send SMS
              </a>
            </div>
          </div>
        ) : null}

        {submitError ? (
          <div className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-800">
              Report not sent
            </p>
            <p className="mt-1 text-sm text-red-700">{submitError}</p>
            <a
              href={smsHref}
              className="press tap mt-3 block rounded-xl bg-red-600 px-4 py-3 text-center text-sm font-bold text-white"
            >
              Send emergency SMS instead
            </a>
          </div>
        ) : null}

        {canSubmit && !submitError ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Check size={14} aria-hidden="true" />
            Ready to send
          </p>
        ) : null}
      </section>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-12 rounded-2xl bg-slate-100" />
        <div className="h-12 rounded-2xl bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="h-24 rounded-2xl bg-slate-100" />
      <div className="mx-auto h-56 w-56 rounded-full bg-slate-100" />
    </div>
  );
}
