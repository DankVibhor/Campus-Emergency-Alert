import SafeWalkPanel from "@/components/safe-walk";

export const metadata = {
  title: "Safe Walk — ASMT Aegis",
};

export default function SafeWalkPage() {
  return (
    <div className="px-safe pt-safe flex flex-col gap-5">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          Safe Walk
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Walking back alone? Start a timer. Check in when you arrive. If you do
          not, security is alerted automatically.
        </p>
      </header>

      <SafeWalkPanel />
    </div>
  );
}
