import Link from "next/link";
import { Siren, Activity, ShieldCheck, QrCode } from "lucide-react";

export default function HomePage() {
  return (
    <div className="px-safe pt-safe flex flex-col gap-6">
      <header className="pt-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={22} className="text-red-600" aria-hidden="true" />
          <span className="text-sm font-bold uppercase tracking-wide text-slate-500">
            ASMT Aegis
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight text-slate-900">
          Campus Emergency Response
        </h1>
        <p className="mt-2 text-base leading-relaxed text-slate-600">
          Anangpuria School of Management and Technology. Report an emergency and
          the right responder is alerted in seconds.
        </p>
      </header>

      <Link
        href="/report"
        className="press flex flex-col items-center justify-center gap-3 rounded-2xl bg-red-600 px-6 py-10 text-white shadow-lg shadow-red-600/25"
      >
        <Siren size={56} strokeWidth={2.4} aria-hidden="true" />
        <span className="text-2xl font-extrabold">Report Emergency</span>
        <span className="text-sm font-medium text-red-100">
          Medical · Fire · Security · Accident
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/status"
          className="press tap flex flex-col gap-2 rounded-2xl border border-slate-200 px-5 py-5"
        >
          <Activity size={24} className="text-slate-900" aria-hidden="true" />
          <span className="text-base font-bold text-slate-900">My Reports</span>
          <span className="text-xs text-slate-500">Track live status</span>
        </Link>
        <Link
          href="/dashboard"
          className="press tap flex flex-col gap-2 rounded-2xl border border-slate-200 px-5 py-5"
        >
          <QrCode size={24} className="text-slate-900" aria-hidden="true" />
          <span className="text-base font-bold text-slate-900">Responders</span>
          <span className="text-xs text-slate-500">Staff dashboard</span>
        </Link>
      </div>

      <section className="rounded-2xl bg-slate-50 px-5 py-4">
        <h2 className="text-sm font-bold text-slate-900">How it works</h2>
        <ol className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-600">
          <li>1. Scan the QR code posted in your block, or tap Report.</li>
          <li>2. Describe what is happening — 10 seconds is enough.</li>
          <li>3. Aegis classifies urgency and alerts the on-duty responder.</li>
          <li>4. Track acknowledgement and resolution live.</li>
        </ol>
      </section>
    </div>
  );
}
