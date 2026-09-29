// GET /api/rooms/[id]/availability?date=YYYY-MM-DD
// Returns 30-min slots for the day with state: free | held | booked | blackout | closed
// Owner: Aditi · Task D4
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import type { AvailabilitySlot } from "@/contracts/api";
import { TZ } from "@/contracts/domain";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Sign in required.");

  const { id } = await params;
  const url = new URL(req.url);
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return apiError(400, "BAD_REQUEST", "date query param required (YYYY-MM-DD)");

  const supabase = db();

  // Fetch the room to get open/close hours and days
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("open_time, close_time, open_days")
    .eq("id", id)
    .single();
  if (roomErr || !room) return apiError(404, "NOT_FOUND", "Room not found.");

  // Day boundary in IST → UTC
  const dayStart = new Date(`${date}T00:00:00+05:30`);
  const dayEnd = new Date(`${date}T23:59:59+05:30`);

  // Fetch active bookings for this room on this date
  const { data: bookings } = await supabase
    .from("requests")
    .select("id, during, status, title")
    .eq("room_id", id)
    .in("status", ["pending", "approved", "checked_in"])
    .gte("during->>0", dayStart.toISOString().slice(0, 10))  // rough pre-filter
    .lte("during->>1", dayEnd.toISOString());

  // Fetch blackouts for this room on this date
  const { data: blackouts } = await supabase
    .from("room_blackouts")
    .select("during, reason")
    .eq("room_id", id);

  // Determine the ISO weekday for the date (1=Mon … 7=Sun)
  const dayOfWeek = new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: TZ,
  });
  const dayMap: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
  const isoWeekday = dayMap[dayOfWeek] ?? 1;
  const isOpen = (room.open_days as number[]).includes(isoWeekday);

  // Build 30-min slots from open to close (or 08:00–20:00 if closed day)
  const slots: AvailabilitySlot[] = [];
  const [openH, openM] = (room.open_time as string).split(":").map(Number);
  const [closeH, closeM] = (room.close_time as string).split(":").map(Number);
  const openMin = openH * 60 + openM;
  const closeMin = closeH * 60 + closeM;

  for (let m = openMin; m < closeMin; m += 30) {
    const slotStart = new Date(`${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00+05:30`);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);

    let state: AvailabilitySlot["state"] = isOpen ? "free" : "closed";
    let requestId: string | undefined;
    let label: string | undefined;

    // Check blackouts
    for (const b of blackouts ?? []) {
      const [bs, be] = (b.during as string).replace(/["[\]]/g, "").split(",");
      const bStart = new Date(bs);
      const bEnd = new Date(be);
      if (slotStart < bEnd && slotEnd > bStart) {
        state = "blackout";
        label = (b as Record<string, unknown>).reason as string;
        break;
      }
    }

    // Check bookings (overrides blackout label but not the blackout itself for actives)
    if (state !== "blackout") {
      for (const bk of bookings ?? []) {
        const dur = bk.during as string;
        const [bs, be] = dur.replace(/["[\]]/g, "").split(",");
        const bStart = new Date(bs);
        const bEnd = new Date(be);
        if (slotStart < bEnd && slotEnd > bStart) {
          state = bk.status === "pending" ? "held" : "booked";
          requestId = bk.id as string;
          label = bk.title as string;
          break;
        }
      }
    }

    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      state,
      requestId,
      label,
    });
  }

  return Response.json(slots);
}
