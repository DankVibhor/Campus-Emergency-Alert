import Link from "next/link";
import { ChevronRight, QrCode } from "lucide-react";
import { isStaff } from "@/lib/staff-auth";
import StaffGate from "@/components/staff-gate";
import DashboardLive from "@/components/dashboard-live";
import SignOutButton from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Responder Dashboard — ASMT Aegis",
};

export default function DashboardPage() {
  const staff = isStaff();

  return (
    <div className="px-safe pt-safe flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
            Responder Dashboard
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {staff
              ? "Live incidents across all ASMT blocks."
              : "Restricted to campus responders."}
          </p>
        </div>
        {staff ? <SignOutButton /> : null}
      </header>

      {staff ? (
        <>
          <Link
            href="/admin/qr"
            className="tap flex items-center justify-between rounded-2xl border-2 border-slate-200 px-4 py-3 active:bg-slate-100"
          >
            <span className="flex items-center gap-2">
              <QrCode size={20} className="text-red-600" aria-hidden="true" />
              <span className="text-left">
                <span className="block text-sm font-bold text-slate-900">
                  Generate QR codes
                </span>
                <span className="block text-xs text-slate-500">
                  Print and post one in each block
                </span>
              </span>
            </span>
            <ChevronRight size={18} className="text-slate-300" aria-hidden="true" />
          </Link>
          <DashboardLive />
        </>
      ) : (
        <StaffGate />
      )}
    </div>
  );
}
