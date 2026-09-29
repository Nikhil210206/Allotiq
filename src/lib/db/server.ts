// Server-only Supabase client with the service role (bypasses RLS). Never import from client components.
// Owner: Aditi · D1
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing — see .env.example");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
