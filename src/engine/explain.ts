// Template explanations (no LLM needed): why this room, why not, FCFS counterfactual. Owner: Aaditya · A7/A12
import type { EngineRequest, ScoreBreakdown, SolveResult, Violation } from "@/contracts/engine";

export function whyThisRoom(score: ScoreBreakdown, _runnerUp?: ScoreBreakdown): string[] {
  return score.notes.length > 0 ? [...score.notes] : ["Meets the request requirements"];
}

export function whyNot(roomCode: string, violations: Violation[]): string {
  const reasons = violations.map(({ message }) => message).filter(Boolean);
  return reasons.length > 0 ? `${roomCode}: ${reasons.join("; ")}` : `${roomCode} is available`;
}

/** "FCFS gave Coding Club room B first-come. It didn't need a projector, so the engine moved it to C…" */
export function counterfactual(_fcfs: SolveResult, _engine: SolveResult, _reqs: EngineRequest[]): string {
  throw new Error("Not implemented yet (A12)");
}
