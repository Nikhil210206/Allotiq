// Phrase the engine's breakdown; numeric grounding check; template fallback. Owner: Aaditya · A14
import "server-only";
import type { Explanation } from "@/contracts/ai";
import type { ScoreBreakdown } from "@/contracts/engine";

export async function explainChoice(_score: ScoreBreakdown, _runnerUp?: ScoreBreakdown): Promise<Explanation> {
  throw new Error("Not implemented yet (A14)");
}
