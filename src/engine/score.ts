// Soft score: capacity fit, features, proximity, scarcity, preference, energy. Owner: Aaditya · A2
import type { EngineContext, EngineRequest, EngineRoom, ScoreBreakdown } from "@/contracts/engine";

export function scoreRoom(_room: EngineRoom, _req: EngineRequest, _ctx: EngineContext): ScoreBreakdown {
  throw new Error("Not implemented yet (A2)");
}
