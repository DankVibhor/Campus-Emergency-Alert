import IncidentLive from "@/components/incident-live";

export const metadata = {
  title: "Incident Status — ASMT Aegis",
};

export default function IncidentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { justSent?: string };
}) {
  const justSent = searchParams.justSent === "1";

  return (
    <div className="px-safe pt-safe flex flex-col gap-5">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          {justSent ? "Report sent" : "Incident status"}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          {justSent
            ? "Help is being dispatched. Keep this page open for live updates."
            : "Live updates appear here automatically."}
        </p>
      </header>

      <IncidentLive incidentId={params.id} justSent={justSent} />
    </div>
  );
}
