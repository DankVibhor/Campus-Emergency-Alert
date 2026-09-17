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

      {staff ? <DashboardLive /> : <StaffGate />}
    </div>
  );
}
