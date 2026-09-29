// npm run seed — catalog + 4-week history + demo scenarios, relative to the demo anchor (Wed 13:50 IST).
// Deterministic (seeded PRNG). Owner: Nikhil · N3
//
//   npm run seed                 wipe requests/notifications/audit, reseed, set the virtual clock to the anchor
//   npm run seed -- --dry-run    print what would be generated; no DB needed
//   SEED_ANCHOR=2026-10-07T13:50:00+05:30 npm run seed    pin the anchor instead of "next Wednesday"
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resetDemo } from "@/lib/seed/reset";
import { BUILDINGS, DEPARTMENTS, ROOMS, USERS } from "./catalog";
import { generateHistory, summarize } from "./history";
import { resolveAnchor } from "./lib";

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

  console.log(`Seeding ${url} — wiping activity, then reseeding catalog, history and scenarios…`);
  await resetDemo(db, anchor);
  console.log("Done. Virtual clock set to the anchor.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
