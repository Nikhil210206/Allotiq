// Template explanations (no LLM needed): why this room, why not, FCFS counterfactual. Owner: Aaditya · A7/A12
import type { EngineRequest, ScoreBreakdown, SolveResult, Violation } from "@/contracts/engine";

export function whyThisRoom(_score: ScoreBreakdown, _runnerUp?: ScoreBreakdown): string[] {
  throw new Error("Not implemented yet (A7)");
}

export function whyNot(_roomCode: string, _violations: Violation[]): string {
  throw new Error("Not implemented yet (A7)");
}

/** "FCFS gave Coding Club room B first-come. It didn't need a projector, so the engine moved it to C…" */
export function counterfactual(_fcfs: SolveResult, _engine: SolveResult, _reqs: EngineRequest[]): string {
  throw new Error("Not implemented yet (A12)");
}
