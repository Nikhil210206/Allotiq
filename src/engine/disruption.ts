// Deterministic disruption replanning. Owner: Aaditya · A11
import { ACTIVE_STATUSES, TIMING } from "@/contracts/domain";
import type { Interval } from "@/contracts/domain";
import type { EngineContext, EngineRequest, Plan, SolveOptions } from "@/contracts/engine";
import { alternatives } from "./alternatives";
import { tryBump } from "./bump";
import { isFeasible } from "./feasibility";
import { overlaps } from "./time";
import { getSolver } from "./solvers";

const BUMP_NOTICE_MS = TIMING.bumpNoticeHours * 60 * 60_000;

/** The active allocations that actually overlap a room closure (half-open intervals). */
export function affectedDisruptionRequests(roomId: string, during: Interval, ctx: EngineContext) {
  const room = ctx.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return [];
  return room.booked
    .filter((booking) => ACTIVE_STATUSES.includes(booking.status as (typeof ACTIVE_STATUSES)[number]) && overlaps(booking.interval, during))
    .map((booking) => ({ booking, roomId: room.id }))
    .sort((a, b) => a.booking.requestId.localeCompare(b.booking.requestId));
}

function canBump(request: EngineRequest, ctx: EngineContext): boolean {
  const booking = ctx.rooms.flatMap((room) => room.booked).find((item) => item.requestId === request.id);
  if (!booking?.movable) return false;
  if (booking.status === "pending") return true;
  return booking.status === "approved" && Date.parse(booking.interval.start) - Date.parse(ctx.now) > BUMP_NOTICE_MS;
}

function blockedPlan(
  affectedIds: string[],
  requestById: Map<string, EngineRequest>,
  ctx: EngineContext,
  roomId: string,
  summary: string,
): Plan {
  return {
    kind: "disruption",
    moves: [],
    unplaced: affectedIds.map((id) => ({
      requestId: id,
      alternatives: requestById.has(id)
        ? alternatives(requestById.get(id)!, ctx, roomId)
        : { sameRoomOtherSlot: [], similarRoomSameSlot: [] },
    })),
    summary,
  };
}

/**
 * Replan every active booking overlapping a proposed room blackout.
 * Movable bookings are solved together by B&B; a leftover may be bumped only
 * when the existing A10 status/timing rules permit it and safe alternatives exist.
 */
