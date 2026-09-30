// Demo reset: wipe what a demo run creates, reseed catalog + 4-week history + scenarios, and put the
// virtual clock back on the anchor. Shared by `npm run seed` and POST /api/admin/demo/reset. Owner: Nikhil · N3
// No "server-only" here on purpose — the seed script runs outside Next.
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedCatalog } from "../../../scripts/seed/catalog";
import { seedHistory } from "../../../scripts/seed/history";
import { seedScenarios } from "../../../scripts/seed/scenarios";
import { resolveAnchor } from "./random";

/**
 * Clears everything a demo run creates. Catalog rows are upserted, not wiped, and demo_tokens (the
 * judges' join links) are configuration, so they survive a reset.
 */
export async function wipeActivity(db: SupabaseClient): Promise<void> {
  // Three steps in order: notifications and audit rows reference requests, so they go first.
  const ok = (table: string, { error }: { error: { message: string } | null }) => {
    if (error) throw new Error(`wipe ${table}: ${error.message}`);
  };
  const [notifications, audit] = await Promise.all([
    db.from("notifications").delete().not("id", "is", null),
    db.from("audit_log").delete().gte("id", 0),
  ]);
  ok("notifications", notifications);
  ok("audit_log", audit);
  ok("requests", await db.from("requests").delete().not("id", "is", null));
  const [blackouts, runs] = await Promise.all([
    db.from("room_blackouts").delete().not("id", "is", null),
    db.from("engine_runs").delete().not("id", "is", null),
  ]);
  ok("room_blackouts", blackouts);
  ok("engine_runs", runs);
}

export async function setDemoClock(db: SupabaseClient, anchor: string): Promise<void> {
  const { error } = await db.from("app_settings").upsert([
    { key: "demo_anchor", value: anchor },
    { key: "clock_offset_ms", value: Date.parse(anchor) - Date.now() },
  ]);
  if (error) throw new Error(`app_settings: ${error.message}`);
}

/** Returns the anchor the clock was set to. */
export async function resetDemo(db: SupabaseClient, anchor: string = resolveAnchor()): Promise<string> {
  await wipeActivity(db);
  await seedCatalog(db, anchor);
  await seedHistory(db, anchor);
  await seedScenarios(db, anchor);
  await setDemoClock(db, anchor);
  return anchor;
}
