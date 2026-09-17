import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminClient } from "@/lib/supabase-admin";
import { isStaff } from "@/lib/staff-auth";
import type { Campus, CampusLocation } from "@/lib/types";
import QrSheet from "@/components/qr-sheet";
import StaffGate from "@/components/staff-gate";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "QR Code Generator — ASMT Aegis",
};

export default async function AdminQrPage() {
  if (!isStaff()) {
    return (
      <div className="px-safe pt-safe flex flex-col gap-5">
        <header className="pt-2">
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
            QR Code Generator
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Sign in as staff to generate and print location QR codes.
          </p>
        </header>
        <StaffGate />
      </div>
    );
  }

  const db = getAdminClient();
  const [{ data: campusRows }, { data: locationRows }] = await Promise.all([
    db.from("campuses").select("*").order("name"),
    db.from("locations").select("*").order("label"),
  ]);

  return (
    <div className="px-safe pt-safe flex flex-col gap-5">
      <header className="pt-2 print:hidden">
        <Link
          href="/dashboard"
          className="tap mb-1 inline-flex items-center gap-1 text-sm font-bold text-slate-500 active:text-slate-900"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Dashboard
        </Link>
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          QR Code Generator
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          One code per location. Print them, cut along the cards, and post one
          in each block. Scanning opens the report form with that block and
          floor already selected.
        </p>
      </header>

      <QrSheet
        campuses={(campusRows ?? []) as Campus[]}
        locations={(locationRows ?? []) as CampusLocation[]}
      />
    </div>
  );
}