export function previewDisruption(
  roomId: string,
  during: Interval,
  ctx: EngineContext,
  requests: EngineRequest[] = [],
  options?: SolveOptions,
): Plan {
  const room = ctx.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return { kind: "disruption", moves: [], unplaced: [], summary: "The affected room is unavailable." };

  const affected = affectedDisruptionRequests(roomId, during, ctx);
  const affectedIds = affected.map(({ booking }) => booking.requestId);
  if (affectedIds.length === 0) {
    return { kind: "disruption", moves: [], unplaced: [], summary: "No active bookings overlap this disruption." };
  }

  const requestById = new Map(requests.map((request) => [request.id, request]));
  const duplicateOrMissing = new Set(requests.map((request) => request.id)).size !== requests.length ||
    affectedIds.some((id) => !requestById.has(id));
  if (duplicateOrMissing) {
    return blockedPlan(affectedIds, requestById, ctx, roomId,
      "The disruption plan is incomplete because booking details could not be loaded.");
  }

  const affectedSet = new Set(affectedIds);
  const context: EngineContext = {
    ...ctx,
    rooms: ctx.rooms.map((candidate) => ({
      ...candidate,
      blackouts: candidate.id === roomId ? [...candidate.blackouts, during] : [...candidate.blackouts],
      booked: candidate.booked.filter((booking) => !affectedSet.has(booking.requestId) || !booking.movable),
    })),
  };
  const affectedRequests = affectedIds.map((id) => requestById.get(id)!);
  const movableRequests = affectedRequests.filter((request) => {
    const booking = affected.find((item) => item.booking.requestId === request.id)?.booking;
    return booking?.movable === true;
  });
  const fixedRequests = affectedRequests.filter((request) => !movableRequests.some((item) => item.id === request.id));

  const moves: Plan["moves"] = [];
  const blockedIds = fixedRequests.map((request) => request.id);
  const assignedIds = new Set<string>();
  if (movableRequests.length > 0) {
    const result = getSolver("bnb").solve(movableRequests, context, options);
    if (result.timedOut || result.assignments.length !== movableRequests.length) {
      return blockedPlan(affectedIds, requestById, context, roomId,
        "The disruption could not be fully planned before the solver limit; no partial plan can be applied.");
    }

    const finalContext: EngineContext = {
      ...context,
      rooms: context.rooms.map((candidate) => ({ ...candidate, booked: [...candidate.booked] })),
    };
    const finalRooms = new Map(finalContext.rooms.map((candidate) => [candidate.id, candidate]));
    const assigned = new Map(result.assignments.map((assignment) => [assignment.requestId, assignment]));

    // Validate and materialize all B&B placements before constructing any plan moves.
    for (const request of movableRequests) {
      const assignment = assigned.get(request.id);
      if (!assignment) {
        return blockedPlan(affectedIds, requestById, context, roomId,
          "The disruption solver returned an incomplete plan.");
      }
      if (!assignment.roomId) continue;
      const destination = finalRooms.get(assignment.roomId);
      if (!destination || !isFeasible(destination, request, finalContext)) {
        return blockedPlan(affectedIds, requestById, context, roomId,
          "The disruption plan failed final availability validation.");
      }
      const prior = affected.find((item) => item.booking.requestId === request.id)!.booking;
      destination.booked.push({
        requestId: request.id,
        interval: request.interval,
        priority: request.priority,
        status: prior.status,
        movable: true,
      });
    }

    for (const request of movableRequests) {
      const assignment = assigned.get(request.id)!;
      if (assignment.roomId) {
        moves.push({ requestId: request.id, roomId: assignment.roomId, interval: request.interval });
        assignedIds.add(request.id);
        continue;
      }

      // If an existing booking blocks every rehome, defer displacement decisions
      // to the A10 bump implementation so its priority and 24-hour policy apply.
      const related = requests.filter((candidate) => candidate.id !== request.id);
      const bumpPlan = tryBump(request, finalContext, related, options);
      const targetMove = bumpPlan?.moves.find((move) => move.requestId === request.id && move.roomId !== null);
      if (!targetMove) {
        const offer = alternatives(request, finalContext, roomId);
        if (canBump(request, ctx) && (offer.sameRoomOtherSlot.length > 0 || offer.similarRoomSameSlot.length > 0)) {
          moves.push({ requestId: request.id, roomId: null, interval: request.interval, status: "bumped", offers: offer });
          assignedIds.add(request.id);
          continue;
        }
        blockedIds.push(request.id);
        continue;
      }

      for (const move of bumpPlan!.moves) {
        const previous = affected.find((item) => item.booking.requestId === move.requestId)?.booking ??
          ctx.rooms.flatMap((candidate) => candidate.booked).find((booking) => booking.requestId === move.requestId);
        if (!previous) {
          blockedIds.push(request.id);
          break;
        }
        for (const candidate of finalContext.rooms) {
          candidate.booked = candidate.booked.filter((booking) => booking.requestId !== move.requestId);
        }
        if (move.roomId) {
          const destination = finalRooms.get(move.roomId);
          if (!destination) {
            blockedIds.push(request.id);
            break;
          }
          destination.booked.push({
            requestId: move.requestId,
            interval: move.interval,
            priority: previous.priority,
            status: previous.status,
            movable: true,
          });
        }
        moves.push(move);
        assignedIds.add(move.requestId);
      }
    }
  }

  // A checked-in request, a near-term approved request, or one with no safe offer
  // blocks apply for the complete disruption. Its alternatives remain visible.
  const unplaced = [...new Set(blockedIds)].filter((id) => !assignedIds.has(id)).sort().map((id) => ({
    requestId: id,
    alternatives: alternatives(requestById.get(id)!, context, roomId),
  }));
  moves.sort((a, b) => a.requestId.localeCompare(b.requestId));
  const rehomed = moves.filter((move) => move.roomId !== null).length;
  const offered = moves.filter((move) => move.status === "bumped").length;
  const summary = unplaced.length > 0
    ? `${rehomed} booking${rehomed === 1 ? " was" : "s were"} rehomed and ${offered} offered alternatives; ${unplaced.length} affected booking${unplaced.length === 1 ? " is" : "s are"} blocked, so the complete disruption cannot be applied.`
    : `${rehomed} booking${rehomed === 1 ? " was" : "s were"} rehomed and ${offered} offered alternatives.`;
  return { kind: "disruption", moves, unplaced, summary };
}
