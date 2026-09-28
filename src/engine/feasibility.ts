// Hard constraints. Returns every violation so the UI can say "why not". Owner: Aaditya · A1
import type { EngineContext, EngineRequest, EngineRoom, Violation } from "@/contracts/engine";

export function hardViolations(_room: EngineRoom, _req: EngineRequest, _ctx: EngineContext): Violation[] {
  throw new Error("Not implemented yet (A1)");
}

export function isFeasible(room: EngineRoom, req: EngineRequest, ctx: EngineContext): boolean {
  return hardViolations(room, req, ctx).length === 0;
}
