// npm run seed — catalog + 4-week history + demo scenarios, relative to the demo anchor (Wed 13:50 IST).
// Deterministic (seeded PRNG). Owner: Nikhil · N3
//
//   npm run seed                 wipe requests/notifications/audit, reseed, set the virtual clock to the anchor
//   npm run seed -- --dry-run    print what would be generated; no DB needed
//   SEED_ANCHOR=2026-10-07T13:50:00+05:30 npm run seed    pin the anchor instead of "next Wednesday"
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUILDINGS, DEPARTMENTS, ROOMS, USERS, seedCatalog } from "./catalog";
import { generateHistory, seedHistory, summarize } from "./history";
import { resolveAnchor } from "./lib";
import { seedScenarios } from "./scenarios";

/** Clears everything a demo run creates. Catalog rows are upserted, not wiped. */
export async function wipeActivity(db: SupabaseClient): Promise<void> {
  const steps = [
    db.from("notifications").delete().not("id", "is", null),
    db.from("audit_log").delete().gte("id", 0),
    db.from("requests").delete().not("id", "is", null),
    db.from("room_blackouts").delete().not("id", "is", null),
    db.from("engine_runs").delete().not("id", "is", null),
    db.from("demo_tokens").delete().not("token", "is", null),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw new Error(`wipe: ${error.message}`);
  }
}

export async function setDemoClock(db: SupabaseClient, anchor: string): Promise<void> {
  const { error } = await db.from("app_settings").upsert([
    { key: "demo_anchor", value: anchor },
    { key: "clock_offset_ms", value: Date.parse(anchor) - Date.now() },
  ]);
  if (error) throw new Error(`app_settings: ${error.message}`);
}

async function main() {
  const anchor = resolveAnchor();
  const summary = summarize(generateHistory(anchor));
  console.log(`Anchor ${anchor}`);
  console.log(
    `Catalog: ${BUILDINGS.length} buildings · ${DEPARTMENTS.length} departments · ${ROOMS.length} rooms · ${USERS.length} users`,
  );
  console.log(
    `History: ${summary.total} requests · ghost rate ${(summary.ghostRate * 100).toFixed(1)}% · ${summary.unmet} unmet`,
    summary.byStatus,
  );
  if (process.argv.includes("--dry-run")) return;

  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing — fill .env.local, or run with --dry-run");
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Seeding ${url} — wiping requests, notifications and the audit log…`);
  await wipeActivity(db);
  await seedCatalog(db);
  await seedHistory(db, anchor);
  await seedScenarios(db, anchor);
  await setDemoClock(db, anchor);
  console.log("Done. Virtual clock set to the anchor.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
