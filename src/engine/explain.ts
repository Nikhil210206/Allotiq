// Template explanations (no LLM needed): why this room, why not, FCFS counterfactual. Owner: Aaditya · A7/A12
import type { EngineRequest, ScoreBreakdown, SolveResult, Violation } from "@/contracts/engine";

export function whyThisRoom(score: ScoreBreakdown, _runnerUp?: ScoreBreakdown): string[] {
  return score.notes.length > 0 ? [...score.notes] : ["Meets the request requirements"];
}

export function whyNot(roomCode: string, violations: Violation[]): string {
  const reasons = violations.map(({ message }) => message).filter(Boolean);
  return reasons.length > 0 ? `${roomCode}: ${reasons.join("; ")}` : `${roomCode} is available`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveRoomLabel(
  roomId: string | null,
  lookup?: Record<string, string> | Map<string, string>,
): string | null {
  if (!roomId) return null;
  if (lookup) {
    const code = lookup instanceof Map ? lookup.get(roomId) : lookup[roomId];
    if (code) return code;
  }
  if (!UUID_REGEX.test(roomId)) {
    return roomId;
  }
  return "a room";
}

function resolveRequestLabel(req?: EngineRequest, fallbackId?: string): string {
  if (req?.label && req.label.trim()) return req.label.trim();
  if (req?.id && !UUID_REGEX.test(req.id)) return req.id;
  if (fallbackId && !UUID_REGEX.test(fallbackId)) return fallbackId;
  if (req?.deptId) return `${req.deptId} request`;
  if (req?.headcount) return `Request for ${req.headcount} seats`;
  return "A request";
}

/** "FCFS gave Coding Club room B first-come. It didn't need a projector, so the engine moved it to C…" */
export function counterfactual(
  fcfs: SolveResult,
  engine: SolveResult,
  reqs: EngineRequest[],
  roomLookup?: Record<string, string> | Map<string, string>,
): string {
  const allRequestIds = Array.from(
    new Set([
      ...reqs.map((r) => r.id),
      ...fcfs.assignments.map((a) => a.requestId),
      ...engine.assignments.map((a) => a.requestId),
    ]),
  );

  if (allRequestIds.length === 0) {
    return "No requests to allocate.";
  }

  const reqMap = new Map(reqs.map((r) => [r.id, r]));
  const fcfsMap = new Map(fcfs.assignments.map((a) => [a.requestId, a]));
  const engineMap = new Map(engine.assignments.map((a) => [a.requestId, a]));

  const fcfsPlaced = fcfs.metrics?.placed ?? fcfs.assignments.filter((a) => a.roomId !== null).length;
  const fcfsTotal = fcfs.metrics?.total ?? (fcfs.assignments.length > 0 ? fcfs.assignments.length : allRequestIds.length);
  const engineSolverName = engine.solver === "bnb" ? "B&B" : (engine.solver ? engine.solver.toUpperCase() : "Engine");
  const enginePlaced = engine.metrics?.placed ?? engine.assignments.filter((a) => a.roomId !== null).length;
  const engineTotal = engine.metrics?.total ?? (engine.assignments.length > 0 ? engine.assignments.length : allRequestIds.length);

  const summary = `FCFS placed ${fcfsPlaced}/${fcfsTotal}; ${engineSolverName} placed ${enginePlaced}/${engineTotal}`;

  const changes: string[] = [];

  for (const requestId of allRequestIds) {
    const req = reqMap.get(requestId);
    const label = resolveRequestLabel(req, requestId);
    const fcfsAssignment = fcfsMap.get(requestId);
    const engineAssignment = engineMap.get(requestId);

    const beforeRoomId = fcfsAssignment?.roomId ?? null;
    const afterRoomId = engineAssignment?.roomId ?? null;

    if (beforeRoomId === afterRoomId) {
      continue;
    }

    if (beforeRoomId !== null && afterRoomId !== null) {
      const beforeRoom = resolveRoomLabel(beforeRoomId, roomLookup) ?? "a room";
      const afterRoom = resolveRoomLabel(afterRoomId, roomLookup) ?? "a room";
      let text = `${label} moved from ${beforeRoom} to ${afterRoom}`;

      if (engineAssignment?.reason) {
        text += ` (${engineAssignment.reason})`;
      } else if (engineAssignment?.score) {
        const positiveNote = engineAssignment.score.notes.find((n) => !n.includes("seats wasted"));
        if (positiveNote) {
          text += ` (${positiveNote})`;
        } else if (
          fcfsAssignment?.score &&
          engineAssignment.score.wastedSeats < fcfsAssignment.score.wastedSeats
        ) {
          const saved = fcfsAssignment.score.wastedSeats - engineAssignment.score.wastedSeats;
          text += ` (${saved} fewer wasted seat${saved > 1 ? "s" : ""})`;
        } else if (
          fcfsAssignment?.score &&
          engineAssignment.score.total > fcfsAssignment.score.total
        ) {
          text += ` (improved score: ${engineAssignment.score.total} vs ${fcfsAssignment.score.total})`;
        }
      }
      changes.push(text);
    } else if (beforeRoomId === null && afterRoomId !== null) {
      const afterRoom = resolveRoomLabel(afterRoomId, roomLookup) ?? "a room";
      let text = `${label} gained ${afterRoom}`;

      if (engineAssignment?.reason) {
        text += ` (${engineAssignment.reason})`;
      } else if (engineAssignment?.score) {
        const positiveNote = engineAssignment.score.notes.find((n) => !n.includes("seats wasted"));
        if (positiveNote) {
          text += ` (${positiveNote})`;
        } else if (engineAssignment.score.total > 0) {
          text += ` (score: ${engineAssignment.score.total})`;
        }
      }
      changes.push(text);
    } else if (beforeRoomId !== null && afterRoomId === null) {
      const beforeRoom = resolveRoomLabel(beforeRoomId, roomLookup) ?? "a room";
      let text = `${label} was placed by FCFS in ${beforeRoom} but not by ${engineSolverName}`;
      if (engineAssignment?.reason) {
        text += ` (${engineAssignment.reason})`;
      }
      changes.push(text);
    }
  }

  if (changes.length === 0) {
    const totalPlaced = fcfsPlaced + enginePlaced;
    return totalPlaced === 0
      ? `${summary}. No requests were placed.`
      : `${summary}. Allocations are identical.`;
  }

  return `${summary}. ${changes.join(". ")}.`;
}
