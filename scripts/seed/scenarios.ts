// Demo scenarios: clash-8 + dbms (Aaditya · A9), disruption + no-show (Aditi · D10).
// Runs after the catalog and history; use ids from ./catalog and times relative to `anchor` (Wed 13:50 IST).
import type { SupabaseClient } from "@supabase/supabase-js";

export async function seedScenarios(_db: SupabaseClient, _anchor: string): Promise<void> {
  console.warn("Scenarios skipped — not implemented yet (A9/D10)");
}
