// POST /api/lab/apply — Commit the engine plan via apply_plan()
// Owner: Aaditya · Task A9
import { IntervalSchema } from "@/contracts/api";
import type { EngineContext, EngineRequest, Plan } from "@/contracts/engine";
import type { Interval } from "@/contracts/domain";
import { isFeasible } from "@/engine/feasibility";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { loadEngineContext, persistPlan } from "@/server/engine-adapter";
import { LabRunInputSchema, loadLabRequestStates } from "@/server/lab-adapter";
import { z } from "zod";

const ApplySchema = z.object({ runId: z.uuid() }).strict();
const LabOutputSchema = z.object({
  results: z.array(z.object({
    solver: z.enum(["fcfs", "greedy", "bnb", "ilp"]),
    timedOut: z.boolean(),
    assignments: z.array(z.object({
      requestId: z.uuid(),
      roomId: z.uuid().nullable(),
      interval: IntervalSchema.optional(),
    }).passthrough()),
  }).passthrough()),
  explanation: z.string(),
}).passthrough();

function sameInterval(a: Interval, b: Interval): boolean {
  return Date.parse(a.start) === Date.parse(b.start) && Date.parse(a.end) === Date.parse(b.end);
}

function assignmentWindow(requests: EngineRequest[], intervals: Map<string, Interval>): Interval {
  const values = requests.map((request) => intervals.get(request.id) ?? request.interval);
  return {
    start: values.reduce((best, value) => Date.parse(value.start) < Date.parse(best) ? value.start : best, values[0].start),
    end: values.reduce((best, value) => Date.parse(value.end) > Date.parse(best) ? value.end : best, values[0].end),
  };
}

function validateCurrentFeasibility(
  requests: EngineRequest[],
  assignments: { requestId: string; roomId: string | null; interval?: Interval }[],
  ctx: EngineContext,
): boolean {
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const requestIds = new Set(requests.map((request) => request.id));
  const intervalById = new Map(assignments.map((assignment) => [
    assignment.requestId,
    assignment.interval ?? requestById.get(assignment.requestId)!.interval,
  ]));
  const rooms = ctx.rooms.map((room) => ({
    ...room,
    booked: room.booked.filter((booking) => !booking.movable || !requestIds.has(booking.requestId)),
  }));
  const roomById = new Map(rooms.map((room) => [room.id, room]));

  for (const assignment of assignments) {
    const request = requestById.get(assignment.requestId);
    const room = assignment.roomId ? roomById.get(assignment.roomId) : undefined;
    if (!request || !room) return false;
    const interval = intervalById.get(request.id)!;
    const placedRequest = { ...request, interval };
    if (!isFeasible(room, placedRequest, ctx)) return false;
    room.booked.push({
      requestId: request.id,
      interval,
      priority: request.priority,
      status: "approved",
      movable: true,
    });
  }
  return true;
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireRole("admin");
  } catch (error) {
    return error as Response;
  }

  const body = await request.json().catch(() => undefined);
  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Provide a valid Lab run ID.");

  try {
    const { data: run, error: runError } = await db()
      .from("engine_runs")
      .select("input, output")
      .eq("id", parsed.data.runId)
      .eq("kind", "lab")
      .maybeSingle();
    if (runError) throw new Error("Unable to load Lab run");
    if (!run) return apiError(404, "LAB_RUN_NOT_FOUND", "That Lab run was not found.");

    const input = LabRunInputSchema.safeParse(run.input);
    const output = LabOutputSchema.safeParse(run.output);
    if (!input.success || !output.success) return apiError(409, "LAB_PLAN_UNAVAILABLE", "That Lab run cannot be applied.");
    if (!input.data.solvers.includes("bnb")) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "Apply requires a B&B result in the Lab run.");
    }
    const result = output.data.results.find((item) => item.solver === "bnb");
    if (!result || result.timedOut || result.assignments.length !== input.data.requests.length || result.assignments.some((item) => item.roomId === null)) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "Only a complete, placeable Lab plan can be applied.");
    }

    const requestById = new Map(input.data.requests.map((item) => [item.id, item]));
    const assignmentIds = new Set(result.assignments.map((item) => item.requestId));
    if (assignmentIds.size !== requestById.size || [...requestById.keys()].some((id) => !assignmentIds.has(id))) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "The Lab plan does not match its scenario requests.");
    }

    const currentStates = await loadLabRequestStates([...requestById.keys()]);
    const currentById = new Map(currentStates.map((state) => [state.id, state]));
    const snapshotById = new Map(input.data.requestStates.map((state) => [state.id, state]));
    const scenarioOnlyIds = [...requestById.keys()].filter((id) => !snapshotById.has(id));
    if (scenarioOnlyIds.some((id) => currentById.has(id))) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "A scenario request changed after this Lab run.");
    }
    if (scenarioOnlyIds.length > 0) {
      return apiError(409, "LAB_INSERTS_UNSUPPORTED", "Scenario-only requests cannot be applied because the current plan contract has no insert payload.");
    }
    if (currentStates.length !== requestById.size) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "A request changed or disappeared after this Lab run.");
    }
    if (input.data.requests.some((request) => {
      const before = snapshotById.get(request.id);
      const current = currentById.get(request.id);
      return !before || !current || before.status !== current.status || before.roomId !== current.roomId || !sameInterval(before.interval, current.interval);
    })) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "A request changed after this Lab run.");
    }
    if (currentStates.some((row) => row.status !== "pending" && row.status !== "approved")) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "Only pending or approved requests can be moved by a Lab plan.");
    }

    const assignmentIntervals = new Map(result.assignments.map((assignment) => [
      assignment.requestId,
      assignment.interval ?? requestById.get(assignment.requestId)!.interval,
    ]));
    const currentContext = await loadEngineContext(assignmentWindow(input.data.requests, assignmentIntervals));
    if (!validateCurrentFeasibility(input.data.requests, result.assignments, currentContext)) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "The Lab plan is no longer feasible with current room availability.");
    }
    const finalStates = await loadLabRequestStates([...requestById.keys()]);
    const finalById = new Map(finalStates.map((state) => [state.id, state]));
    if (finalStates.length !== currentStates.length || currentStates.some((state) => {
      const finalState = finalById.get(state.id);
      return !finalState || finalState.status !== state.status || finalState.roomId !== state.roomId || !sameInterval(finalState.interval, state.interval);
    }) || finalStates.some((state) => state.status !== "pending" && state.status !== "approved")) {
      return apiError(409, "LAB_PLAN_UNAVAILABLE", "A request changed while the Lab plan was being validated.");
    }

    const plan: Plan = {
      kind: "lab",
      moves: result.assignments.map((assignment) => ({
        requestId: assignment.requestId,
        roomId: assignment.roomId,
        interval: assignment.interval ?? requestById.get(assignment.requestId)!.interval,
      })),
      unplaced: [],
      summary: `Applied Lab run ${parsed.data.runId}`,
    };
    await persistPlan(plan, actor.id, "lab_apply");
    return Response.json({ ok: true } as const);
  } catch {
    return apiError(500, "LAB_APPLY_FAILED", "Couldn't apply that Lab plan.");
  }
}
