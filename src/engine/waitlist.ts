// Offer a freed slot to the best waitlisted request. Owner: Aaditya · A10
import type { Interval } from "@/contracts/domain";
import type { EngineContext, EngineRequest, Plan } from "@/contracts/engine";

export function refillFreedSlot(_roomId: string, _freed: Interval, _waitlisted: EngineRequest[], _ctx: EngineContext): Plan | null {
  throw new Error("Not implemented yet (A10)");
}
