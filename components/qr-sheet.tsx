"use client";

import { useMemo, useState } from "react";
import { Download, Printer, QrCode } from "lucide-react";
import type { Campus, CampusLocation } from "@/lib/types";

interface Props {
  campuses: Campus[];
  locations: CampusLocation[];
}

export default function QrSheet({ campuses, locations }: Props) {
  const [campusFilter, setCampusFilter] = useState("all");
  const [size, setSize] = useState(420);

  const visible = useMemo(
    () =>
      campuses.filter((c) => campusFilter === "all" || c.id === campusFilter),
    [campuses, campusFilter],
  );

  function qrUrl(campusId: string, locationId: string, px: number) {
    return `/api/qr?campus=${campusId}&location=${locationId}&size=${px}`;
  }

  async function downloadOne(
    campus: Campus,
    location: CampusLocation,
  ): Promise<void> {
    try {
      const res = await fetch(qrUrl(campus.id, location.id, 1000));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `aegis-qr-${campus.code}-${location.label
        .replace(/\s+/g, "-")
        .toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      // Fall back to opening it; the user can long-press to save.
      window.open(qrUrl(campus.id, location.id, 1000), "_blank");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-col gap-3 print:hidden">
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
              Print size
            </span>
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="tap rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
            >
              <option value={300}>Small</option>
              <option value={420}>Medium</option>
              <option value={640}>Large</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="tap flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-4 font-bold text-white active:bg-slate-700"
        >
          <Printer size={18} aria-hidden="true" />
          Print these QR codes
        </button>
      </div>

      {/* Sheet */}
      <div className="qr-sheet flex flex-col gap-6">
        {visible.map((campus) => {
          const blockLocations = locations.filter(
            (l) => l.campus_id === campus.id,
          );
          return (
            <section key={campus.id} className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                <QrCode size={18} className="text-red-600" aria-hidden="true" />
                {campus.name}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {blockLocations.map((location) => (
                  <figure
                    key={location.id}
                    className="qr-card flex flex-col items-center gap-2 rounded-2xl border-2 border-slate-300 px-3 py-4"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrUrl(campus.id, location.id, size)}
                      alt={`QR code for ${campus.name}, ${location.label}`}
                      width={160}
                      height={160}
                      className="h-auto w-full max-w-[160px]"
                    />
                    <figcaption className="text-center">
                      <span className="block text-sm font-extrabold text-slate-900">
                        {location.label}
                      </span>
                      <span className="block text-xs font-semibold text-slate-600">
                        {campus.name}
                      </span>
                      <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-red-600">
                        Scan to report an emergency
                      </span>
                    </figcaption>
                    <button
                      type="button"
                      onClick={() => void downloadOne(campus, location)}
                      className="tap mt-1 flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 active:bg-slate-100 print:hidden"
                    >
                      <Download size={14} aria-hidden="true" />
                      Download PNG
                    </button>
                  </figure>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
