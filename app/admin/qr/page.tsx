import { getAdminClient } from "@/lib/supabase-admin";
import type { Campus, CampusLocation } from "@/lib/types";
import PrintButton from "@/components/print-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Printable QR Codes — ASMT Aegis",
};

export default async function AdminQrPage() {
  const db = getAdminClient();

  const [{ data: campusRows }, { data: locationRows }] = await Promise.all([
    db.from("campuses").select("*").order("name"),
    db.from("locations").select("*").order("label"),
  ]);

  const campuses = (campusRows ?? []) as Campus[];
  const locations = (locationRows ?? []) as CampusLocation[];

  return (
    <div className="px-safe pt-safe flex flex-col gap-6">
      <header className="pt-2 print:hidden">
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          Printable QR Codes
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          One code per location. Print, cut, and post them in each block. Each
          code opens the report form with that location pre-selected.
        </p>
        <PrintButton />
      </header>

      <div className="qr-sheet flex flex-col gap-8">
        {campuses.map((campus) => {
          const blockLocations = locations.filter(
            (l) => l.campus_id === campus.id,
          );
          return (
            <section key={campus.id} className="flex flex-col gap-3">
              <h2 className="text-base font-extrabold text-slate-900">
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
                      src={`/api/qr?campus=${campus.id}&location=${location.id}&size=420`}
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
