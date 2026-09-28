"use client";
// Browser Supabase client (anon key + user session). Read-only use: Realtime + RLS-protected reads.
// Owner: Aditi · D2
import { createBrowserClient } from "@supabase/ssr";

export function browserDb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
