// Priority bumping: rehome blockers at the same time first; bump-with-offer only if pending or > 24h away. Owner: Aaditya · A10
import type { EngineBooking, EngineContext, EngineRequest, Plan, SolveOptions } from "@/contracts/engine";
import { TIMING } from "@/contracts/domain";
import { hardViolations } from "./feasibility";
import { alternatives } from "./alternatives";
import { overlaps } from "./time";
import { solveRehome } from "./rehome";

const BUMP_NOTICE_MS = TIMING.bumpNoticeHours * 60 * 60_000;

function canBump(booking: EngineBooking, request: EngineRequest, ctx: EngineContext): boolean {
  if (!booking.movable || booking.priority >= request.priority) return false;
  if (booking.status === "pending") return true;
  return booking.status === "approved" && Date.parse(booking.interval.start) - Date.parse(ctx.now) > BUMP_NOTICE_MS;
}

/**
 * Build a deterministic same-time allocation for a priority waitlisted request.
 * Eligible lower-priority blockers are first offered same-time B&B rehomes;
 * only blockers that B&B cannot keep placed become bumped-with-offer moves.
 */
export function tryBump(
  request: EngineRequest,
  ctx: EngineContext,
  relatedRequests: EngineRequest[] = [],
  options?: SolveOptions,
): Plan | null {
  if (new Set(relatedRequests.map((item) => item.id)).size !== relatedRequests.length) return null;
  const relatedById = new Map(relatedRequests.filter((item) => item.id !== request.id).map((item) => [item.id, item]));
  const blockerById = new Map<string, { booking: EngineBooking; request: EngineRequest; roomId: string }>();

  for (const room of ctx.rooms) {
    // A room is a possible same-time placement only when every non-overlap
    // hard constraint already passes; overlapping movable bookings are the
    // only constraint this operation is allowed to resolve.
    if (hardViolations(room, request, ctx).some((violation) => violation.code !== "OVERLAP")) continue;
    for (const booking of room.booked) {
      if (!overlaps(request.interval, booking.interval) || !canBump(booking, request, ctx)) continue;
      const blocker = relatedById.get(booking.requestId);
      if (!blocker || blocker.priority !== booking.priority) continue;
      blockerById.set(blocker.id, { booking, request: blocker, roomId: room.id });
    }
  }

  const blockers = [...blockerById.values()].sort((a, b) =>
    a.booking.priority - b.booking.priority ||
    a.booking.status.localeCompare(b.booking.status) ||
    a.request.createdAt.localeCompare(b.request.createdAt) ||
    a.request.id.localeCompare(b.request.id),
  );
  const solveRequests = [request, ...blockers.map((blocker) => blocker.request)];
  const solved = solveRehome(solveRequests, ctx, [request.id], options);
  if (!solved) return null;

  const assignments = new Map(solved.result.assignments.map((assignment) => [assignment.requestId, assignment]));
  const target = assignments.get(request.id);
  if (!target?.roomId) return null;

  // Materialize the tentative placements in a derived context so offers for
  // any bumped requests reflect the complete proposed plan, not stale blockers.
  const finalContext: EngineContext = {
    ...solved.context,
    rooms: solved.context.rooms.map((room) => ({ ...room, booked: [...room.booked] })),
  };
  const finalRooms = new Map(finalContext.rooms.map((room) => [room.id, room]));
  const bookingById = new Map(blockers.map((blocker) => [blocker.request.id, blocker.booking]));
  for (const item of solveRequests) {
    const assignment = assignments.get(item.id);
    if (!assignment?.roomId) continue;
    const room = finalRooms.get(assignment.roomId);
    if (!room) return null;
    const prior = bookingById.get(item.id);
    room.booked.push({
      requestId: item.id,
      interval: item.interval,
      priority: item.priority,
      status: prior?.status ?? "approved",
      movable: true,
    });
  }

  const moves: Plan["moves"] = [{ requestId: request.id, roomId: target.roomId, interval: request.interval }];
  let bumped = 0;
  for (const blocker of blockers) {
    const assignment = assignments.get(blocker.request.id);
    if (!assignment) return null;
    if (assignment.roomId) {
      if (assignment.roomId !== blocker.roomId) {
        moves.push({ requestId: blocker.request.id, roomId: assignment.roomId, interval: blocker.request.interval });
      }
      continue;
    }
    const offerContext: EngineContext = {
      ...finalContext,
      rooms: finalContext.rooms.map((room) => ({
        ...room,
        booked: room.booked.filter((booking) => booking.requestId !== blocker.request.id),
      })),
    };
    const offer = alternatives(blocker.request, offerContext, blocker.roomId);
    if (offer.sameRoomOtherSlot.length === 0 && offer.similarRoomSameSlot.length === 0) return null;
    moves.push({
      requestId: blocker.request.id,
      roomId: null,
      interval: blocker.request.interval,
      status: "bumped",
      offers: offer,
    });
    bumped++;
  }

  const kind: Plan["kind"] = bumped > 0 ? "bump_with_offer" : "waitlist_fill";
  return {
    kind,
    moves: moves.sort((a, b) => a.requestId.localeCompare(b.requestId)),
    unplaced: [],
    summary: bumped > 0
      ? `Placed the priority request; ${bumped} lower-priority request${bumped === 1 ? " was" : "s were"} bumped with alternatives.`
      : "Placed the request without bumping another booking.",
  };
}
