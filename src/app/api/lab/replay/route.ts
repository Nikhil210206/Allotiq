// POST /api/lab/replay — deterministically replay a recorded Lab input with selected solvers.
import { z } from "zod";
import type { EngineContext, EngineRequest, SolveResult, SolverName } from "@/contracts/engine";
import { runLabScenario } from "@/engine/lab";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { LabRunInputSchema } from "@/server/lab-adapter";

const BodySchema = z.object({ runId: z.uuid(), solvers: z.array(z.enum(["fcfs", "greedy", "bnb", "ilp"])).min(1).max(4) }).strict()
  .superRefine((v, c) => { if (new Set(v.solvers).size !== v.solvers.length) c.addIssue({ code: "custom", path: ["solvers"], message: "Choose distinct solvers" }); });
const ScoreSchema = z.object({ capacityFit: z.number(), featureMatch: z.number(), proximity: z.number(), scarcity: z.number(), preference: z.number(), energy: z.number(), weights: z.object({ capacityFit: z.number(), featureMatch: z.number(), proximity: z.number(), scarcity: z.number(), preference: z.number(), energy: z.number() }).strict(), total: z.number(), wastedSeats: z.number(), notes: z.array(z.string()) }).strict();
const AssignmentSchema = z.object({ requestId: z.uuid(), roomId: z.uuid().nullable(), interval: z.object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) }).optional(), score: ScoreSchema.optional(), reason: z.string().optional() }).strict();
const TraceSchema = z.union([
  z.object({ type: z.literal("try"), requestId: z.uuid(), roomId: z.uuid() }).strict(),
  z.object({ type: z.literal("place"), requestId: z.uuid(), roomId: z.uuid() }).strict(),
  z.object({ type: z.literal("blocked"), requestId: z.uuid(), reason: z.string() }).strict(),
  z.object({ type: z.literal("incumbent"), objective: z.number(), placed: z.number() }).strict(),
]);
const SolveResultSchema = z.object({
  solver: z.enum(["fcfs", "greedy", "bnb", "ilp"]), assignments: z.array(AssignmentSchema),
  metrics: z.object({ placed: z.number(), total: z.number(), priorityPlaced: z.number(), priorityTotal: z.number(), seatsWasted: z.number(), buildingsActive: z.number(), objective: z.number(), ms: z.number(), nodes: z.number() }).strict(),
  timedOut: z.boolean(), trace: z.array(TraceSchema),
}).strict();

export async function POST(request: Request) {
  try { await requireRole("admin"); } catch (error) { return error as Response; }
  const body = await request.json().catch(() => undefined);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Provide a Lab run and distinct solver choices.");
  try {
    const { data, error } = await db().from("engine_runs").select("id, kind, input, output").eq("id", parsed.data.runId).maybeSingle();
    if (error) throw new Error("Lab replay lookup failed");
    if (!data || data.kind !== "lab") return apiError(404, "LAB_RUN_NOT_FOUND", "That Lab run was not found.");
    const input = LabRunInputSchema.safeParse(data.input);
    if (!input.success || !input.data.context) return apiError(409, "REPLAY_CONTEXT_UNAVAILABLE", "This Lab run predates replay snapshots and cannot be replayed.");
    if (parsed.data.solvers.includes("ilp")) return apiError(501, "SOLVER_UNAVAILABLE", "The ILP solver is planned for a later phase.");
    const context = input.data.context as EngineContext;
    const baselineOutput = z.object({ results: z.array(SolveResultSchema) }).passthrough().safeParse(data.output);
    if (!baselineOutput.success || baselineOutput.data.results.length === 0) return apiError(409, "REPLAY_BASELINE_UNAVAILABLE", "This Lab run has no valid baseline result to compare.");
    const baseline = baselineOutput.data.results as SolveResult[];
    const baselineSolvers = baseline.map((result) => result.solver);
    if (new Set(baselineSolvers).size !== baselineSolvers.length || baselineSolvers.length !== input.data.solvers.length ||
      input.data.solvers.some((solver) => !baselineSolvers.includes(solver))) {
      return apiError(409, "REPLAY_BASELINE_UNAVAILABLE", "This Lab run has no valid baseline result to compare.");
    }
    const requestIds = new Set(input.data.requests.map((item) => item.id));
    const roomIds = new Set(context.rooms.map((room) => room.id));
    const validBaseline = baseline.every((result) => {
      const ids = result.assignments.map((assignment) => assignment.requestId);
      return input.data.solvers.includes(result.solver) && ids.length === requestIds.size && new Set(ids).size === requestIds.size && ids.every((id) => requestIds.has(id)) &&
        result.assignments.every((assignment) => assignment.roomId === null || roomIds.has(assignment.roomId));
    });
    if (!validBaseline) return apiError(409, "REPLAY_BASELINE_UNAVAILABLE", "This Lab run has no valid baseline result to compare.");
    const replay = runLabScenario(input.data.requests as EngineRequest[], context, parsed.data.solvers as SolverName[]);
    const baselineResult = baseline.find((r) => r.solver === "bnb") ?? baseline[0];
    const replayResult = replay.results.find((result) => result.solver !== baselineResult?.solver)
      ?? replay.results.find((result) => result.solver === baselineResult?.solver)
      ?? replay.results[0];
    if (!baselineResult || !replayResult) return apiError(409, "REPLAY_BASELINE_UNAVAILABLE", "This Lab run has no valid baseline result to compare.");
    const before = new Map((baselineResult?.assignments ?? []).map((a) => [a.requestId, a.roomId]));
    const after = new Map(replayResult.assignments.map((a) => [a.requestId, a.roomId]));
    const changes = input.data.requests.map((request) => request.id).filter((requestId) => before.get(requestId) !== after.get(requestId))
      .map((requestId) => ({ requestId, beforeRoomId: before.get(requestId) ?? null, afterRoomId: after.get(requestId) ?? null }));
    return Response.json({
      runId: data.id, baseline: baselineResult, results: replay.results, explanation: replay.explanation,
      comparison: { baselineSolver: baselineResult.solver, replaySolver: replayResult.solver, changes }, changes,
    });
  } catch {
    return apiError(500, "LAB_REPLAY_FAILED", "Couldn't replay that Lab run right now.");
  }
}
