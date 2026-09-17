import { Suspense } from "react";
import ReportForm from "@/components/report-form";

export const metadata = {
  title: "Report an Emergency — ASMT Aegis",
};

export default function ReportPage() {
  return (
    <div className="px-safe pt-safe flex flex-col gap-5">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          Report an Emergency
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Takes about 15 seconds. Hold SOS to send.
        </p>
      </header>

      {/* useSearchParams needs a Suspense boundary to stay statically rendered. */}
      <Suspense fallback={<div className="h-96" />}>
        <ReportForm />
      </Suspense>
    </div>
  );
}
