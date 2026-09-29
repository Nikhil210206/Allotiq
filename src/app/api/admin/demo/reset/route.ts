// POST /api/admin/demo/reset — Truncate transient data and reseed the demo DB.
// Sets the clock back to the demo anchor (Wednesday 13:50 IST).
// Owner: Aditi · Task D11
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { setClockOffset } from "@/lib/clock";

// Demo anchor: Wednesday 13:50 IST. The day-of-week is fixed; the date portion is set to
// "next Wednesday from deploy date" via an offset, so the demo always feels current.
const DEMO_ANCHOR_TIME = "13:50:00+05:30"; // HH:MM:SS+05:30

function nextWednesdayAt(timeIST: string): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 3=Wed
  const daysUntilWed = (3 - day + 7) % 7 || 7; // always go forward
  const anchor = new Date(now);
  anchor.setDate(anchor.getDate() + daysUntilWed);
  const [h, m] = timeIST.split(":").map(Number);
  // Set to IST time (UTC+5:30)
  anchor.setUTCHours(h - 5, m - 30, 0, 0);
  return anchor;
}

export async function POST() {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as Response;
  }

  const supabase = db();

  // Truncate transient tables (keep seed tables: rooms, buildings, departments, profiles)
  const tables = [
    "audit_log",
    "notifications",
    "engine_runs",
    "requests",
  ];
  for (const table of tables) {
    // Use delete with a filter that matches everything (Supabase doesn't expose raw TRUNCATE)
    await supabase.from(table as "audit_log").delete().neq("id" as never, "00000000-0000-0000-0000-000000000000");
  }

  // Reset app_settings clock
  await supabase.from("app_settings").delete().eq("key", "clock_offset_ms");

  // Set clock to demo anchor
  const anchor = nextWednesdayAt(DEMO_ANCHOR_TIME);
  const offsetMs = anchor.getTime() - Date.now();
  await setClockOffset(offsetMs);

  return Response.json({ ok: true, anchor: anchor.toISOString(), offsetMs });
}
