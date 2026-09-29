// POST /api/admin/clock — Time machine: advance or jump the virtual clock. Admin only.
// After the jump it runs the minute tick straight away, so holds expire and no-shows release now
// instead of waiting for the next real cron minute.
// Owner: Aditi · Task D3
import { requireRole } from "@/lib/auth/session";
import { advanceClock, getNow, setClockOffset } from "@/lib/clock";
import { apiError } from "@/lib/http";
import { ClockSchema } from "@/contracts/api";
import { db } from "@/lib/db/server";
import { runTick, type TickResult } from "@/lib/jobs/tick";

export async function POST(req: Request) {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = ClockSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  if ("advanceMin" in parsed.data) {
    await advanceClock(parsed.data.advanceMin);
  } else {
    const targetMs = Date.parse(parsed.data.setTo);
    if (isNaN(targetMs)) return apiError(400, "BAD_REQUEST", "Invalid setTo timestamp");
    const offsetMs = targetMs - Date.now();
    await setClockOffset(offsetMs);
  }

  // A failing tick must not undo or hide the clock change.
  let tick: TickResult | null = null;
  try {
    tick = await runTick();
  } catch (e) {
    console.error("[admin/clock] tick failed:", e instanceof Error ? e.message : e);
  }

  const now = await getNow();
  const supabase = db();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "clock_offset_ms")
    .maybeSingle();

  const offsetMs = data?.value ? Number(data.value) : 0;
  return Response.json({ now, offsetMs, tick });
}
