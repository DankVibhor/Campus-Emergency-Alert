"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";

export default function StaffGate() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [exchanging, setExchanging] = useState(false);

  // Returning from a magic link leaves a Supabase session in this browser but
  // no staff cookie, so trade one for the other before showing the form.
  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || cancelled) return;

      setExchanging(true);
      try {
        const res = await fetch("/api/staff/sso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: token }),
        });
        if (res.ok && !cancelled) router.refresh();
      } catch {
        /* fall back to the PIN form */
      } finally {
        if (!cancelled) setExchanging(false);
      }
    }

    void exchange();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Sign in failed.");
      // Server component re-reads the cookie on refresh.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/dashboard`
              : undefined,
        },
      });
      if (authError) throw new Error(authError.message);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 px-5 py-6 text-center">
        <ShieldCheck size={32} className="text-red-600" aria-hidden="true" />
        <h2 className="text-lg font-extrabold text-slate-900">Responders only</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          {exchanging
            ? "Verifying your sign-in link…"
            : "Sign in to view live incidents and acknowledge alerts."}
        </p>
      </div>

      <form onSubmit={submitPin} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <KeyRound size={15} aria-hidden="true" />
            Staff PIN
          </span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="text"
            autoComplete="one-time-code"
            placeholder="Enter staff PIN"
            className="tap rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !pin}
          className="press tap rounded-2xl bg-red-600 px-6 py-4 text-base font-bold text-white disabled:opacity-50"
        >
          {busy ? "Checking…" : "Enter dashboard"}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          or
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {sent ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-semibold text-green-800">Check your email</p>
          <p className="mt-1 text-sm text-green-700">
            A sign-in link was sent to {email}.
          </p>
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <Mail size={15} aria-hidden="true" />
              Staff email
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@asmt.edu.in"
              className="tap rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !email}
            className="press tap rounded-2xl border-2 border-slate-300 bg-white px-6 py-4 text-base font-bold text-slate-900 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
