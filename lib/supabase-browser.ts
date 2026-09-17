import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Add them to .env.local and to the Vercel project settings.",
  );
}

/**
 * Anon-key client for the browser. Every call it makes is subject to RLS,
 * so this can only read public reference data, file incidents, and follow
 * an incident's timeline.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    // Emergencies are low-volume; a tighter rate keeps updates snappy.
    params: { eventsPerSecond: 10 },
  },
});
