// Deterministic multi-solver execution for Allocation Lab. Owner: Aaditya · A9
import type { EngineContext, EngineRequest, SolveResult, SolverName } from "@/contracts/engine";
import { counterfactual } from "./explain";
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

  const roomLookup = new Map(ctx.rooms.map((room) => [room.id, room.code]));
  return counterfactual(fcfs, engine, requests, roomLookup);
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
