import MyReportsList from "@/components/my-reports-list";
import PendingReports from "@/components/pending-reports";

export const metadata = {
  title: "My Reports — ASMT Aegis",
};

export default function StatusPage() {
  return (
    <div className="px-safe pt-safe flex flex-col gap-5">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          My Reports
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Live status of everything you have reported from this phone.
        </p>
      </header>

      <PendingReports />
      <MyReportsList />
    </div>
  );
}
