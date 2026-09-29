// POST /api/lab/run — Run FCFS vs engine (vs ILP) with traces + metrics
// Owner: Aaditya · Task A9
import { LabRunSchema, type LabRunResponse } from "@/contracts/api";
import type { EngineContext, EngineRequest } from "@/contracts/engine";
import { runLabScenario } from "@/engine/lab";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import type { Json } from "@/lib/db/types.gen";
import { apiError } from "@/lib/http";
import { loadEngineContext } from "@/server/engine-adapter";
import { loadLabRequestStates, loadLabScenario } from "@/server/lab-adapter";

function scenarioWindow(requests: EngineRequest[]) {
  let start = requests[0].interval.start;
  let end = requests[0].interval.end;
  for (const request of requests.slice(1)) {
    if (Date.parse(request.interval.start) < Date.parse(start)) start = request.interval.start;
    if (Date.parse(request.interval.end) > Date.parse(end)) end = request.interval.end;
  }
  return { start, end };
}

function withoutScenarioMovableBookings(ctx: EngineContext, requestIds: Set<string>): EngineContext {
  return {
    ...ctx,
    rooms: ctx.rooms.map((room) => ({
      ...room,
      booked: room.booked.filter((booking) => !booking.movable || !requestIds.has(booking.requestId)),
    })),
  };
}

export async function POST(request: Request) {
  try {
    await requireRole("admin");
  } catch (error) {
    return error as Response;
  }

  const body = await request.json().catch(() => undefined);
  const parsed = LabRunSchema.safeParse(body);
  if (!parsed.success || parsed.data.solvers.length === 0 || new Set(parsed.data.solvers).size !== parsed.data.solvers.length) {
    return apiError(400, "BAD_REQUEST", "Choose a scenario and one or more distinct solvers.");
  }
  if (parsed.data.solvers.includes("ilp")) {
    return apiError(501, "SOLVER_UNAVAILABLE", "The ILP solver is planned for a later phase.");
  }

  try {
    const scenario = await loadLabScenario(parsed.data.scenarioId);
    if (!scenario) return apiError(404, "SCENARIO_NOT_FOUND", "That Lab scenario was not found.");

    const requestStates = await loadLabRequestStates(scenario.requests.map((item) => item.id));
    const baseContext = await loadEngineContext(scenarioWindow(scenario.requests));
    const scenarioContext = withoutScenarioMovableBookings(
      baseContext,
      new Set(scenario.requests.map((engineRequest) => engineRequest.id)),
    );
    const startedAt = performance.now();
    const result = runLabScenario(scenario.requests, scenarioContext, parsed.data.solvers);
    const elapsedMs = Math.round(performance.now() - startedAt);
    const input = {
      scenarioId: scenario.id,
      solvers: parsed.data.solvers,
      requests: scenario.requests,
      requestStates,
      context: scenarioContext,
    };
    const output = result;
    const { data, error } = await db()
      .from("engine_runs")
      .insert({
        kind: "lab",
        solver: parsed.data.solvers.join(","),
        input: input as unknown as Json,
        output: output as unknown as Json,
        ms: elapsedMs,
        created_at: baseContext.now,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("Unable to record Lab run");

    return Response.json({ runId: data.id, ...result } satisfies LabRunResponse);
  } catch {
    return apiError(500, "LAB_RUN_FAILED", "Couldn't run that Lab scenario right now.");
  }
}
