// Feasible rooms for a request, sorted by (score desc, roomId) — deterministic. Owner: Aaditya · A3
import type { Candidate, EngineContext, EngineRequest } from "@/contracts/engine";

export function candidates(_req: EngineRequest, _ctx: EngineContext): Candidate[] {
  throw new Error("Not implemented yet (A3)");
}
