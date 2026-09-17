"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="press tap mt-3 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 font-bold text-white print:hidden"
    >
      <Printer size={18} aria-hidden="true" />
      Print all QR codes
    </button>
  );
}
