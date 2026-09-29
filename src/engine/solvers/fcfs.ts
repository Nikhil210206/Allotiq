// First-come-first-served baseline: tightest fit, submission order. Owner: Aaditya · A3
import type { Assignment, EngineContext, EngineRequest, SolveOptions, SolveResult, Solver, TraceEvent } from "@/contracts/engine";
import { isFeasible } from "../feasibility";
import { computeMetrics } from "../metrics";
import { scoreRoom } from "../score";

const BIG = 1000;

export const fcfsSolver: Solver = {
  name: "fcfs",
  solve(reqs: EngineRequest[], ctx: EngineContext, _opts?: SolveOptions): SolveResult {
    const startTime = Date.now();
    const trace: TraceEvent[] = [];

    // Clone rooms so we can push temporary bookings to room.booked without mutating callers' ctx
    const clonedRooms = ctx.rooms.map((r) => ({
      ...r,
      booked: [...r.booked],
    }));

    const clonedCtx: EngineContext = {
      ...ctx,
      rooms: clonedRooms,
    };

    // Sort by submission order: createdAt asc, then id asc
    const sortedReqs = [...reqs].sort((a, b) => {
      const tA = Date.parse(a.createdAt);
      const tB = Date.parse(b.createdAt);
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });

    const assignmentMap = new Map<string, Assignment>();

    for (const req of sortedReqs) {
      let bestRoom: (typeof clonedRooms)[0] | null = null;
      let bestWasted = Infinity;
      let bestScoreTotal = -Infinity;
      let bestScoreBreakdown = undefined;

      for (const room of clonedRooms) {
        if (room.capacity < req.headcount) continue;
        if (!isFeasible(room, req, clonedCtx)) continue;

        const wasted = room.capacity - req.headcount;
        const score = scoreRoom(room, req, clonedCtx);

        if (
          wasted < bestWasted ||
          (wasted === bestWasted && score.total > bestScoreTotal) ||
          (wasted === bestWasted && score.total === bestScoreTotal && (!bestRoom || room.id < bestRoom.id))
        ) {
          bestRoom = room;
          bestWasted = wasted;
          bestScoreTotal = score.total;
          bestScoreBreakdown = score;
        }
      }

      if (bestRoom) {
        trace.push({ type: "try", requestId: req.id, roomId: bestRoom.id });
        trace.push({ type: "place", requestId: req.id, roomId: bestRoom.id });

        // Add temporary booking to room.booked
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
      solver: "fcfs",
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
