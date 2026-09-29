// Branch & bound (engine default): priority-weighted objective, timeout → greedy incumbent. Owner: Aaditya · A3
import { ACTIVE_STATUSES } from "@/contracts/domain";
import type { Assignment, EngineContext, EngineRequest, EngineRoom, ScoreBreakdown, SolveOptions, SolveResult, Solver, TraceEvent } from "@/contracts/engine";
import { overlaps } from "../time";
import { isFeasible } from "../feasibility";
import { computeMetrics } from "../metrics";
import { scoreRoom } from "../score";
import { greedySolver } from "./greedy";

const BIG = 1000;

interface StaticCandidate {
  room: EngineRoom;
  score: ScoreBreakdown;
}

function requiredRequestsPlaced(assignments: Assignment[], required: Set<string>): boolean {
  const placed = new Set(assignments.filter((a) => a.roomId !== null).map((a) => a.requestId));
  return [...required].every((id) => placed.has(id));
}

function objectiveOf(assignments: Assignment[], reqs: EngineRequest[]): number {
  const byId = new Map(reqs.map((req) => [req.id, req]));
  return assignments.reduce((total, assignment) => {
    const req = byId.get(assignment.requestId);
    return total + (req && assignment.roomId && assignment.score ? req.priority * BIG + assignment.score.total : 0);
  }, 0);
}

function dynamicScore(candidate: StaticCandidate, hasBuildingActivity: boolean): ScoreBreakdown {
  const energy = hasBuildingActivity ? 1 : 0;
  const base = candidate.score;
  const total = 100 * (
    base.weights.capacityFit * base.capacityFit +
    base.weights.featureMatch * base.featureMatch +
    base.weights.proximity * base.proximity +
    base.weights.scarcity * base.scarcity +
    base.weights.preference * base.preference +
    base.weights.energy * energy
  );
  const notes = base.notes.filter((note) => note !== "Building already in use");
  if (energy === 1) notes.push("Building already in use");
  return { ...base, energy, total: Math.round(total * 100) / 100, notes };
}

