"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Timer } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { INCIDENT_PUBLIC_COLUMNS } from "@/lib/types";
import type { Campus, Incident, Priority } from "@/lib/types";

/**
 * Operational analytics.
 *
 * Colour choices follow the validator: the priority trio is a *status* palette
 * (red/amber/green), and green-amber separate by only ΔE 7 under protanopia,
 * so every bar carries its name and count as text. Colour is never the only
 * signal here. Magnitude breakdowns that are not status use a single hue,
 * because they compare size rather than track identity.
 */

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: "#dc2626",
  urgent: "#f59e0b",
  normal: "#16a34a",
};

const SINGLE_HUE = "#b91c1c"; // one hue for magnitude-only breakdowns

export default function AnalyticsView() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [incidentRes, campusRes] = await Promise.all([
        supabase.from("incidents").select(INCIDENT_PUBLIC_COLUMNS).order("created_at", { ascending: false }).limit(500),
        supabase.from("campuses").select("*").order("name"),
      ]);
      if (cancelled) return;
      setIncidents((incidentRes.data ?? []) as unknown as Incident[]);
      setCampuses((campusRes.data ?? []) as Campus[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const real = incidents.filter((i) => i.status !== "cancelled");

    const ackDurations = real
      .filter((i) => i.acknowledged_at)
      .map(
        (i) =>
          (new Date(i.acknowledged_at as string).getTime() -
            new Date(i.created_at).getTime()) /
          1000,
      )
      .filter((n) => n >= 0);

    const resolveDurations = real
      .filter((i) => i.resolved_at)
      .map(
        (i) =>
          (new Date(i.resolved_at as string).getTime() -
            new Date(i.created_at).getTime()) /
          1000,
      )
      .filter((n) => n >= 0);

    const median = (xs: number[]) => {
      if (xs.length === 0) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const byPriority: Record<Priority, number> = { critical: 0, urgent: 0, normal: 0 };
    for (const i of real) {
      const p = (i.final_priority ?? "normal") as Priority;
      byPriority[p] += 1;
    }

    const byType = new Map<string, number>();
    for (const i of real) {
      byType.set(i.emergency_type, (byType.get(i.emergency_type) ?? 0) + 1);
    }

    const byCampus = new Map<string, number>();
    for (const i of real) {
      if (!i.campus_id) continue;
      byCampus.set(i.campus_id, (byCampus.get(i.campus_id) ?? 0) + 1);
    }

    const byHour = Array.from({ length: 24 }, () => 0);
    for (const i of real) {
      byHour[new Date(i.created_at).getHours()] += 1;
    }

    return {
      total: real.length,
      open: real.filter((i) =>
        ["reported", "classified", "acknowledged"].includes(i.status),
      ).length,
      resolved: real.filter((i) => i.status === "resolved").length,
      medianAck: median(ackDurations),
      medianResolve: median(resolveDurations),
      byPriority,
      byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
      byCampus,
      byHour,
    };
  }, [incidents]);

  if (loading) {
    return (
      <div className="flex animate-pulse flex-col gap-4" aria-hidden="true">
        <div className="h-24 rounded-2xl bg-slate-100" />
        <div className="h-40 rounded-2xl bg-slate-100" />
        <div className="h-40 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 px-5 py-10 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-600" aria-hidden="true" />
        <p className="mt-2 text-base font-bold text-slate-900">No data yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Analytics appear once reports have been filed.
        </p>
      </div>
    );
  }

  const maxHour = Math.max(...stats.byHour, 1);

  return (
    <div className="flex flex-col gap-6">
      {/* Headline numbers - a stat tile beats a chart for a single value. */}
      <section className="grid grid-cols-2 gap-3">
        <Stat
          icon={<AlertTriangle size={18} aria-hidden="true" />}
          label="Total reports"
          value={String(stats.total)}
        />
        <Stat
          icon={<Clock size={18} aria-hidden="true" />}
          label="Still open"
          value={String(stats.open)}
        />
        <Stat
          icon={<Timer size={18} aria-hidden="true" />}
          label="Median acknowledge"
          value={formatDuration(stats.medianAck)}
        />
        <Stat
          icon={<CheckCircle2 size={18} aria-hidden="true" />}
          label="Median resolve"
          value={formatDuration(stats.medianResolve)}
        />
      </section>

      {/* Priority - status palette, every bar directly labelled. */}
      <Panel title="Reports by priority">
        <ul className="flex flex-col gap-2.5">
          {(["critical", "urgent", "normal"] as Priority[]).map((p) => (
            <BarRow
              key={p}
              label={p}
              count={stats.byPriority[p]}
              total={stats.total}
              color={PRIORITY_COLOR[p]}
            />
          ))}
        </ul>
      </Panel>

      <Panel title="Reports by block">
        <ul className="flex flex-col gap-2.5">
          {campuses.map((c) => (
            <BarRow
              key={c.id}
              label={c.name}
              count={stats.byCampus.get(c.id) ?? 0}
              total={stats.total}
              color={SINGLE_HUE}
            />
          ))}
        </ul>
      </Panel>

      <Panel title="Reports by type">
        <ul className="flex flex-col gap-2.5">
          {stats.byType.map(([type, count]) => (
            <BarRow
              key={type}
              label={type}
              count={count}
              total={stats.total}
              color={SINGLE_HUE}
            />
          ))}
        </ul>
      </Panel>

      <Panel title="Reports by hour of day">
        <div className="flex items-end gap-[3px]" style={{ height: 120 }}>
          {stats.byHour.map((count, hour) => (
            <div
              key={hour}
              // h-full matters: a percentage height on the bar below resolves
              // against this element, and without a definite height it
              // collapses to zero and the chart renders blank.
              className="flex h-full flex-1 flex-col items-center justify-end"
              title={`${hour}:00 — ${count} report${count === 1 ? "" : "s"}`}
            >
              <span
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(2, (count / maxHour) * 100)}%`,
                  backgroundColor: count > 0 ? SINGLE_HUE : "#e2e8f0",
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-500">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Peak hour:{" "}
          <span className="font-bold text-slate-900">
            {stats.byHour.indexOf(maxHour)}:00
          </span>{" "}
          with {maxHour} report{maxHour === 1 ? "" : "s"}.
        </p>
      </Panel>

      {/* Table view: the accessible equivalent of every chart above. */}
      <details className="rounded-2xl border border-slate-200 px-4 py-3">
        <summary className="tap cursor-pointer text-sm font-bold text-slate-900">
          View as table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2 font-bold text-slate-900">Measure</th>
                <th className="py-2 font-bold text-slate-900">Value</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              <Row label="Total reports" value={String(stats.total)} />
              <Row label="Open" value={String(stats.open)} />
              <Row label="Resolved" value={String(stats.resolved)} />
              <Row label="Critical" value={String(stats.byPriority.critical)} />
              <Row label="Urgent" value={String(stats.byPriority.urgent)} />
              <Row label="Normal" value={String(stats.byPriority.normal)} />
              <Row label="Median acknowledge" value={formatDuration(stats.medianAck)} />
              <Row label="Median resolve" value={formatDuration(stats.medianResolve)} />
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2">{label}</td>
      <td className="py-2 font-semibold text-slate-900">{value}</td>
    </tr>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 px-4 py-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Horizontal bar with the label and count always visible as text. */
function BarRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold capitalize text-slate-900">
          {label}
        </span>
        <span className="shrink-0 text-sm font-bold text-slate-900">
          {count}
          <span className="ml-1 text-xs font-medium text-slate-500">
            ({Math.round(pct)}%)
          </span>
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(count > 0 ? 3 : 0, pct)}%`, backgroundColor: color }}
        />
      </div>
    </li>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className="text-red-600">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
