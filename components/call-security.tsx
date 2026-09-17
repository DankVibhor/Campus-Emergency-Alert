"use client";

import { Phone } from "lucide-react";

/**
 * Always-available voice fallback. A `tel:` link is handled by the dialer, so
 * this still works when the data connection is down but cellular voice is up —
 * the one path that must never depend on our backend.
 */
export default function CallSecurity() {
  const phone = process.env.NEXT_PUBLIC_SECURITY_PHONE || "+919999999999";

  return (
    <a
      href={`tel:${phone}`}
      aria-label="Call campus security now"
      className="press tap fixed right-4 z-50 flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-white shadow-lg shadow-red-600/30"
      style={{ bottom: "calc(var(--nav-h) + var(--sab) + 12px)" }}
    >
      <Phone size={20} strokeWidth={2.6} aria-hidden="true" />
      <span className="text-sm font-bold">Call Security</span>
    </a>
  );
}
