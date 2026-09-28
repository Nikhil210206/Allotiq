// Priority bumping: rehome blockers at the same time first; bump-with-offer only if pending or > 24h away. Owner: Aaditya · A10
import type { EngineContext, EngineRequest, Plan } from "@/contracts/engine";

export function tryBump(_req: EngineRequest, _ctx: EngineContext): Plan | null {
  throw new Error("Not implemented yet (A10)");
}
