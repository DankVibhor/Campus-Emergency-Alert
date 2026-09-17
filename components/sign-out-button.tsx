"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    // Clear both paths: the staff cookie and any Supabase magic-link session.
    await fetch("/api/staff/login", { method: "DELETE" }).catch(() => {});
    await supabase.auth.signOut().catch(() => {});
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      aria-label="Sign out"
      className="press tap flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
    >
      <LogOut size={15} aria-hidden="true" />
      Sign out
    </button>
  );
}
