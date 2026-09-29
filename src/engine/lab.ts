// Deterministic multi-solver execution for Allocation Lab. Owner: Aaditya · A9
import type { EngineContext, EngineRequest, SolveResult, SolverName } from "@/contracts/engine";
import { getSolver } from "./solvers";

function isolatedContext(ctx: EngineContext): EngineContext {
  return {
    ...ctx,
    rooms: ctx.rooms.map((room) => ({
      ...room,
      features: [...room.features],
      hours: { ...room.hours, days: [...room.hours.days] },
      blackouts: room.blackouts.map((interval) => ({ ...interval })),
      booked: room.booked.map((booking) => ({ ...booking, interval: { ...booking.interval } })),
    })),
    buildings: ctx.buildings.map((building) => ({ ...building })),
    deptBuilding: { ...ctx.deptBuilding },
    weights: { ...ctx.weights },
  };
}

function explanation(results: SolveResult[], requests: EngineRequest[], ctx: EngineContext): string {
  const fcfs = results.find((result) => result.solver === "fcfs");
  const engine = results.find((result) => result.solver === "bnb");
  if (!fcfs || !engine) {
    return results.map((result) =>
      `${result.solver.toUpperCase()} placed ${result.metrics.placed}/${result.metrics.total} requests`,
    ).join(". ");
  }

  const roomCodes = new Map(ctx.rooms.map((room) => [room.id, room.code]));
  const fcfsAssignments = new Map(fcfs.assignments.map((assignment) => [assignment.requestId, assignment.roomId]));
  const engineAssignments = new Map(engine.assignments.map((assignment) => [assignment.requestId, assignment.roomId]));
  const labels = new Map(requests.map((request) => [request.id, request.label ?? "A request"]));
  const changes = requests.flatMap((request) => {
    const before = fcfsAssignments.get(request.id) ?? null;
    const after = engineAssignments.get(request.id) ?? null;
    if (before === after) return [];
    const label = labels.get(request.id) ?? "A request";
    if (before && after) return [`${label} moved from ${roomCodes.get(before) ?? "a room"} to ${roomCodes.get(after) ?? "a room"}`];
    if (after) return [`${label} gained ${roomCodes.get(after) ?? "a room"}`];
    if (before) return [`${label} was placed by FCFS in ${roomCodes.get(before) ?? "a room"} but not by B&B`];
    return [];
  });

  const summary = `FCFS placed ${fcfs.metrics.placed}/${fcfs.metrics.total}; B&B placed ${engine.metrics.placed}/${engine.metrics.total}`;
  return changes.length > 0 ? `${summary}. ${changes.join(". ")}.` : `${summary}.`;
}

export function runLabScenario(
  requests: EngineRequest[],
  ctx: EngineContext,
  solverNames: SolverName[],
): { results: SolveResult[]; explanation: string } {
  const results = solverNames.map((name) => getSolver(name).solve(
    requests.map((request) => ({
      ...request,
      features: [...request.features],
      ...(request.niceToHave ? { niceToHave: [...request.niceToHave] } : {}),
      history: { ...request.history },
      interval: { ...request.interval },
    })),
    isolatedContext(ctx),
  ));
  return { results, explanation: explanation(results, requests, ctx) };
}
