"use client";

import { Phone } from "lucide-react";

/**
 * Always-available voice fallback, rendered as a full-width bar inside the
 * fixed bottom stack. It was previously a floating button, which overlapped
 * page content on small screens; sharing the stack with the nav makes overlap
 * structurally impossible.
 *
 * A bare `tel:` link is the fastest path to the dialer. The OS still shows its
 * own confirmation ("Call +91…?") and no web page can suppress that, so there
 * is deliberately no extra in-app step before it.
 */
export default function CallSecurity() {
  const phone = process.env.NEXT_PUBLIC_SECURITY_PHONE || "+919999999999";

  return (
    <a
      href={`tel:${phone}`}
      aria-label="Call Security now"
      onPointerDown={() => {
        // Android only; iOS has no Vibration API.
        try {
          navigator.vibrate?.(30);
        } catch {
          /* ignore */
        }
      }}
      className="flex items-center justify-center gap-2 bg-red-600 text-white active:bg-red-700"
      style={{ height: "var(--call-h)" }}
    >
      <Phone size={20} strokeWidth={2.8} aria-hidden="true" />
      <span className="text-base font-extrabold tracking-tight">
        Call Security
      </span>
    </a>
  );
}