export const bnbSolver: Solver = {
  name: "bnb",
  solve(reqs: EngineRequest[], ctx: EngineContext, opts?: SolveOptions): SolveResult {
    const startTime = Date.now();
    const timeoutMs = opts?.timeoutMs ?? 1500;
    const nodeLimit = opts?.nodeLimit ?? 200_000;
    const mustPlaceSet = new Set(opts?.mustPlace ?? []);
    const trace: TraceEvent[] = [];

    const rooms = ctx.rooms.map((room) => ({ ...room, booked: [...room.booked] }));
    const workingContext: EngineContext = { ...ctx, rooms };

    // Feasibility is static during search except for assignments made by this solve.
    // Cache each feasible room and its score once; DFS only checks temporary overlap
    // and updates the energy component as buildings become active.
    const staticCandidates = new Map<string, StaticCandidate[]>();
    for (const req of reqs) {
      const possible: StaticCandidate[] = [];
      for (const room of rooms) {
        if (!isFeasible(room, req, workingContext)) continue;
        const score = scoreRoom(room, req, workingContext);
        possible.push({ room, score });
      }
      staticCandidates.set(req.id, possible);
    }

    const activeByRoom = new Map<string, Array<{ start: string; end: string }>>();
    for (const room of rooms) {
      const active = activeByRoom.get(room.id) ?? [];
      for (const booking of room.booked) {
        if (ACTIVE_STATUSES.includes(booking.status as (typeof ACTIVE_STATUSES)[number])) active.push(booking.interval);
      }
      activeByRoom.set(room.id, active);
    }

    const greedyResult = greedySolver.solve(reqs, ctx, opts);
    const greedyIsValid = requiredRequestsPlaced(greedyResult.assignments, mustPlaceSet);
    let bestAssignments = [...greedyResult.assignments];
    let bestObjective = greedyIsValid ? greedyResult.metrics.objective : -Infinity;
    if (greedyIsValid) {
      trace.push({ type: "incumbent", objective: Math.round(bestObjective * 100) / 100, placed: greedyResult.metrics.placed });
    }

    const candidateCounts = new Map(reqs.map((req) => [req.id, staticCandidates.get(req.id)?.length ?? 0]));
    const candidateByRequestAndRoom = new Map<string, Map<string, StaticCandidate>>();
    for (const req of reqs) {
      candidateByRequestAndRoom.set(req.id, new Map((staticCandidates.get(req.id) ?? []).map((candidate) => [candidate.room.id, candidate])));
    }
    const sortedReqs = [...reqs].sort((a, b) => {
      const requiredOrder = Number(mustPlaceSet.has(b.id)) - Number(mustPlaceSet.has(a.id));
      if (requiredOrder !== 0) return requiredOrder;
      const countDiff = (candidateCounts.get(a.id) ?? 0) - (candidateCounts.get(b.id) ?? 0);
      if (countDiff !== 0) return countDiff;
      if (b.priority !== a.priority) return b.priority - a.priority;
      const timeDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
    });

    const maxPotentialScore = new Map<string, number>();
    for (const req of reqs) {
      const options = staticCandidates.get(req.id) ?? [];
      const maximum = options.reduce((best, candidate) => {
        const scoreCeiling = candidate.score.total + (1 - candidate.score.energy) * candidate.score.weights.energy * 100;
        return Math.max(best, scoreCeiling + 0.01);
      }, 0);
      maxPotentialScore.set(req.id, maximum);
    }
    const suffixUpperBound = new Array<number>(sortedReqs.length + 1).fill(0);
    for (let i = sortedReqs.length - 1; i >= 0; i--) {
      const req = sortedReqs[i];
      const hasCandidate = (staticCandidates.get(req.id)?.length ?? 0) > 0;
      const value = hasCandidate ? req.priority * BIG + (maxPotentialScore.get(req.id) ?? 0) : 0;
      suffixUpperBound[i] = suffixUpperBound[i + 1] + value;
    }

    let nodes = 0;
    let timedOut = false;
    const currentAssignments = new Map<string, Assignment>();
    const requiredFailure = new Map<string, string>();

    function hasDynamicConflict(room: EngineRoom, req: EngineRequest): boolean {
      return (temporaryByRoom.get(room.id) ?? []).some((interval) => overlaps(req.interval, interval));
    }

    const temporaryByRoom = new Map<string, Array<{ start: string; end: string }>>();

    function hasBuildingActivity(buildingId: string, req: EngineRequest, room: EngineRoom): boolean {
      return rooms.some((sibling) => {
        if (sibling.buildingId !== buildingId || sibling.id === room.id) return false;
        return (activeByRoom.get(sibling.id) ?? []).some((interval) => overlaps(req.interval, interval));
      });
    }

    function dfs(depth: number, currentObjective: number): void {
      nodes++;
      if (Date.now() - startTime >= timeoutMs || nodes >= nodeLimit) {
        timedOut = true;
        return;
      }

      if (depth === sortedReqs.length) {
        const assignments = reqs.map((req) => currentAssignments.get(req.id)!);
        if (!requiredRequestsPlaced(assignments, mustPlaceSet)) return;
        if (currentObjective > bestObjective) {
          bestObjective = currentObjective;
          bestAssignments = assignments;
          trace.push({
            type: "incumbent",
            objective: Math.round(bestObjective * 100) / 100,
            placed: bestAssignments.filter((assignment) => assignment.roomId !== null).length,
          });
        }
        return;
      }

      if (currentObjective + suffixUpperBound[depth] <= bestObjective) return;

      const req = sortedReqs[depth];
      const required = mustPlaceSet.has(req.id);
      const staticOptions = staticCandidates.get(req.id) ?? [];
      const available = staticOptions.filter(({ room }) => !hasDynamicConflict(room, req));
      if (required && available.length === 0) {
        requiredFailure.set(
          req.id,
          staticOptions.length === 0
            ? "No feasible room is available for this required request."
            : "Every feasible room conflicts with another required placement during this interval.",
        );
        return;
      }

      const ranked = available.map((candidate) => ({
        ...candidate,
        currentScore: dynamicScore(candidate, hasBuildingActivity(candidate.room.buildingId, req, candidate.room)),
      }));
      ranked.sort((a, b) => b.currentScore.total - a.currentScore.total || a.room.id.localeCompare(b.room.id));

      const seenEquivalentRooms = new Set<string>();
      for (const candidate of ranked) {
        const { room, currentScore } = candidate;
        const futureProfile = sortedReqs.slice(depth + 1).map((futureReq) => {
          const futureCandidate = candidateByRequestAndRoom.get(futureReq.id)?.get(room.id);
          return futureCandidate ? futureCandidate.score : null;
        });
        const equivalenceKey = JSON.stringify({
          room: {
            buildingId: room.buildingId,
            capacity: room.capacity,
            systems: room.systems,
            features: [...room.features].sort(),
            deptId: room.deptId,
            access: room.access,
            type: room.type,
            hours: room.hours,
            blackouts: room.blackouts,
            booked: room.booked,
          },
          temporaryBookings: temporaryByRoom.get(room.id) ?? [],
          currentScore,
          futureProfile,
        });
        if (seenEquivalentRooms.has(equivalenceKey)) continue;
        seenEquivalentRooms.add(equivalenceKey);

        const interval = req.interval;
        const roomIntervals = temporaryByRoom.get(room.id) ?? [];
        roomIntervals.push(interval);
        temporaryByRoom.set(room.id, roomIntervals);
        const activeRoomIntervals = activeByRoom.get(room.id) ?? [];
        activeRoomIntervals.push(interval);
        activeByRoom.set(room.id, activeRoomIntervals);

        currentAssignments.set(req.id, {
          requestId: req.id,
          roomId: room.id,
          interval: req.interval,
          score: currentScore,
        });
        dfs(depth + 1, currentObjective + req.priority * BIG + currentScore.total);
        currentAssignments.delete(req.id);

        activeRoomIntervals.pop();
        roomIntervals.pop();
        if (timedOut) return;
      }

      if (!required) {
        currentAssignments.set(req.id, { requestId: req.id, roomId: null });
        dfs(depth + 1, currentObjective);
        currentAssignments.delete(req.id);
      }
    }

    dfs(0, 0);

    const finalAssignments = reqs.map((req) => {
      const chosen = bestAssignments.find((assignment) => assignment.requestId === req.id) ?? { requestId: req.id, roomId: null };
      if (mustPlaceSet.has(req.id) && chosen.roomId === null) {
        return {
          ...chosen,
          reason: requiredFailure.get(req.id) ?? "No feasible placement was found within the solver limits.",
        };
      }
      return chosen;
    });
    const metrics = computeMetrics(finalAssignments, reqs, workingContext);
    const finalObjective = Number.isFinite(bestObjective) ? bestObjective : objectiveOf(finalAssignments, reqs);

    // Keep a meaningful final-plan summary without recording every explored node.
    if (trace.length === 0 || trace.at(-1)?.type !== "incumbent") {
      trace.push({
        type: "incumbent",
        objective: Math.round(finalObjective * 100) / 100,
        placed: metrics.placed,
      });
    }

    return {
      solver: "bnb",
      assignments: finalAssignments,
      metrics: {
        ...metrics,
        ms: Date.now() - startTime,
        nodes,
        objective: Math.round(finalObjective * 100) / 100,
      },
      timedOut,
      trace,
    };
  },
};
