// Offer a freed slot to the best waitlisted request. Owner: Aaditya · A10
import type { Interval } from "@/contracts/domain";
import type { EngineContext, EngineRequest, Plan } from "@/contracts/engine";
import { isFeasible } from "./feasibility";

/** Select the best request wholly contained in a freed interval, using project priority/tie rules. */
export function refillFreedSlot(
  roomId: string,
  freed: Interval,
  waitlisted: EngineRequest[],
  ctx: EngineContext,
): Plan | null {
  const room = ctx.rooms.find((candidate) => candidate.id === roomId);
  if (!room || Date.parse(freed.start) >= Date.parse(freed.end)) return null;

  const ordered = [...waitlisted].sort((a, b) =>
    b.priority - a.priority ||
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    a.id.localeCompare(b.id),
  );
  const chosen = ordered.find((request) =>
    Date.parse(request.interval.start) >= Date.parse(freed.start) &&
    Date.parse(request.interval.end) <= Date.parse(freed.end) &&
    Date.parse(request.interval.start) < Date.parse(request.interval.end) &&
    isFeasible(room, request, ctx),
  );
  if (!chosen) return null;

  return {
    kind: "waitlist_fill",
    moves: [{ requestId: chosen.id, roomId, interval: chosen.interval, status: "approved" }],
    unplaced: [],
    summary: `Placed the highest-priority eligible waitlisted request in ${room.code}.`,
  };
}
