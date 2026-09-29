"use client";
// Browser Supabase client (anon key + user session). Read-only use: Realtime + RLS-protected reads.
// Owner: Aditi · D2
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types.gen";

export function browserDb() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
