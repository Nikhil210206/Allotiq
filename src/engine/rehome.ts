// Disruption: re-home bookings affected by a blackout; offer/waitlist the rest. Owner: Aaditya · A10
import type { EngineContext, EngineRequest, Plan, SolveOptions, SolveResult } from "@/contracts/engine";
import { getSolver } from "./solvers";

/** Solve a same-time rehome using the production B&B solver and an isolated context. */
export function solveRehome(
  requests: EngineRequest[],
  ctx: EngineContext,
  mustPlace: string[] = requests.map((request) => request.id),
  options?: SolveOptions,
): { result: SolveResult; context: EngineContext } | null {
  const ids = new Set(requests.map((request) => request.id));
  if (ids.size !== requests.length) return null;

  const context: EngineContext = {
    ...ctx,
    rooms: ctx.rooms.map((room) => ({
      ...room,
      booked: room.booked.filter((booking) => !ids.has(booking.requestId) || !booking.movable),
    })),
  };
  // A checked-in request is never eligible to move, even if a caller accidentally
  // included it in the proposed rehome set.
  if (ctx.rooms.some((room) => room.booked.some((booking) => ids.has(booking.requestId) && !booking.movable))) return null;

  const result = getSolver("bnb").solve(requests, context, { ...options, mustPlace });
  if (result.timedOut || mustPlace.some((id) => !result.assignments.some((assignment) => assignment.requestId === id && assignment.roomId !== null))) {
    return null;
  }
  return { result, context };
}

/** Plan same-time rehomes for existing movable bookings; does not mutate inputs. */
export function rehomeRequests(requests: EngineRequest[], ctx: EngineContext, options?: SolveOptions): Plan | null {
  if (requests.length === 0) return null;
  const priorRooms = new Map<string, string>();
  for (const room of ctx.rooms) {
    for (const booking of room.booked) {
      if (requests.some((request) => request.id === booking.requestId)) {
        if (!booking.movable) return null;
        priorRooms.set(booking.requestId, room.id);
      }
    }
  }
  if (requests.some((request) => !priorRooms.has(request.id))) return null;

  const solved = solveRehome(requests, ctx, requests.map((request) => request.id), options);
  if (!solved) return null;
  const byId = new Map(solved.result.assignments.map((assignment) => [assignment.requestId, assignment]));
  const moves = requests
    .filter((request) => byId.get(request.id)?.roomId && byId.get(request.id)?.roomId !== priorRooms.get(request.id))
    .map((request) => ({
      requestId: request.id,
      roomId: byId.get(request.id)!.roomId,
      interval: request.interval,
    }))
    .sort((a, b) => a.requestId.localeCompare(b.requestId));
  if (moves.length === 0) return null;
  return { kind: "rehome", moves, unplaced: [], summary: `${moves.length} request${moves.length === 1 ? "" : "s"} rehomed at the same time.` };
}

export { previewDisruption } from "./disruption";
