// POST /api/jobs/tick — Minute job: expire holds, auto-release no-shows, complete finished bookings, refill waitlist.
// Called by Supabase pg_cron every minute via pg_net. Header x-cron-secret required.
// Owner: Aditi · Task D8
import { db } from "@/lib/db/server";
import { getNow } from "@/lib/clock";
import { transition } from "@/lib/requests/transition";
import { notify } from "@/lib/notify";
import { TIMING } from "@/contracts/domain";

export async function POST(req: Request) {
  // Verify cron secret — protects against arbitrary invocations.
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  const now = await getNow();
  const nowMs = Date.parse(now);
  const supabase = db();

  let expired = 0;
  let released = 0;
  let completed = 0;
  let refilled = 0;

  // ── 1. EXPIRE: pending holds past their expiry ──────────────────────────────
  const { data: toExpire } = await supabase
    .from("requests")
    .select("id, requester_id, title")
    .eq("status", "pending")
    .lt("hold_expires_at", now);

  for (const r of toExpire ?? []) {
    try {
      await transition(r.id, "expired", { actorId: null, action: "auto_expire" });
      await notify(r.requester_id as string, {
        kind: "expired",
        title: `"${r.title}" hold expired`,
        body: "Your booking hold has expired. Please submit a new request.",
        requestId: r.id,
      }).catch(() => {});
      expired++;
    } catch {
      // Individual failure must not stop the rest of the tick.
    }
  }

  // ── 2. AUTO-RELEASE: approved bookings with no check-in past start + grace ──
  const graceMs = TIMING.noShowGraceMinutes * 60_000;
  const { data: toRelease } = await supabase
    .from("requests")
    .select("id, requester_id, title, during, room_id")
    .eq("status", "approved")
    .is("checked_in_at", null);

  const freedSlots: Array<{ roomId: string; start: string; end: string }> = [];

  for (const r of toRelease ?? []) {
    const dur = r.during as string;
    const clean = dur.replace(/^[\[(]|[\])]$/g, "");
    const [start, end] = clean.split(",").map((s: string) => s.replace(/^"|"$/g, "").trim());
    const startMs = Date.parse(start);

    if (nowMs >= startMs + graceMs) {
      try {
        await transition(r.id, "auto_released", { actorId: null, action: "auto_release" });
        await notify(r.requester_id as string, {
          kind: "auto_released",
          title: `"${r.title}" auto-released`,
          body: "No check-in detected — the room has been released back to the pool.",
          requestId: r.id,
        }).catch(() => {});
        released++;

        if (r.room_id) {
          // Freed from now until the end of the booking window
          freedSlots.push({ roomId: r.room_id as string, start: now, end });
        }
      } catch {
        // Individual failure must not stop the rest of the tick.
      }
    }
  }

  // ── 3. COMPLETE: checked-in bookings whose end time has passed ──────────────
  const { data: toComplete } = await supabase
    .from("requests")
    .select("id, requester_id, title, during, room_id")
    .eq("status", "checked_in");

  for (const r of toComplete ?? []) {
    const dur = r.during as string;
    const clean = dur.replace(/^[\[(]|[\])]$/g, "");
    const [, end] = clean.split(",").map((s: string) => s.replace(/^"|"$/g, "").trim());
    const endMs = Date.parse(end);

    if (nowMs >= endMs) {
      try {
        await transition(r.id, "completed", { actorId: null, action: "auto_complete" });
        completed++;
        if (r.room_id) {
          freedSlots.push({ roomId: r.room_id as string, start: now, end });
        }
      } catch {
        // Individual failure must not stop the rest of the tick.
      }
    }
  }

  // ── 4. WAITLIST REFILL: for each freed slot, pick the best waitlisted request ─
  for (const freed of freedSlots) {
    const { data: waitlisted } = await supabase
      .from("requests")
      .select("id, requester_id, title, during, headcount, room_type, required_features, min_systems")
      .eq("status", "waitlisted")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });

    for (const w of waitlisted ?? []) {
      const dur = w.during as string;
      const clean = dur.replace(/^[\[(]|[\])]$/g, "");
      const [wStart, wEnd] = clean.split(",").map((s: string) => s.replace(/^"|"$/g, "").trim());

      // Check if the waitlisted interval fits in the freed window
      if (Date.parse(wStart) >= Date.parse(freed.start) && Date.parse(wEnd) <= Date.parse(freed.end)) {
        // Check the freed room is still feasible (basic capacity/feature check skipped here;
        // the DB trigger will reject if it's not, so we just try to assign).
        try {
          await transition(w.id, "approved", {
            actorId: null,
            action: "waitlist_fill",
            patch: { room_id: freed.roomId },
          });
          await notify(w.requester_id as string, {
            kind: "waitlist_filled",
            title: `"${w.title}" — a room opened up!`,
            body: "Your waitlisted request has been automatically approved.",
            requestId: w.id,
          }).catch(() => {});
          refilled++;
          break; // Only fill one waitlisted request per freed slot per tick
        } catch {
          continue; // DB rejected it (e.g. overlap), try next
        }
      }
    }
  }

  return Response.json({ ok: true, expired, released, completed, refilled, at: now });
}
