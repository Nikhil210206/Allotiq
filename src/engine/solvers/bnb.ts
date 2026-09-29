// Branch & bound (engine default): lexicographic priority-weighted objective, timeout → greedy incumbent. Owner: Aaditya · A3
import type { Assignment, EngineContext, EngineRequest, SolveOptions, SolveResult, Solver, TraceEvent } from "@/contracts/engine";
import { candidates } from "../candidates";
import { isFeasible } from "../feasibility";
import { computeMetrics } from "../metrics";
import { scoreRoom } from "../score";
import { greedySolver } from "./greedy";

const BIG = 1000;

export const bnbSolver: Solver = {
  name: "bnb",
  solve(reqs: EngineRequest[], ctx: EngineContext, opts?: SolveOptions): SolveResult {
    const startTime = Date.now();
    const timeoutMs = opts?.timeoutMs ?? 1500;
    const nodeLimit = opts?.nodeLimit ?? 200_000;
    const mustPlaceSet = new Set(opts?.mustPlace ?? []);

    const trace: TraceEvent[] = [];

    // Clone rooms to maintain temporary bookings cleanly during DFS
    const clonedRooms = ctx.rooms.map((r) => ({
      ...r,
      booked: [...r.booked],
    }));

    const clonedCtx: EngineContext = {
      ...ctx,
      rooms: clonedRooms,
    };

    // 1. Run greedy first to obtain an initial incumbent baseline
    const greedyResult = greedySolver.solve(reqs, ctx, opts);
    let bestAssignments = [...greedyResult.assignments];
    let bestObjective = greedyResult.metrics.objective;

    trace.push({
      type: "incumbent",
      objective: Math.round(bestObjective * 100) / 100,
      placed: greedyResult.metrics.placed,
    });

    // Compute candidate counts for sorting
    const initialCandidateCounts = new Map<string, number>();
    for (const r of reqs) {
      initialCandidateCounts.set(r.id, candidates(r, ctx).length);
    }

    // Sort requests: priority desc, candidate count asc, createdAt asc, id asc
    const sortedReqs = [...reqs].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;

      const cA = initialCandidateCounts.get(a.id) ?? 0;
      const cB = initialCandidateCounts.get(b.id) ?? 0;
      if (cA !== cB) return cA - cB;

      const tA = Date.parse(a.createdAt);
      const tB = Date.parse(b.createdAt);
      if (tA !== tB) return tA - tB;

      return a.id.localeCompare(b.id);
    });

    // Precompute upper bounds for remaining requests from index i to N-1
    const remainingMaxObj = new Array<number>(sortedReqs.length + 1).fill(0);
    for (let i = sortedReqs.length - 1; i >= 0; i--) {
      remainingMaxObj[i] = remainingMaxObj[i + 1] + sortedReqs[i].priority * BIG + 100;
    }

    let nodeCount = 0;
    let timedOut = false;

    const currentAssignments = new Map<string, Assignment>();

    function dfs(depth: number, currentObj: number) {
      nodeCount++;

      // Check termination conditions
      if (Date.now() - startTime >= timeoutMs || nodeCount >= nodeLimit) {
        timedOut = true;
        return;
      }

      // Base case: all requests processed
      if (depth === sortedReqs.length) {
        // Verify mustPlace requirements
        if (mustPlaceSet.size > 0) {
          for (const reqId of mustPlaceSet) {
            const assign = currentAssignments.get(reqId);
            if (!assign || !assign.roomId) return;
          }
        }

        if (currentObj > bestObjective) {
          bestObjective = currentObj;
          bestAssignments = reqs.map((r) => currentAssignments.get(r.id)!);
          const placedCount = bestAssignments.filter((a) => a.roomId !== null).length;
          trace.push({
            type: "incumbent",
            objective: Math.round(bestObjective * 100) / 100,
            placed: placedCount,
          });
        }
        return;
      }

      // Upper bound pruning
      if (currentObj + remainingMaxObj[depth] <= bestObjective) {
        return;
      }

      const req = sortedReqs[depth];

      // Find feasible rooms with current occupancy
      const candidateRooms: Array<{ room: (typeof clonedRooms)[0]; score: ReturnType<typeof scoreRoom> }> = [];
      for (const room of clonedRooms) {
        if (isFeasible(room, req, clonedCtx)) {
          const score = scoreRoom(room, req, clonedCtx);
          candidateRooms.push({ room, score });
        }
      }

      // Sort candidate rooms by score descending, then roomId ascending
      candidateRooms.sort((a, b) => {
        if (b.score.total !== a.score.total) {
          return b.score.total - a.score.total;
        }
        return a.room.id.localeCompare(b.room.id);
      });

      // Branch 1: Try placing in feasible rooms
      for (const { room, score } of candidateRooms) {
        trace.push({ type: "try", requestId: req.id, roomId: room.id });

        const booking = {
          requestId: req.id,
          interval: req.interval,
          priority: req.priority,
          status: "approved" as const,
          movable: true,
        };

        // Push temporary booking
        room.booked.push(booking);
        trace.push({ type: "place", requestId: req.id, roomId: room.id });

        currentAssignments.set(req.id, {
          requestId: req.id,
          roomId: room.id,
          interval: req.interval,
          score,
        });

        const addedVal = req.priority * BIG + score.total;
        dfs(depth + 1, currentObj + addedVal);

        // Backtrack: pop temporary booking
        room.booked.pop();

        if (timedOut) return;
      }

      // Branch 2: Leave unplaced
      trace.push({ type: "blocked", requestId: req.id, reason: "No feasible room available" });
      currentAssignments.set(req.id, {
        requestId: req.id,
        roomId: null,
      });

      dfs(depth + 1, currentObj);

      currentAssignments.delete(req.id);
    }

    dfs(0, 0);

    const finalAssignments = reqs.map((r) => bestAssignments.find((a) => a.requestId === r.id)!);
    const metricsBase = computeMetrics(finalAssignments, reqs, clonedCtx);

    return {
      solver: "bnb",
      assignments: finalAssignments,
      metrics: {
        ...metricsBase,
        ms: Date.now() - startTime,
        nodes: nodeCount,
        objective: Math.round(bestObjective * 100) / 100,
      },
      timedOut,
      trace,
    };
  },
};
