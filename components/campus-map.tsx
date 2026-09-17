"use client";

import { useMemo } from "react";
import type { Campus, Incident, Priority } from "@/lib/types";

/**
 * Illustrative campus plan. Deliberately not a real map: a static schematic
 * loads instantly, works offline, and reads more clearly on a phone than a
 * tile map zoomed into three adjacent buildings.
 */

const BLOCK_FILL = "#f8fafc";
const BLOCK_STROKE = "#cbd5e1";

const DOT_COLOR: Record<Priority, string> = {
  critical: "#dc2626",
  urgent: "#f59e0b",
  normal: "#16a34a",
};

interface Props {
  campuses: Campus[];
  incidents: Incident[];
}

// Layout slots, in draw order, keyed by campus code where available.
const SLOTS = [
  { x: 14, y: 20, w: 92, h: 70, label: "Main" },
  { x: 118, y: 20, w: 92, h: 70, label: "Academic" },
  { x: 66, y: 104, w: 92, h: 62, label: "Hostel" },
];

export default function CampusMap({ campuses, incidents }: Props) {
  const perCampus = useMemo(() => {
    const map = new Map<string, Incident[]>();
    for (const i of incidents) {
      if (!i.campus_id) continue;
      const list = map.get(i.campus_id) ?? [];
      list.push(i);
      map.set(i.campus_id, list);
    }
    return map;
  }, [incidents]);

  return (
    <section className="rounded-2xl border border-slate-200 px-4 py-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        Campus overview
      </h2>

      <svg
        viewBox="0 0 224 180"
        className="mt-2 w-full"
        role="img"
        aria-label="Schematic plan of the three ASMT blocks with active incident markers"
      >
        {/* Pathways */}
        <path
          d="M60 90 L60 104 M164 90 L164 104 M60 100 L164 100"
          stroke="#e2e8f0"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />

        {campuses.slice(0, 3).map((campus, index) => {
          const slot = SLOTS[index];
          if (!slot) return null;
          const list = perCampus.get(campus.id) ?? [];

          // Most severe incident colours the block outline.
          const worst: Priority | null = list.reduce<Priority | null>(
            (acc, i) => {
              const p = (i.final_priority ?? "normal") as Priority;
              if (acc === null) return p;
              if (acc === "critical" || p === "critical") return "critical";
              if (acc === "urgent" || p === "urgent") return "urgent";
              return acc;
            },
            null,
          );

          return (
            <g key={campus.id}>
              <rect
                x={slot.x}
                y={slot.y}
                width={slot.w}
                height={slot.h}
                rx="8"
                fill={BLOCK_FILL}
                stroke={worst ? DOT_COLOR[worst] : BLOCK_STROKE}
                strokeWidth={worst ? 2.5 : 1.5}
              />
              <text
                x={slot.x + slot.w / 2}
                y={slot.y + 20}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#0f172a"
              >
                {campus.name.replace(/\s*Block$/i, "")}
              </text>
              <text
                x={slot.x + slot.w / 2}
                y={slot.y + 34}
                textAnchor="middle"
                fontSize="9"
                fill="#64748b"
              >
                {list.length === 0
                  ? "clear"
                  : `${list.length} active`}
              </text>

              {/* Incident dots, wrapped onto two rows */}
              {list.slice(0, 8).map((incident, dotIndex) => {
                const priority = (incident.final_priority ?? "normal") as Priority;
                const perRow = 4;
                const row = Math.floor(dotIndex / perRow);
                const col = dotIndex % perRow;
                const count = Math.min(list.length - row * perRow, perRow);
                const spacing = 14;
                const startX =
                  slot.x + slot.w / 2 - ((count - 1) * spacing) / 2;
                return (
                  <circle
                    key={incident.id}
                    cx={startX + col * spacing}
                    cy={slot.y + 48 + row * 13}
                    r="5"
                    fill={DOT_COLOR[priority]}
                  >
                    <title>
                      {`${priority} — ${incident.emergency_type}`}
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>

      <ul className="mt-2 flex items-center justify-center gap-4">
        {(["critical", "urgent", "normal"] as Priority[]).map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: DOT_COLOR[p] }}
            />
            <span className="text-[11px] font-semibold capitalize text-slate-500">
              {p}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
