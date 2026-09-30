// Minute job, called by pg_cron → /api/jobs/tick and after every clock jump. Owner: Aditi · D8
// 1) expire stale holds  2) auto-release no-shows  3) complete finished bookings  4) refill the waitlist into freed rooms
import "server-only";
import { TIMING } from "@/contracts/domain";
import { getNow } from "@/lib/clock";
import { db } from "@/lib/db/server";
import { parseRange, rowToRequest } from "@/lib/db/mappers";
import { notify } from "@/lib/notify";
import { placementViolations } from "@/lib/requests/placement";
import { transition } from "@/lib/requests/transition";

export interface TickResult {
  expired: number;
  released: number;
  refilled: number;
  completed: number;
  at: string;
}

export async function runTick(): Promise<TickResult> {
  const supabase = db();
  const now = await getNow();
  const nowMs = Date.parse(now);
  const result: TickResult = { expired: 0, released: 0, refilled: 0, completed: 0, at: now };

  // One failing row must never stop the rest of the tick.
  const each = async <T>(rows: T[] | null, fn: (row: T) => Promise<void>) => {
    for (const row of rows ?? []) {
      try {
        await fn(row);
      } catch (e) {
        console.error("[tick]", e instanceof Error ? e.message : e);
      }
    }
  };

  // ── 1. EXPIRE: pending holds past their expiry ────────────────────────────────
  const { data: toExpire } = await supabase
    .from("requests")
    .select("id, requester_id, title, status")
    .in("status", ["pending", "bumped"])
    .lte("hold_expires_at", now);

  await each(toExpire, async (r) => {
    await transition(r.id, "expired", { actorId: null, expectedStatus: r.status as any, action: "auto_expire" });
    await notify(r.requester_id, {
      kind: "expired",
      title: `"${r.title}" hold expired`,
      body: "Your booking hold has expired. Please submit a new request.",
      requestId: r.id,
    });
    result.expired++;
  });

  // Rooms freed this tick, with the window they are free for (from now until the booking would have ended).
  const freed: Array<{ roomId: string; start: string; end: string }> = [];

  // ── 2. AUTO-RELEASE: approved bookings with no check-in past start + grace ────
  const { data: toRelease } = await supabase
    .from("requests")
    .select("id, requester_id, title, during, room_id")
    .eq("status", "approved")
    .is("checked_in_at", null);

  await each(toRelease, async (r) => {
    const { start, end } = parseRange(r.during);
    if (nowMs < Date.parse(start) + TIMING.noShowGraceMinutes * 60_000) return;

    await transition(r.id, "auto_released", { actorId: null, expectedStatus: "approved", action: "auto_release" });
    await notify(r.requester_id, {
      kind: "auto_released",
      title: `"${r.title}" auto-released`,
      body: "No check-in detected — the room has been released back to the pool.",
      requestId: r.id,
    });
    result.released++;
    if (r.room_id) freed.push({ roomId: r.room_id, start: now, end });
  });

  // ── 3. COMPLETE: checked-in bookings whose end time has passed ────────────────
  const { data: toComplete } = await supabase
    .from("requests")
    .select("id, during, room_id")
    .eq("status", "checked_in");

  await each(toComplete, async (r) => {
    const { end } = parseRange(r.during);
    if (nowMs < Date.parse(end)) return;

    await transition(r.id, "completed", { actorId: null, expectedStatus: "checked_in", action: "auto_complete" });
    result.completed++;
    if (r.room_id) freed.push({ roomId: r.room_id, start: now, end });
  });

  // ── 4. WAITLIST REFILL: best waitlisted request that fits each freed room ─────
  if (freed.length > 0) {
    const { data: waitlisted } = await supabase
      .from("requests")
      .select("*")
      .eq("status", "waitlisted")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });
    const queue = (waitlisted ?? []).map(rowToRequest);

    for (const slot of freed) {
      for (const [i, w] of queue.entries()) {
        // Must lie inside the freed window, and pass every hard constraint for that room
        // (capacity, systems, features, type, access, hours, blackouts, overlap) — not just capacity.
        if (Date.parse(w.during.start) < Date.parse(slot.start) || Date.parse(w.during.end) > Date.parse(slot.end)) continue;
        if ((await placementViolations(supabase, w, slot.roomId, now)).length > 0) continue;

        try {
          await transition(w.id, "approved", {
            actorId: null,
            expectedStatus: "waitlisted",
            action: "waitlist_fill",
            patch: { room_id: slot.roomId },
          });
        } catch {
          continue; // lost a race (e.g. overlap) — try the next one
        }
        await notify(w.requesterId, {
          kind: "waitlist_filled",
          title: `"${w.title}" — a room opened up!`,
          body: "Your waitlisted request has been automatically approved.",
          requestId: w.id,
        });
        queue.splice(i, 1); // one request can only fill one room
        result.refilled++;
        break; // one waitlisted request per freed slot
      }
    }
  }

  return result;
}
