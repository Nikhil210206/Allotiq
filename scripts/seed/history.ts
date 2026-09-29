// Writes the generated 4-week history (src/lib/seed/history.ts) to Supabase. Owner: Nikhil · N3
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateHistory, toRow } from "@/lib/seed/history";

export * from "@/lib/seed/history";

export async function seedHistory(db: SupabaseClient, anchor: string): Promise<void> {
  const rows = generateHistory(anchor).map(toRow);
  for (let i = 0; i < rows.length; i += 250) {
    const { error } = await db.from("requests").insert(rows.slice(i, i + 250));
    if (error) throw new Error(`requests ${i}–${i + 250}: ${error.message}`);
  }
}
