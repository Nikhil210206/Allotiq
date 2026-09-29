// Greedy: priority desc, fewest candidates first, best score. Owner: Aaditya · A3
import type { Assignment, EngineContext, EngineRequest, SolveOptions, SolveResult, Solver, TraceEvent } from "@/contracts/engine";
import { isFeasible } from "../feasibility";
import { computeMetrics } from "../metrics";
import { scoreRoom } from "../score";

const BIG = 1000;

export const greedySolver: Solver = {
  name: "greedy",
  solve(reqs: EngineRequest[], ctx: EngineContext, _opts?: SolveOptions): SolveResult {
    const startTime = Date.now();
    const trace: TraceEvent[] = [];

    // Clone rooms so we can push temporary bookings without mutating caller's ctx
    const clonedRooms = ctx.rooms.map((r) => ({
      ...r,
      booked: [...r.booked],
    }));

    const clonedCtx: EngineContext = {
      ...ctx,
      rooms: clonedRooms,
    };

    // Calculate initial candidate counts for sorting
    const mustPlace = new Set(_opts?.mustPlace ?? []);
    const initialCandidateCounts = new Map<string, number>();
    for (const r of reqs) {
      initialCandidateCounts.set(r.id, ctx.rooms.reduce((count, room) => count + Number(isFeasible(room, r, ctx)), 0));
    }

    // Sort: priority desc, candidates asc, createdAt asc, id asc
    const sortedReqs = [...reqs].sort((a, b) => {
      if (mustPlace.has(a.id) !== mustPlace.has(b.id)) return mustPlace.has(a.id) ? -1 : 1;
      if (b.priority !== a.priority) return b.priority - a.priority;

      const cA = initialCandidateCounts.get(a.id) ?? 0;
      const cB = initialCandidateCounts.get(b.id) ?? 0;
      if (cA !== cB) return cA - cB;

      const tA = Date.parse(a.createdAt);
      const tB = Date.parse(b.createdAt);
      if (tA !== tB) return tA - tB;

      return a.id.localeCompare(b.id);
    });

    const assignmentMap = new Map<string, Assignment>();

    for (const req of sortedReqs) {
      // Find feasible rooms with current occupancy
      let bestRoom: (typeof clonedRooms)[0] | null = null;
      let bestScoreTotal = -Infinity;
      let bestScoreBreakdown = undefined;

      for (const room of clonedRooms) {
        if (!isFeasible(room, req, clonedCtx)) continue;

        const score = scoreRoom(room, req, clonedCtx);
        if (
          score.total > bestScoreTotal ||
          (score.total === bestScoreTotal && (!bestRoom || room.id < bestRoom.id))
        ) {
          bestRoom = room;
          bestScoreTotal = score.total;
          bestScoreBreakdown = score;
        }
      }

      if (bestRoom) {
        trace.push({ type: "try", requestId: req.id, roomId: bestRoom.id });
        trace.push({ type: "place", requestId: req.id, roomId: bestRoom.id });

        bestRoom.booked.push({
          requestId: req.id,
          interval: req.interval,
          priority: req.priority,
          status: "approved",
          movable: true,
        });

        assignmentMap.set(req.id, {
          requestId: req.id,
          roomId: bestRoom.id,
          interval: req.interval,
          score: bestScoreBreakdown,
        });
      } else {
        trace.push({ type: "blocked", requestId: req.id, reason: "No feasible room available" });
        assignmentMap.set(req.id, {
          requestId: req.id,
          roomId: null,
        });
      }
    }

    const assignments = reqs.map((r) => assignmentMap.get(r.id)!);
    const metricsBase = computeMetrics(assignments, reqs, clonedCtx);

    let objective = 0;
    for (const a of assignments) {
      if (a.roomId && a.score) {
        const req = reqs.find((r) => r.id === a.requestId);
        if (req) {
          objective += req.priority * BIG + a.score.total;
        }
      }
    }

    return {
      solver: "greedy",
      assignments,
      metrics: {
        ...metricsBase,
        ms: Date.now() - startTime,
        nodes: reqs.length,
        objective: Math.round(objective * 100) / 100,
      },
      timedOut: false,
      trace,
    };
  },
};
