import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { isStaff } from "@/lib/staff-auth";
import StaffGate from "@/components/staff-gate";
import AnalyticsView from "@/components/analytics-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics — ASMT Aegis",
};

export default function AnalyticsPage() {
  const staff = isStaff();

  return (
    <div className="px-safe pt-safe flex flex-col gap-5">
      <header className="pt-2">
        {staff ? (
          <Link
            href="/dashboard"
            className="tap mb-1 inline-flex items-center gap-1 text-sm font-bold text-slate-500 active:text-slate-900"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Dashboard
          </Link>
        ) : null}
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          Analytics
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          {staff
            ? "Response performance across all ASMT blocks."
            : "Sign in as staff to view response analytics."}
        </p>
      </header>

      {staff ? <AnalyticsView /> : <StaffGate />}
    </div>
  );
}
