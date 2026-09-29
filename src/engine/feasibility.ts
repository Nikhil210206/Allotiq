// Hard constraints. Returns every violation so the UI can say "why not". Owner: Aaditya · A1
import { ACTIVE_STATUSES } from "@/contracts/domain";
import type { EngineContext, EngineRequest, EngineRoom, Violation } from "@/contracts/engine";
import { overlaps, withinHours } from "./time";

/**
 * Return every hard violation that prevents `req` from being placed in `room`.
 * The list is exhaustive — callers can show *all* reasons, not just the first.
 */
export function hardViolations(room: EngineRoom, req: EngineRequest, _ctx: EngineContext): Violation[] {
  const vs: Violation[] = [];

  // ── CAPACITY ──────────────────────────────────────────────
  if (room.capacity < req.headcount) {
    vs.push({
      code: "CAPACITY",
      message: `Only ${room.capacity} seats (needs ${req.headcount})`,
    });
  }

  // ── SYSTEMS ───────────────────────────────────────────────
  if (req.minSystems > 0 && room.systems < req.minSystems) {
    vs.push({
      code: "SYSTEMS",
      message: `Only ${room.systems} systems (needs ${req.minSystems})`,
    });
  }

  // ── FEATURE ───────────────────────────────────────────────
  for (const f of req.features) {
    if (!room.features.includes(f)) {
      vs.push({
        code: "FEATURE",
        message: `Missing required feature: ${f}`,
      });
    }
  }

  // ── TYPE ──────────────────────────────────────────────────
  if (req.roomType && room.type !== req.roomType) {
    vs.push({
      code: "TYPE",
      message: `Room is ${room.type}, needs ${req.roomType}`,
    });
  }

  // ── ACCESS ────────────────────────────────────────────────
  if (room.access === "dept_only" && room.deptId !== null && req.deptId !== room.deptId) {
    vs.push({
      code: "ACCESS",
      message: `Room restricted to department ${room.deptId}`,
    });
  }

  // ── HOURS ─────────────────────────────────────────────────
  if (!withinHours(req.interval, room.hours)) {
    vs.push({
      code: "HOURS",
      message: `Outside room hours (${room.hours.open}–${room.hours.close})`,
    });
  }

  // ── BLACKOUT ──────────────────────────────────────────────
  for (const b of room.blackouts) {
    if (overlaps(req.interval, b)) {
      vs.push({
        code: "BLACKOUT",
        message: "Overlaps a blackout period",
      });
      break; // one blackout violation is enough
    }
  }

  // ── OVERLAP ───────────────────────────────────────────────
  // A booking occupies the slot only if its status is active (pending, approved, checked_in).
  const activeSet = new Set<string>(ACTIVE_STATUSES);
  for (const bk of room.booked) {
    if (activeSet.has(bk.status) && overlaps(req.interval, bk.interval)) {
      vs.push({
        code: "OVERLAP",
        message: `Clashes with booking ${bk.requestId}`,
      });
      break; // one overlap violation is enough
    }
  }

  return vs;
}

export function isFeasible(room: EngineRoom, req: EngineRequest, ctx: EngineContext): boolean {
  return hardViolations(room, req, ctx).length === 0;
}
